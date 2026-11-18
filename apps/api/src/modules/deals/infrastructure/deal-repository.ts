import type { DealListItem, DealScope, Role } from "@agency/contracts";
import type { Database } from "../../../infrastructure/database/index.js";

/** Every query is scoped by the user's current team_members rows. */
export function createDealRepository(database: Database) {
  const memberOf = (userId: string) => ({ members: { some: { userId } } });
  return {
    async listForUser(userId: string): Promise<DealListItem[]> {
      const rows = await database.deal.findMany({
        where: { team: memberOf(userId) },
        orderBy: [{ team: { name: "asc" } }, { number: "asc" }],
        select: {
          id: true,
          number: true,
          type: true,
          client: { select: { name: true } },
          property: { select: { address: true } },
          teamId: true,
          team: { select: { name: true } },
        },
      });
      return rows.map((row) => ({
        id: row.id,
        number: row.number,
        type: row.type,
        client_name: row.client.name,
        property_address: row.property.address,
        team_id: row.teamId,
        team_name: row.team.name,
      }));
    },

    async findForUser(userId: string, dealId: string) {
      const row = await database.deal.findFirst({
        where: { id: dealId, team: memberOf(userId) },
        select: {
          id: true,
          number: true,
          type: true,
          client: { select: { id: true, name: true } },
          property: { select: { id: true, address: true } },
          team: {
            select: {
              id: true,
              name: true,
              members: { where: { userId }, select: { role: true } },
            },
          },
        },
      });
      const role: Role | undefined = row?.team.members[0]?.role;
      if (!row || !role) return null;
      return {
        id: row.id,
        number: row.number,
        type: row.type,
        client: row.client,
        property: row.property,
        team: { id: row.team.id, name: row.team.name },
        role,
      };
    },

    async scopeForUser(
      userId: string,
      dealId: string,
    ): Promise<DealScope | null> {
      const row = await database.deal.findFirst({
        where: { id: dealId, team: memberOf(userId) },
        select: {
          id: true,
          teamId: true,
          team: {
            select: { members: { where: { userId }, select: { role: true } } },
          },
        },
      });
      const role = row?.team.members[0]?.role;
      return row && role ? { id: row.id, team_id: row.teamId, role } : null;
    },
  };
}
