"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  ApiError,
  isUnauthenticated,
  queryKeys,
  resetPrivateCache,
} from "@/shared/api";

/**
 * Shared mutation lifecycle: targeted invalidation of this deal on success;
 * 403 refetches the deal so the UI reflects the current role; 401 drops
 * private data and returns to /login.
 */
export function useDocumentMutation<TVariables, TResult>(
  dealId: string,
  mutationFn: (variables: TVariables) => Promise<TResult>,
  onDone?: (result: TResult) => void,
) {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.deal(dealId) });
      onDone?.(result);
    },
    onError: async (error) => {
      if (isUnauthenticated(error)) {
        await resetPrivateCache(queryClient);
        router.replace("/login");
      } else if (error instanceof ApiError && error.status === 403) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.deal(dealId),
        });
      }
    },
  });
}
