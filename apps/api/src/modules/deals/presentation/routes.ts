import {
  dealDetailSchema,
  dealListSchema,
  uuidSchema,
} from "@agency/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { HttpError } from "../../../infrastructure/errors.js";
import type { DealQueries } from "../application/deal-queries.js";

const paramsSchema = z.strictObject({ dealId: uuidSchema });

export function registerDealRoutes(
  app: FastifyInstance,
  options: {
    deals: DealQueries;
    authenticate: (request: FastifyRequest) => Promise<{ userId: string }>;
  },
) {
  app.get("/api/deals", async (request) => {
    const { userId } = await options.authenticate(request);
    return dealListSchema.parse(await options.deals.listDeals(userId));
  });

  app.get("/api/deals/:dealId", async (request) => {
    // Authentication precedes validation and lookup: 401 → 400 → 404.
    const { userId } = await options.authenticate(request);
    const { dealId } = paramsSchema.parse(request.params);
    const detail = await options.deals.getDealDetail(userId, dealId);
    if (!detail) throw new HttpError("NOT_FOUND");
    return dealDetailSchema.parse(detail);
  });
}
