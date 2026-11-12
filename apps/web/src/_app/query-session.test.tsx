import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError, queryKeys, resetPrivateCache } from "@/shared/api";
import { createAppQueryClient } from "./providers";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

function Deals({ fetcher }: { fetcher: () => Promise<{ items: string[] }> }) {
  const query = useQuery({ queryKey: queryKeys.deals(), queryFn: fetcher });
  if (query.isError) return <p>error</p>;
  return <p>{query.data ? query.data.items.join(",") : "loading"}</p>;
}

describe("private query lifecycle", () => {
  it("drops all private data and redirects on a 401", async () => {
    const onUnauthenticated = vi.fn();
    const client = createAppQueryClient(onUnauthenticated);
    client.setQueryData(queryKeys.deal("a"), { secret: "previous user" });
    render(
      <QueryClientProvider client={client}>
        <Deals
          fetcher={() => Promise.reject(new ApiError(401, "UNAUTHENTICATED"))}
        />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(onUnauthenticated).toHaveBeenCalledTimes(1));
    expect(client.getQueryData(queryKeys.deal("a"))).toBeUndefined();
    // The still-mounted observer may recreate its query, but without old data.
    for (const query of client.getQueryCache().getAll())
      expect(query.state.data).toBeUndefined();
  });

  it("does not retry 4xx errors and keeps errors distinct from empty data", async () => {
    const fetcher = vi.fn(() => Promise.reject(new ApiError(403, "FORBIDDEN")));
    const client = createAppQueryClient(vi.fn());
    render(
      <QueryClientProvider client={client}>
        <Deals fetcher={fetcher} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("error")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("prevents a stale in-flight response from repopulating after an account switch", async () => {
    const client = createAppQueryClient(vi.fn());
    let resolveOld!: (value: { items: string[] }) => void;
    const pending = client.fetchQuery({
      queryKey: queryKeys.deals(),
      queryFn: () =>
        new Promise<{ items: string[] }>((resolve) => {
          resolveOld = resolve;
        }),
    });
    await resetPrivateCache(client);
    resolveOld({ items: ["user-a-deal"] });
    await pending.catch(() => undefined);
    expect(client.getQueryData(queryKeys.deals())).toBeUndefined();
    client.setQueryData(queryKeys.deals(), { items: ["user-b-deal"] });
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain("user-a");
  });
});
