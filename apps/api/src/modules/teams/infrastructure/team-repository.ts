import type { Role, TeamList, TeamScope } from "@agency/contracts";
import type { Database } from "../../../infrastructure/database/index.js";

/** Every query is scoped by the user's current team_members rows. */
export function createTeamRepository(database: Database) {
  return {
    async listForUser(userId: string): Promise<TeamList["items"]> {
      const rows = await database.teamMember.findMany({
        where: { userId },
        orderBy: { team: { name: "asc" } },
        select: { role: true, team: { select: { id: true, name: true } } },
      });
      return rows.map((row) => ({
        id: row.team.id,
        name: row.team.name,
        role: row.role,
      }));
    },

    async scopeForUser(
      userId: string,
      teamId: string,
    ): Promise<TeamScope | null> {
      const row = await database.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId } },
        select: { role: true },
      });
      const role: Role | undefined = row?.role;
      return role ? { team_id: teamId, role } : null;
    },
  };
}
