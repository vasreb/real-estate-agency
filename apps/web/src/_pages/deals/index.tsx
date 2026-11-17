"use client";

import type { DealList } from "@agency/contracts";
import { Alert, Button } from "@agency/ui";
import { useQuery } from "@tanstack/react-query";
import { DealsTable } from "@/entities/deal";
import { errorMessage, queryKeys, useApiClient } from "@/shared/api";
import { AppHeader } from "@/widgets/app-header";

/**
 * Rendering: dynamic server gate (`app/deals/page.tsx`) loads the list
 * uncached, then this client part owns refetching via TanStack Query.
 */
export function DealsPage({ initialData }: { initialData: DealList }) {
  const api = useApiClient();
  const query = useQuery({
    queryKey: queryKeys.deals(),
    queryFn: ({ signal }) => api.listDeals(signal),
    initialData,
  });
  return (
    <>
      <AppHeader />
      <main id="main" className="page">
        <h1>Deals</h1>
        {query.isError ? (
          <Alert>
            {errorMessage(query.error)}{" "}
            <Button variant="outline" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </Alert>
        ) : query.data.items.length === 0 ? (
          <p className="empty">No available deals</p>
        ) : (
          <>
            {query.isFetching && (
              <p className="muted" role="status">
                Updating…
              </p>
            )}
            <DealsTable items={query.data.items} />
          </>
        )}
      </main>
    </>
  );
}
