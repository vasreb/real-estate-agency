"use client";

import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ApiClientProvider,
  ApiError,
  isUnauthenticated,
  resetPrivateCache,
  type ApiClient,
} from "@/shared/api";

/**
 * In-memory QueryClient per browser session (no persistence). Any 401 from a
 * query drops all private data and sends the user to /login.
 */
export function createAppQueryClient(onUnauthenticated: () => void) {
  // One reset/redirect per lost session, even if several queries fail at once.
  let handlingUnauthenticated = false;
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (!isUnauthenticated(error) || handlingUnauthenticated) return;
        handlingUnauthenticated = true;
        void resetPrivateCache(client).then(onUnauthenticated);
      },
      onSuccess: () => {
        handlingUnauthenticated = false;
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 0,
        retry: (failureCount, error) =>
          !(
            error instanceof ApiError &&
            error.status >= 400 &&
            error.status < 500
          ) && failureCount < 2,
      },
      mutations: { retry: false },
    },
  });
  return client;
}

export function Providers({
  children,
  apiClient,
}: {
  children: ReactNode;
  apiClient?: ApiClient;
}) {
  const router = useRouter();
  const [queryClient] = useState(() =>
    createAppQueryClient(() => router.replace("/login")),
  );
  return (
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiClientProvider>
  );
}
