import { z } from "zod";

export const MAX_FILE_BYTES = 25_000_000;
export const MAX_REQUEST_BYTES = 26_000_000;
export const SESSION_COOKIE = "agency_session";
export const errorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "DOCUMENT_REFERENCED",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_FILE_TYPE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "ASSISTANT_UNAVAILABLE",
]);
export const apiErrorSchema = z.strictObject({
  code: errorCodeSchema,
  message: z.string(),
});
export type ApiErrorCode = z.infer<typeof errorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export * from "./schemas.js";
export * from "./operations.js";
