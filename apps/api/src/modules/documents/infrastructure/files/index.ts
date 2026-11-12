import { MAX_FILE_BYTES } from "@agency/contracts";
import { isStructurallyValidDocx } from "./docx.js";
import { normalizeFileName } from "./file-name.js";
import { isStructurallyValidPdf } from "./pdf.js";

export { normalizeFileName } from "./file-name.js";

export type DetectedFile = {
  mimeType:
    | "application/pdf"
    | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  fileName: string;
};

export class FileValidationError extends Error {
  constructor(readonly reason: "unsupported" | "too_large") {
    super(`File validation failed: ${reason}`);
    this.name = "FileValidationError";
  }
}

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DEFAULT_TIMEOUT_MS = 5000;

function startsWith(bytes: Uint8Array, bytesToMatch: number[]): boolean {
  if (bytes.length < bytesToMatch.length) return false;
  return bytesToMatch.every((b, i) => bytes[i] === b);
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04

/**
 * Content-based type detection and structural validation for PDF and DOCX.
 * This is NOT an antivirus or malware scanner: it only rejects files that are
 * not structurally well-formed documents within fixed resource bounds. The
 * input bytes are never modified and any client-declared MIME is ignored.
 * `options.timeoutMs` exists so tests can force the timeout path.
 */
export async function detectDocumentFile(
  bytes: Uint8Array,
  rawFileName: string,
  options: { timeoutMs?: number } = {},
): Promise<DetectedFile> {
  if (bytes.length > MAX_FILE_BYTES) throw new FileValidationError("too_large");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fileName = normalizeFileName(rawFileName);
  if (startsWith(bytes, PDF_MAGIC)) {
    if (await isStructurallyValidPdf(bytes, timeoutMs)) {
      return { mimeType: PDF_MIME, fileName };
    }
  } else if (startsWith(bytes, ZIP_MAGIC)) {
    if (await isStructurallyValidDocx(bytes, timeoutMs)) {
      return { mimeType: DOCX_MIME, fileName };
    }
  }
  throw new FileValidationError("unsupported");
}
