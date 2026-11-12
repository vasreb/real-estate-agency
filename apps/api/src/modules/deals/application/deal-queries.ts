import type {
  DealDetail,
  DealList,
  DealScope,
  DocumentMetadata,
} from "@agency/contracts";
import type { Database } from "../../../infrastructure/database/index.js";
import { createDealRepository } from "../infrastructure/deal-repository.js";

export type DealQueryOptions = {
  database: Database;
  /** Injected by the composition root to avoid a deals→documents dependency. */
  listDocumentMetadata: (dealId: string) => Promise<DocumentMetadata[]>;
};

export function createDealQueries(options: DealQueryOptions) {
  const repository = createDealRepository(options.database);
  return {
    async listDeals(userId: string): Promise<DealList> {
      return { items: await repository.listForUser(userId) };
    },
    /** null for both missing and foreign deals, so callers answer one 404. */
    async getDealDetail(
      userId: string,
      dealId: string,
    ): Promise<DealDetail | null> {
      const deal = await repository.findForUser(userId, dealId);
      if (!deal) return null;
      return {
        ...deal,
        documents: await options.listDocumentMetadata(deal.id),
      };
    },
    getAccessibleDealScope(
      userId: string,
      dealId: string,
    ): Promise<DealScope | null> {
      return repository.scopeForUser(userId, dealId);
    },
  };
}
export type DealQueries = ReturnType<typeof createDealQueries>;
