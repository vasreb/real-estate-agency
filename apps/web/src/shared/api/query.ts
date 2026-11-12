import type { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
  deals: () => ["deals"] as const,
  deal: (dealId: string) => ["deal", dealId] as const,
};

/**
 * Drops all private data on logout, 401, or account switch. In-flight queries
 * are cancelled first so a late response cannot repopulate the cache.
 */
export async function resetPrivateCache(queryClient: QueryClient) {
  await queryClient.cancelQueries();
  queryClient.clear();
}
