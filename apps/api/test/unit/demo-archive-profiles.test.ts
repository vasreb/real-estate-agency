import {
  makeProfiles,
  validateProfiles,
} from "../../prisma/demo-archive/profiles/agency.js";
import { entitiesSchema } from "../../prisma/demo-archive/model.js";
import { recordScenario } from "../../prisma/demo-archive/qa/evidence.js";

describe("demo archive deterministic profiles", () => {
  it("authors exact entities, memberships, principals, tenure and reuse occurrences", () => {
    const profiles = makeProfiles();
    validateProfiles(profiles);
    expect(makeProfiles()).toEqual(profiles);
    const entities = entitiesSchema.parse(profiles.entities);
    expect(
      Object.fromEntries(
        Object.entries(entities).map(([key, values]) => [key, values.length]),
      ),
    ).toEqual({
      teams: 3,
      users: 10,
      team_members: 13,
      clients: 80,
      properties: 96,
      deals: 120,
    });
    expect(
      profiles.principals.filter((p) => p.kind === "individual"),
    ).toHaveLength(52);
    expect(
      profiles.principals.filter((p) => p.kind === "household"),
    ).toHaveLength(18);
    expect(
      profiles.principals.filter((p) => p.kind === "corporate"),
    ).toHaveLength(10);
    expect(
      profiles.properties.filter((p) => p.tenure === "leasehold"),
    ).toHaveLength(69);
    const occurrences = entities.properties.map(
      (p) => entities.deals.filter((d) => d.property_id === p.id).length,
    );
    expect(occurrences.filter((n) => n === 1)).toHaveLength(72);
    expect(occurrences.filter((n) => n === 2)).toHaveLength(24);
    expect(entities.deals.filter((d) => d.type === "rental")).toHaveLength(72);
    expect(
      entities.teams.map(
        (t) => entities.deals.filter((d) => d.team_id === t.id).length,
      ),
    ).toEqual([40, 56, 24]);
    const rentalHomes = profiles.properties.filter((home) =>
      entities.deals.some(
        (deal) =>
          deal.type === "rental" && deal.property_id === home.property_id,
      ),
    );
    expect(new Set(rentalHomes.map((home) => home.category)).size).toBe(6);
    expect(
      rentalHomes.some((home) => home.monthly_rent_pence * 12 >= 5_000_000),
    ).toBe(true);
    recordScenario(3, "happy", {
      properties: 96,
      clients: 80,
      occurrences: 120,
      memberships: 13,
    });
  });

  it("rejects missing household signatory, duplicate email, wrong gas profile and persisted rich columns", () => {
    for (const mutation of [
      (p: ReturnType<typeof makeProfiles>) => {
        p.principals.find((v) => v.kind === "household")!.signatory_keys.pop();
      },
      (p: ReturnType<typeof makeProfiles>) => {
        p.entities.users[1]!.email = p.entities.users[0]!.email;
      },
      (p: ReturnType<typeof makeProfiles>) => {
        const home = p.properties.find((v) => v.heating === "electric")!;
        home.equipment.push({
          key: `${home.key}/gas-boiler`,
          description: "Gas boiler",
          fuel: "gas",
          installed: "2023-06-01",
        });
      },
      (p: ReturnType<typeof makeProfiles>) => {
        Object.assign(p.entities.properties[0]!, { bedrooms: 2 });
      },
      (p: ReturnType<typeof makeProfiles>) => {
        p.possession[1]!.property_id = p.possession[0]!.property_id;
        p.possession[1]!.start = p.possession[0]!.start;
        p.possession[1]!.end = p.possession[0]!.end;
      },
    ]) {
      const changed = makeProfiles();
      mutation(changed);
      expect(() => validateProfiles(changed)).toThrow();
    }
    recordScenario(3, "failure", { rejected_mutations: 5 });
  });
});
