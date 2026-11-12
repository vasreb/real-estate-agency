import type { ApiErrorCode } from "@agency/contracts";
import { ZodError } from "zod";

const messages: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: "Некорректные данные запроса",
  UNAUTHENTICATED: "Требуется вход в систему",
  FORBIDDEN: "Недостаточно прав для выполнения операции",
  NOT_FOUND: "Запись не найдена",
  DOCUMENT_REFERENCED: "Сначала удалите или отвяжите допсоглашения",
  PAYLOAD_TOO_LARGE: "Превышен допустимый размер запроса",
  UNSUPPORTED_FILE_TYPE: "Допускаются только корректные файлы PDF и DOCX",
  RATE_LIMITED: "Слишком много запросов. Повторите позже",
  INTERNAL_ERROR: "Внутренняя ошибка сервера",
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
