import type {
  ChatRequest,
  CreateDocumentInput,
  CreateTeamDocumentInput,
  DealDetail,
  DealList,
  DocumentMetadata,
  LoginInput,
  PatchDocumentInput,
  TeamDocument,
  TeamDocumentList,
  TeamList,
} from "@agency/contracts";
import type { paths } from "@agency/contracts/paths";
import createClient from "openapi-fetch";
import { ApiError, errorFromBody, toApiError } from "./errors";

type FetchLike = typeof fetch;
export type UploadInput = Omit<CreateDocumentInput, "status"> &
  Partial<Pick<CreateDocumentInput, "status">>;
export type TeamUploadInput = Omit<CreateTeamDocumentInput, "status"> &
  Partial<Pick<CreateTeamDocumentInput, "status">>;

/**
 * Browser API adapter: relative same-origin `/api/...` URLs only, cookies via
 * `credentials: "same-origin"`, no tokens in storage, no client cache layer.
 */
export function createApiClient(
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
) {
  const guarded: FetchLike = async (input, init) => {
    try {
      if (input instanceof Request)
        return await fetchImpl(
          new Request(input, { credentials: "same-origin" }),
        );
      return await fetchImpl(input, { ...init, credentials: "same-origin" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      throw new ApiError(0, "NETWORK_ERROR");
    }
  };
  // Same origin as the page; the browser never talks to the internal API host.
  const baseUrl = typeof window === "undefined" ? "" : window.location.origin;
  const client = createClient<paths>({ baseUrl, fetch: guarded });

  // openapi-fetch has already consumed the body; use its parsed `error`.
  function ensure<T>(result: {
    data?: T;
    error?: unknown;
    response: Response;
  }): T {
    if (!result.response.ok)
      throw errorFromBody(result.response.status, result.error);
    return result.data as T;
  }

  return {
    async login(body: LoginInput): Promise<void> {
      ensure(await client.POST("/api/auth/login", { body }));
    },
    async logout(): Promise<void> {
      ensure(await client.POST("/api/auth/logout", {}));
    },
    async listDeals(signal?: AbortSignal): Promise<DealList> {
      return ensure(await client.GET("/api/deals", { signal }));
    },
    async getDeal(dealId: string, signal?: AbortSignal): Promise<DealDetail> {
      return ensure(
        await client.GET("/api/deals/{dealId}", {
          params: { path: { dealId } },
          signal,
        }),
      );
    },
    async uploadDocument(
      dealId: string,
      input: UploadInput,
      file: File,
    ): Promise<DocumentMetadata> {
      const form = new FormData();
      for (const [key, value] of Object.entries(input))
        if (typeof value === "string") form.append(key, value);
      form.append("file", file, file.name);
      const response = await guarded(
        `/api/deals/${encodeURIComponent(dealId)}/documents`,
        { method: "POST", body: form },
      );
      if (!response.ok) throw await toApiError(response);
      return (await response.json()) as DocumentMetadata;
    },
    async patchDocument(
      documentId: string,
      body: PatchDocumentInput,
    ): Promise<DocumentMetadata> {
      return ensure(
        await client.PATCH("/api/documents/{documentId}", {
          params: { path: { documentId } },
          body,
        }),
      );
    },
    async listTeams(signal?: AbortSignal): Promise<TeamList> {
      return ensure(await client.GET("/api/teams", { signal }));
    },
    async listTeamDocuments(
      teamId: string,
      signal?: AbortSignal,
    ): Promise<TeamDocumentList> {
      return ensure(
        await client.GET("/api/teams/{teamId}/documents", {
          params: { path: { teamId } },
          signal,
        }),
      );
    },
    async uploadTeamDocument(
      teamId: string,
      input: TeamUploadInput,
      file: File,
    ): Promise<TeamDocument> {
      const form = new FormData();
      for (const [key, value] of Object.entries(input))
        if (typeof value === "string") form.append(key, value);
      form.append("file", file, file.name);
      const response = await guarded(
        `/api/teams/${encodeURIComponent(teamId)}/documents`,
        { method: "POST", body: form },
      );
      if (!response.ok) throw await toApiError(response);
      return (await response.json()) as TeamDocument;
    },
    async reindexDocument(documentId: string): Promise<TeamDocument> {
      return ensure(
        await client.POST("/api/documents/{documentId}/reindex", {
          params: { path: { documentId } },
        }),
      );
    },
    /**
     * The answer as newline-delimited JSON events (see `chatStreamEventSchema`).
     * Access and limit errors arrive as a normal HTTP error before the stream.
     */
    async chatStream(
      body: ChatRequest,
      signal?: AbortSignal,
    ): Promise<ReadableStream<Uint8Array>> {
      const stream = ensure(
        await client.POST("/api/chat/stream", {
          body,
          signal,
          parseAs: "stream",
        }),
      );
      if (!stream) throw new ApiError(0, "NETWORK_ERROR");
      return stream;
    },
    async deleteDocument(documentId: string): Promise<void> {
      ensure(
        await client.DELETE("/api/documents/{documentId}", {
          params: { path: { documentId } },
        }),
      );
    },
  };
}
export type ApiClient = ReturnType<typeof createApiClient>;

/** Same-origin download URL; the browser sends the HttpOnly cookie itself. */
export const documentFileUrl = (documentId: string) =>
  `/api/documents/${encodeURIComponent(documentId)}/file`;

/** Same-origin PDF preview; browsers open the given page from `#page=`. */
export const documentPreviewUrl = (documentId: string, page?: number) =>
  `/api/documents/${encodeURIComponent(documentId)}/preview${page ? `#page=${page}` : ""}`;
