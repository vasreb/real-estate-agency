import type { ApiErrorCode } from "@agency/contracts";
import { ZodError } from "zod";

const messages: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: "Invalid request data",
  UNAUTHENTICATED: "Sign-in required",
  FORBIDDEN: "You do not have permission to perform this operation",
  NOT_FOUND: "Record not found",
  DOCUMENT_REFERENCED: "Delete or unlink the amendments first",
  PAYLOAD_TOO_LARGE: "Request size limit exceeded",
  UNSUPPORTED_FILE_TYPE: "Only valid PDF and DOCX files are allowed",
  RATE_LIMITED: "Too many requests. Try again later",
  INTERNAL_ERROR: "Internal server error",
  ASSISTANT_UNAVAILABLE: "The assistant is temporarily unavailable",
};
const statuses: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  DOCUMENT_REFERENCED: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_FILE_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  ASSISTANT_UNAVAILABLE: 503,
};
export class HttpError extends Error {
  readonly statusCode: number;
  constructor(
    readonly code: ApiErrorCode,
    readonly retryAfter?: number,
  ) {
    super(messages[code]);
    this.statusCode = statuses[code];
  }
}
export function publicError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof ZodError) return new HttpError("VALIDATION_ERROR");
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE")
      return new HttpError("PAYLOAD_TOO_LARGE");
    if (
      error.code === "FST_ERR_CTP_INVALID_JSON_BODY" ||
      error.code === "FST_ERR_CTP_EMPTY_JSON_BODY"
    )
      return new HttpError("VALIDATION_ERROR");
    if (error.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE")
      return new HttpError("UNSUPPORTED_FILE_TYPE");
    // @fastify/multipart limits and malformed multipart bodies.
    if (
      [
        "FST_PARTS_LIMIT",
        "FST_FILES_LIMIT",
        "FST_FIELDS_LIMIT",
        "FST_REQ_FILE_TOO_LARGE",
      ].includes(String(error.code))
    )
      return new HttpError("PAYLOAD_TOO_LARGE");
    if (
      [
        "FST_PROTO_VIOLATION",
        "FST_INVALID_MULTIPART_CONTENT_TYPE",
        "FST_INVALID_JSON_FIELD_ERROR",
      ].includes(String(error.code))
    )
      return new HttpError("VALIDATION_ERROR");
  }
  return new HttpError("INTERNAL_ERROR");
}
