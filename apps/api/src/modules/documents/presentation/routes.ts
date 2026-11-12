import {
  createDocumentSchema,
  documentMetadataSchema,
  MAX_FILE_BYTES,
  MAX_REQUEST_BYTES,
  patchDocumentSchema,
  uuidSchema,
} from "@agency/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { HttpError } from "../../../infrastructure/errors.js";
import type { SlotLimiter } from "../../../infrastructure/security/concurrency.js";
import type { DocumentCommands } from "../application/document-commands.js";
import {
  detectDocumentFile,
  FileValidationError,
} from "../infrastructure/files/index.js";
import { attachmentHeader } from "./content-disposition.js";

const documentParams = z.strictObject({ documentId: uuidSchema });
const dealParams = z.strictObject({ dealId: uuidSchema });
const UPLOAD_FIELDS = new Set([
  "title",
  "type",
  "document_number",
  "document_date",
  "effective_from",
  "status",
  "parent_document_id",
]);

export const multipartLimits = {
  fields: UPLOAD_FIELDS.size,
  files: 1,
  parts: UPLOAD_FIELDS.size + 1,
  fieldSize: 8192,
  fieldNameSize: 100,
  fileSize: MAX_FILE_BYTES,
};

type Authenticate = (request: FastifyRequest) => Promise<{ userId: string }>;

/** Reads the multipart stream after authorization; bounded by plugin limits and a total-bytes counter. */
async function readUpload(request: FastifyRequest) {
  if (!request.isMultipart()) throw new HttpError("VALIDATION_ERROR");
  const fields: Record<string, string> = {};
  let file: { bytes: Buffer; fileName: string } | undefined;
  const parts = request.parts({ limits: multipartLimits });
  let received = 0;
  const raw = request.raw;
  const countBytes = (chunk: Buffer) => {
    received += chunk.length;
    if (received > MAX_REQUEST_BYTES) {
      raw.off("data", countBytes);
      // @fastify/multipart listens for request errors: it unpipes busboy and
      // rejects the parts iterator. The socket stays open (no destroy) so the
      // client still receives 413; the rest of the body is drained, not parsed.
      raw.emit("error", new HttpError("PAYLOAD_TOO_LARGE"));
      raw.resume();
    }
  };
  raw.on("data", countBytes);
  try {
    for await (const part of parts) {
      if (part.type === "file") {
        if (part.fieldname !== "file" || file) {
          part.file.resume();
          throw new HttpError("VALIDATION_ERROR");
        }
        const bytes = await part.toBuffer();
        if (part.file.truncated) throw new HttpError("PAYLOAD_TOO_LARGE");
        // Filename byte bound (UTF-8) per the multipart policy.
        if (Buffer.byteLength(part.filename ?? "", "utf8") > 1024)
          throw new HttpError("PAYLOAD_TOO_LARGE");
        file = { bytes, fileName: part.filename ?? "" };
      } else {
        if (part.fieldnameTruncated || part.valueTruncated)
          throw new HttpError("PAYLOAD_TOO_LARGE");
        if (
          !UPLOAD_FIELDS.has(part.fieldname) ||
          part.fieldname in fields ||
          typeof part.value !== "string"
        )
          throw new HttpError("VALIDATION_ERROR");
        fields[part.fieldname] = part.value;
      }
    }
  } catch (error) {
    if (received > MAX_REQUEST_BYTES) throw new HttpError("PAYLOAD_TOO_LARGE");
    if (error instanceof HttpError) throw error;
    // Known plugin limit errors carry FST_* codes and are mapped centrally.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      String(error.code).startsWith("FST_")
    )
      throw error;
    // Truncated or malformed multipart (busboy parse errors, aborted stream).
    throw new HttpError("VALIDATION_ERROR");
  } finally {
    raw.off("data", countBytes);
  }
  if (received > MAX_REQUEST_BYTES) throw new HttpError("PAYLOAD_TOO_LARGE");
  if (!file) throw new HttpError("VALIDATION_ERROR");
  return { fields, file };
}

export function registerDocumentRoutes(
  app: FastifyInstance,
  options: {
    documents: DocumentCommands;
    authenticate: Authenticate;
    uploadSlots: SlotLimiter;
  },
) {
  const { documents, authenticate } = options;

  app.post(
    "/api/deals/:dealId/documents",
    { bodyLimit: MAX_REQUEST_BYTES },
    async (request, reply) => {
      // Session, id and role are checked before any byte of the body is read.
      const { userId } = await authenticate(request);
      const { dealId } = dealParams.parse(request.params);
      await documents.authorizeDealWrite(userId, dealId);
      const declared = Number(request.headers["content-length"]);
      if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES)
        throw new HttpError("PAYLOAD_TOO_LARGE");
      const release = options.uploadSlots.tryAcquire();
      if (!release) throw new HttpError("RATE_LIMITED", 1);
      try {
        const { fields, file } = await readUpload(request);
        const input = createDocumentSchema.parse(fields);
        let detected;
        try {
          detected = await detectDocumentFile(file.bytes, file.fileName);
        } catch (error) {
          if (error instanceof FileValidationError)
            throw new HttpError(
              error.reason === "too_large"
                ? "PAYLOAD_TOO_LARGE"
                : "UNSUPPORTED_FILE_TYPE",
            );
          throw error;
        }
        const metadata = await documents.createDocument(userId, dealId, input, {
          bytes: new Uint8Array(file.bytes),
          fileName: detected.fileName,
          mimeType: detected.mimeType,
        });
        return reply.code(201).send(documentMetadataSchema.parse(metadata));
      } finally {
        release();
      }
    },
  );

  app.get("/api/documents/:documentId/file", async (request, reply) => {
    const { userId } = await authenticate(request);
    const { documentId } = documentParams.parse(request.params);
    const file = await documents.readDocumentFile(userId, documentId);
    return reply
      .header("Content-Type", file.mimeType)
      .header("Content-Disposition", attachmentHeader(file.fileName))
      .header("X-Content-Type-Options", "nosniff")
      .send(Buffer.from(file.bytes));
  });

  app.patch("/api/documents/:documentId", async (request) => {
    const { userId } = await authenticate(request);
    const { documentId } = documentParams.parse(request.params);
    const patch = patchDocumentSchema.parse(request.body ?? undefined);
    return documentMetadataSchema.parse(
      await documents.updateDocument(userId, documentId, patch),
    );
  });

  app.delete("/api/documents/:documentId", async (request, reply) => {
    const { userId } = await authenticate(request);
    const { documentId } = documentParams.parse(request.params);
    await documents.deleteDocument(userId, documentId);
    return reply.code(204).send();
  });
}
