import {
  compileCases,
  validateCases,
} from "../../prisma/demo-archive/scenarios/events.js";
import { cohorts } from "../../prisma/demo-archive/scenarios/cohorts.js";
import { makeProfiles } from "../../prisma/demo-archive/profiles/agency.js";
import { recordScenario } from "../../prisma/demo-archive/qa/evidence.js";

describe("demo archive causal case inventory", () => {
  it("compiles all nine uneven cohorts and exactly 2400 event-supported slots", () => {
    const cases = compileCases(makeProfiles());
    validateCases(cases);
    expect(cases).toHaveLength(120);
    expect(cases.flatMap((c) => c.slots)).toHaveLength(2400);
    expect(
      cases.flatMap((c) => c.slots).filter((s) => s.amendment),
    ).toHaveLength(240);
    expect(
      cases.filter((c) => c.slots.every((s) => !s.amendment)),
    ).toHaveLength(16);
    for (const cohort of cohorts) {
      const group = cases.filter((c) => c.cohort === cohort.key);
      expect(group).toHaveLength(cohort.count);
      expect(group.reduce((n, c) => n + c.slots.length, 0)).toBe(cohort.files);
      expect(new Set(group.map((c) => c.slots.length)).size).toBeGreaterThan(1);
    }
    expect(
      new Set(cases.flatMap((c) => c.slots).map((s) => s.family)).size,
    ).toBe(48);
    const profiles = makeProfiles();
    for (const matter of cases) {
      const deal = profiles.entities.deals.find(
        (d) => d.id === matter.deal_id,
      )!;
      expect(
        matter.events
          .find((e) => e.key === `${matter.key}/instruction`)!
          .date.slice(0, 4),
      ).toBe(deal.number.slice(0, 4));
      const marketing = matter.events.find((e) => e.kind === "marketing");
      const application = matter.events.find((e) => e.kind === "application");
      if (marketing && application)
        expect(application.date >= marketing.date).toBe(true);
    }
    recordScenario(4, "happy", {
      cases: 120,
      slots: 2400,
      amendments: 240,
      unamended_cases: 16,
      families: 48,
    });
  });

  it("rejects causal inversion, overlapping relets, unearned withdrawal invoice and filler", () => {
    for (const mutation of [
      (cases: ReturnType<typeof compileCases>) => {
        const c = cases.find((v) => v.cohort === "completed-sale")!;
        c.events.find((e) => e.kind === "completion")!.date = "2025-01-01";
      },
      (cases: ReturnType<typeof compileCases>) => {
        const later = cases.find((v) => v.sequence === 2 && v.possession)!;
        later.possession!.start = "2025-03-01";
      },
      (cases: ReturnType<typeof compileCases>) => {
        const c = cases.find((v) => v.cohort === "withdrawn-sale")!;
        c.slots[0]!.family = "S15";
        c.slots[0]!.contractual_fee_basis = null;
      },
      (cases: ReturnType<typeof compileCases>) => {
        cases[0]!.slots[0]!.event_key = "missing/event";
      },
      (cases: ReturnType<typeof compileCases>) => {
        const first = cases[0]!.events[0]!;
        const next = cases[0]!.events[1]!;
        first.depends_on = [next.key];
        next.date = first.date;
      },
    ]) {
      const cases = compileCases(makeProfiles());
      mutation(cases);
      expect(() => validateCases(cases)).toThrow();
    }
    recordScenario(4, "failure", { rejected_causal_mutations: 5 });
  });
});
