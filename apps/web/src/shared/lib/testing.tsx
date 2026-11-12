import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { ApiClientProvider, type ApiClient } from "@/shared/api";

/** Test-only: every API method is a mock that fails loudly unless stubbed. */
export function fakeApi(overrides: Partial<ApiClient> = {}): ApiClient {
  const unexpected = (name: string) =>
    vi.fn(() => Promise.reject(new Error(`Unexpected API call: ${name}`)));
  return {
    login: unexpected("login"),
    logout: unexpected("logout"),
    listDeals: unexpected("listDeals"),
    getDeal: unexpected("getDeal"),
    uploadDocument: unexpected("uploadDocument"),
    patchDocument: unexpected("patchDocument"),
    deleteDocument: unexpected("deleteDocument"),
    ...overrides,
  };
}

export function renderWithProviders(
  ui: ReactElement,
  api: ApiClient = fakeApi(),
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  }),
) {
  return {
    queryClient,
    ...render(
      <ApiClientProvider client={api}>
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
      </ApiClientProvider>,
    ),
  };
}

export const routerMock = {
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
};
