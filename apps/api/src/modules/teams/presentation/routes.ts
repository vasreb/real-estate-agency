import { teamListSchema } from "@agency/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { TeamQueries } from "../application/team-queries.js";

export function registerTeamRoutes(
  app: FastifyInstance,
  options: {
    teams: TeamQueries;
    authenticate: (request: FastifyRequest) => Promise<{ userId: string }>;
  },
) {
  app.get("/api/teams", async (request) => {
    const { userId } = await options.authenticate(request);
    return teamListSchema.parse(await options.teams.listTeams(userId));
  });
}
