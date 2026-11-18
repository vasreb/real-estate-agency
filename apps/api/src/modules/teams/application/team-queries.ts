import type { TeamList, TeamScope } from "@agency/contracts";
import type { Database } from "../../../infrastructure/database/index.js";
import { createTeamRepository } from "../infrastructure/team-repository.js";

export function createTeamQueries(options: { database: Database }) {
  const repository = createTeamRepository(options.database);
  return {
    async listTeams(userId: string): Promise<TeamList> {
      return { items: await repository.listForUser(userId) };
    },
    /** null for both missing and foreign teams, so callers answer one 404. */
    getAccessibleTeamScope(
      userId: string,
      teamId: string,
    ): Promise<TeamScope | null> {
      return repository.scopeForUser(userId, teamId);
    },
  };
}
export type TeamQueries = ReturnType<typeof createTeamQueries>;
