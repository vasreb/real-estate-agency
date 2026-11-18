// Client-safe public API. Server gates live in "@/shared/api/server".
export {
  createApiClient,
  documentFileUrl,
  documentPreviewUrl,
  type ApiClient,
  type TeamUploadInput,
  type UploadInput,
} from "./client";
export { ApiError, errorMessage, isUnauthenticated } from "./errors";
export { queryKeys, resetPrivateCache } from "./query";
export { ApiClientProvider, useApiClient } from "./context";
