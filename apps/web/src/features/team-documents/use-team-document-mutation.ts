"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  ApiError,
  isUnauthenticated,
  queryKeys,
  resetPrivateCache,
} from "@/shared/api";

/** Targeted invalidation of one team's list; 401 returns to /login. */
export function useTeamDocumentMutation<TVariables, TResult>(
  teamId: string,
  mutationFn: (variables: TVariables) => Promise<TResult>,
  onDone?: (result: TResult) => void,
) {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.teamDocuments(teamId),
      });
      onDone?.(result);
    },
    onError: async (error) => {
      if (isUnauthenticated(error)) {
        await resetPrivateCache(queryClient);
        router.replace("/login");
      } else if (error instanceof ApiError && error.status === 403) {
        // The role changed: refresh teams so the page reflects it.
        await queryClient.invalidateQueries({ queryKey: queryKeys.teams() });
      }
    },
  });
}
