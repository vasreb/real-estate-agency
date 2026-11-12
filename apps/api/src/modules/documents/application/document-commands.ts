import type {
  CreateDocumentInput,
  DealScope,
  DocumentMetadata,
  PatchDocumentInput,
} from "@agency/contracts";
import type { Database } from "../../../infrastructure/database/index.js";
import { HttpError } from "../../../infrastructure/errors.js";
import {
  parentRequirement,
  toDocumentUpdate,
  toSqlDate,
} from "../domain/document-rules.js";
import { postgresError } from "../infrastructure/database-errors.js";
import {
  documentMetadataSelect,
  toDocumentMetadata,
} from "../infrastructure/metadata-reader.js";

export type DocumentCommandOptions = {
  database: Database;
  /** Injected from the deals module by the composition root. */
  getAccessibleDealScope: (
    userId: string,
    dealId: string,
  ) => Promise<DealScope | null>;
};

export type StoredFile = {
  bytes: Uint8Array<ArrayBuffer>;
  fileName: string;
  mimeType: string;
};

type Transaction = Parameters<Parameters<Database["$transaction"]>[0]>[0];

const PARENT_FK = "documents_parent_same_deal_fk";

export function createDocumentCommands(options: DocumentCommandOptions) {
  const { database } = options;

  /** 404 for missing or foreign deals (checked first), then 403 for members. */
  async function authorizeDealWrite(
    userId: string,
    dealId: string,
  ): Promise<DealScope> {
    const scope = await options.getAccessibleDealScope(userId, dealId);
    if (!scope) throw new HttpError("NOT_FOUND");
    if (scope.role !== "admin") throw new HttpError("FORBIDDEN");
    return scope;
  }

  async function findDocumentScope(userId: string, documentId: string) {
    const document = await database.document.findUnique({
      where: { id: documentId },
      select: { id: true, dealId: true },
    });
    const scope = document
      ? await options.getAccessibleDealScope(userId, document.dealId)
      : null;
    if (!document || !scope) throw new HttpError("NOT_FOUND");
    return { document, scope };
  }

  /**
   * Locks the parent with FOR KEY SHARE so a concurrent delete either waits
   * (and then fails with RESTRICT) or wins first (and the lookup finds nothing).
   * Generic 400 never reveals whether a parent exists in another deal.
   */
  async function assertLinkableParent(
    tx: Transaction,
    dealId: string,
    parentId: string,
  ) {
    const rows = await tx.$queryRaw<{ type: string }[]>`
      SELECT type::text AS type FROM documents
      WHERE id = ${parentId}::uuid AND deal_id = ${dealId}::uuid
      FOR KEY SHARE`;
    if (rows[0]?.type !== "contract") throw new HttpError("VALIDATION_ERROR");
  }

  function mapParentWriteError(error: unknown): never {
    const db = postgresError(error);
    if (db.code === "23503" && db.constraint === PARENT_FK)
      throw new HttpError("VALIDATION_ERROR");
    throw error;
  }

  return {
    authorizeDealWrite,

    async createDocument(
      userId: string,
      dealId: string,
      input: CreateDocumentInput,
      file: StoredFile,
    ): Promise<DocumentMetadata> {
      const scope = await authorizeDealWrite(userId, dealId);
      const requirement = parentRequirement(
        input.type,
        input.parent_document_id,
        "",
      );
      if (requirement === "invalid") throw new HttpError("VALIDATION_ERROR");
      try {
        const row = await database.$transaction(async (tx) => {
          if (requirement === "lookup")
            await assertLinkableParent(tx, scope.id, input.parent_document_id!);
          return tx.document.create({
            data: {
              dealId: scope.id,
              type: input.type,
              title: input.title,
              status: input.status,
              documentNumber: input.document_number ?? null,
              documentDate: input.document_date
                ? toSqlDate(input.document_date)
                : null,
              effectiveFrom: input.effective_from
                ? toSqlDate(input.effective_from)
                : null,
              parentDocumentId: input.parent_document_id ?? null,
              fileName: file.fileName,
              mimeType: file.mimeType,
              fileData: file.bytes,
            },
            select: documentMetadataSelect,
          });
        });
        return toDocumentMetadata(row);
      } catch (error) {
        return mapParentWriteError(error);
      }
    },

    async updateDocument(
      userId: string,
      documentId: string,
      patch: PatchDocumentInput,
    ): Promise<DocumentMetadata> {
      const { document, scope } = await findDocumentScope(userId, documentId);
      if (scope.role !== "admin") throw new HttpError("FORBIDDEN");
      const data = toDocumentUpdate(patch);
      try {
        const row = await database.$transaction(async (tx) => {
          const locked = await tx.$queryRaw<{ type: string }[]>`
            SELECT type::text AS type FROM documents
            WHERE id = ${document.id}::uuid FOR UPDATE`;
          const type = locked[0]?.type as DocumentMetadata["type"] | undefined;
          if (!type) throw new HttpError("NOT_FOUND");
          const requirement = parentRequirement(
            type,
            data.parentDocumentId,
            document.id,
          );
          if (requirement === "invalid")
            throw new HttpError("VALIDATION_ERROR");
          if (requirement === "lookup")
            await assertLinkableParent(
              tx,
              document.dealId,
              data.parentDocumentId!,
            );
          return tx.document.update({
            where: { id: document.id },
            data,
            select: documentMetadataSelect,
          });
        });
        return toDocumentMetadata(row);
      } catch (error) {
        return mapParentWriteError(error);
      }
    },

    async deleteDocument(userId: string, documentId: string): Promise<void> {
      const { document, scope } = await findDocumentScope(userId, documentId);
      if (scope.role !== "admin") throw new HttpError("FORBIDDEN");
      try {
        const { count } = await database.document.deleteMany({
          where: { id: document.id },
        });
        if (count === 0) throw new HttpError("NOT_FOUND");
      } catch (error) {
        const db = postgresError(error);
        // The database RESTRICT constraint is the source of truth (no count-then-delete).
        if (
          (db.code === "23001" || db.code === "23503") &&
          db.constraint === PARENT_FK
        )
          throw new HttpError("DOCUMENT_REFERENCED");
        throw error;
      }
    },

    /** Members may read; bytes are loaded only after the scope check. */
    async readDocumentFile(
      userId: string,
      documentId: string,
    ): Promise<StoredFile> {
      const { document } = await findDocumentScope(userId, documentId);
      const row = await database.document.findUnique({
        where: { id: document.id },
        select: { fileData: true, fileName: true, mimeType: true },
      });
      if (!row) throw new HttpError("NOT_FOUND");
      return {
        bytes: row.fileData,
        fileName: row.fileName,
        mimeType: row.mimeType,
      };
    },
  };
}
export type DocumentCommands = ReturnType<typeof createDocumentCommands>;
