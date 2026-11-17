import { apiErrorSchema, type ApiErrorCode } from "@agency/contracts";

/** Typed API failure; `status` 0 means the request never reached the API. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | "NETWORK_ERROR",
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export function errorFromBody(status: number, body: unknown): ApiError {
  const parsed = apiErrorSchema.safeParse(body);
  const code: ApiErrorCode = parsed.success
    ? parsed.data.code
    : "INTERNAL_ERROR";
  return new ApiError(status, code);
}

export async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body (e.g. proxy error page): keep the generic code.
  }
  return errorFromBody(response.status, body);
}

export const isUnauthenticated = (error: unknown) =>
  error instanceof ApiError && error.status === 401;

/** User-facing messages; never echo server text or submitted values. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError))
    return "The request failed. Please try again.";
  switch (error.code) {
    case "NETWORK_ERROR":
      return "Cannot reach the server. Check your connection and try again.";
    case "UNAUTHENTICATED":
      return "Your session has ended. Please sign in again.";
    case "FORBIDDEN":
      return "You do not have permission for this action.";
    case "NOT_FOUND":
      return "The record was not found or is unavailable.";
    case "VALIDATION_ERROR":
      return "Please check the form fields.";
    case "DOCUMENT_REFERENCED":
      return "The contract cannot be deleted while amendments are linked to it. Delete or unlink them first.";
    case "PAYLOAD_TOO_LARGE":
      return "The file is too large: the maximum size is 25 MB.";
    case "UNSUPPORTED_FILE_TYPE":
      return "Only valid PDF and DOCX files are allowed.";
    case "RATE_LIMITED":
      return "Too many attempts. Please try again later.";
    default:
      return "Internal server error. Please try again later.";
  }
}
