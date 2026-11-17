import { stableId, type PublicEntities } from "../model.js";

export const teamKeys = ["north-sales", "north-lettings", "west"] as const;
export function makeStaff() {
  const teams = [
    "North London Sales",
    "North London Lettings",
    "West London Residential",
  ].map((name, i) => ({ id: stableId(`team/${teamKeys[i]!}`), name }));
  const definitions = [
    ["north-sales-admin", "Mara Ashcombe", 0, "admin"],
    ["north-sales-agent-1", "Felix Rowanby", 0, "member"],
    ["north-sales-agent-2", "Elena Merewood", 0, "member"],
    ["north-lettings-admin", "Tessa Fenwicke", 1, "admin"],
    ["north-lettings-agent-1", "Noah Alderstone", 1, "member"],
    ["north-lettings-agent-2", "Priya Wrenford", 1, "member"],
    ["west-admin", "Jonah Valehurst", 2, "admin"],
    ["west-agent", "Ada Brackenwell", 2, "member"],
    ["operations-lead", "Iris Northcott", null, null],
    ["cross-team-agent", "Leon Brookmere", null, null],
  ] as const;
  const staff = definitions.map(([key, display_name]) => ({
    key,
    display_name,
    user_id: stableId(`user/${key}`),
    fictional: true as const,
  }));
  const users = staff.map((person) => ({
    id: person.user_id,
    email: `${person.key}@northbridge-vale.example`,
  }));
  const team_members: PublicEntities["team_members"] = definitions.flatMap(
    ([key, , index, role]) =>
      index === null || role === null
        ? []
        : [
            {
              team_id: teams[index]!.id,
              user_id: stableId(`user/${key}`),
              role,
            },
          ],
  );
  for (const team of teams)
    team_members.push({
      team_id: team.id,
      user_id: staff[8]!.user_id,
      role: "admin",
    });
  team_members.push(
    { team_id: teams[0]!.id, user_id: staff[9]!.user_id, role: "member" },
    { team_id: teams[1]!.id, user_id: staff[9]!.user_id, role: "admin" },
  );
  return { teams, users, team_members, staff };
}
