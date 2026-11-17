import { dateSchema, uuidSchema } from "@agency/contracts";
import { entitiesSchema, stableId, type PublicEntities } from "../model.js";
import { makeStaff } from "./staff.js";
import { makeClients } from "./clients.js";
import { makeProperties } from "./properties.js";
import { makeCounterparties } from "./actors.js";

export function makeProfiles() {
  const staff = makeStaff();
  const clients = makeClients();
  const properties = makeProperties();
  const counters = new Map<string, number>();
  const deals: PublicEntities["deals"] = Array.from({ length: 120 }, (_, i) => {
    // Initial 54 rentals + 42 sales; subsequent 18 relets + 6 rental-to-sale matters.
    // Bijection across all 96 profiles: avoid assigning every house to sales and
    // every initial rental to a small flat merely because categories are grouped.
    const propertyIndex = ((i < 96 ? i : i - 96) * 37) % 96;
    const rental = i < 54 || (i >= 96 && i < 114);
    const teamIndex = rental
      ? i < 96
        ? i < 42
          ? 1
          : 2
        : i < 110
          ? 1
          : 2
      : i < 96
        ? i < 90
          ? 0
          : 2
        : i < 118
          ? 0
          : 2;
    const year = i < 48 || (i >= 54 && i < 78) ? "2025" : "2026";
    const sequenceKey = `${teamIndex}/${year}`;
    const sequence = (counters.get(sequenceKey) ?? 0) + 1;
    counters.set(sequenceKey, sequence);
    return {
      id: stableId(`deal/${String(i + 1).padStart(3, "0")}`),
      number: `${year}-${String(sequence).padStart(3, "0")}`,
      type: rental ? "rental" : "sale",
      client_id: clients.clients[propertyIndex % 80]!.id,
      property_id: properties.properties[propertyIndex]!.id,
      team_id: staff.teams[teamIndex]!.id,
    };
  });
  const possession = deals.flatMap((deal, i) =>
    deal.type !== "rental" || i >= 100
      ? []
      : [
          {
            deal_id: deal.id,
            property_id: deal.property_id,
            tenant_key: `counterparty/${String(i + 1).padStart(3, "0")}`,
            start: i < 30 ? "2025-03-01" : i < 48 ? "2025-11-01" : "2026-06-01",
            end: i < 30 ? "2025-12-31" : null,
          },
        ],
  );
  return {
    entities: {
      teams: staff.teams,
      users: staff.users,
      team_members: staff.team_members,
      clients: clients.clients,
      properties: properties.properties,
      deals,
    },
    staff: staff.staff,
    principals: clients.principals,
    actors: [
      ...clients.actors,
      ...makeCounterparties(deals),
      {
        key: "agency/northbridge-vale",
        name: "Northbridge & Vale Residential",
        role: "agency" as const,
        email: "operations-lead@northbridge-vale.example",
        signatory_keys: ["agency/operations-lead"],
      },
      {
        key: "agency/operations-lead",
        name: staff.staff[8]!.display_name,
        role: "representative" as const,
        email: "operations-lead@northbridge-vale.example",
        signatory_keys: ["agency/operations-lead"],
      },
    ],
    properties: properties.profiles,
    possession,
  };
}
export type Profiles = ReturnType<typeof makeProfiles>;

export function validateProfiles(profiles: Profiles): void {
  const entities = entitiesSchema.parse(profiles.entities);
  const expected = {
    teams: 3,
    users: 10,
    team_members: 13,
    clients: 80,
    properties: 96,
    deals: 120,
  };
  for (const [key, values] of Object.entries(entities)) {
    if (values.length !== expected[key as keyof typeof expected])
      throw new Error("Profile cardinality mismatch.");
    if (key !== "team_members") {
      const ids = values.map((v) => (v as { id: string }).id);
      ids.forEach((id) => uuidSchema.parse(id));
      if (new Set(ids).size !== ids.length)
        throw new Error("Duplicate profile identity.");
    }
  }
  if (new Set(entities.users.map((u) => u.email)).size !== 10)
    throw new Error("Duplicate staff email.");
  if (
    new Set(entities.team_members.map((m) => `${m.team_id}/${m.user_id}`))
      .size !== 13
  )
    throw new Error("Duplicate membership.");
  for (const member of entities.team_members)
    if (
      !entities.users.some((u) => u.id === member.user_id) ||
      !entities.teams.some((t) => t.id === member.team_id)
    )
      throw new Error("Dangling membership.");
  const actorKeys = new Set(profiles.actors.map((a) => a.key));
  if (actorKeys.size !== profiles.actors.length)
    throw new Error("Duplicate actor.");
  for (const principal of profiles.principals) {
    if (
      principal.signatory_keys.length !==
        (principal.kind === "household" ? 2 : 1) ||
      principal.signatory_keys.some((key) => !actorKeys.has(key))
    )
      throw new Error("Missing principal signatory.");
  }
  for (const home of profiles.properties) {
    const sum = home.rooms.reduce(
      (area, room) => area + room.length_m * room.width_m,
      0,
    );
    if (
      Math.abs(sum - home.area_m2) > 0.2 ||
      home.rooms.some((r) => !r.items.length)
    )
      throw new Error("Incoherent room geometry or inventory.");
    if (
      home.heating === "electric" &&
      (home.equipment.some((e) => e.fuel === "gas") ||
        home.meters.some((m) => m.utility === "gas"))
    )
      throw new Error("Electric-only home has gas evidence.");
    if ((home.tenure === "leasehold") !== (home.lease !== null))
      throw new Error("Tenure/lease mismatch.");
  }
  for (const period of profiles.possession) {
    dateSchema.parse(period.start);
    if (period.end) dateSchema.parse(period.end);
    if (period.end && period.end <= period.start)
      throw new Error("Invalid possession interval.");
    if (
      !entities.deals.some(
        (d) => d.id === period.deal_id && d.property_id === period.property_id,
      )
    )
      throw new Error("Possession/deal mismatch.");
    if (
      profiles.possession.some(
        (other) =>
          other !== period &&
          other.property_id === period.property_id &&
          period.start < (other.end ?? "9999-12-31") &&
          other.start < (period.end ?? "9999-12-31"),
      )
    )
      throw new Error("Overlapping possession.");
  }
  for (const deal of entities.deals)
    if (
      !entities.properties.some((p) => p.id === deal.property_id) ||
      !entities.clients.some((c) => c.id === deal.client_id) ||
      !entities.teams.some((t) => t.id === deal.team_id)
    )
      throw new Error("Dangling deal entity.");
}
