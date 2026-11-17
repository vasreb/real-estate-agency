import { makeProfiles } from "../../prisma/demo-archive/profiles/agency.js";
import { compileCases } from "../../prisma/demo-archive/scenarios/events.js";
import { compileAmendmentInstruments } from "../../prisma/demo-archive/scenarios/amendments.js";
import {
  makeContentContext,
  textOf,
} from "../../prisma/demo-archive/content/context.js";
import {
  authorManagement,
  validateManagementDocument,
} from "../../prisma/demo-archive/content/property-management/index.js";
import { authorSupporting } from "../../prisma/demo-archive/content/supporting/index.js";
import { recordScenario } from "../../prisma/demo-archive/qa/evidence.js";
import { evidenceFacts } from "../../prisma/demo-archive/content/property-management/facts.js";
const profiles = makeProfiles();
const cases = compileCases(profiles);
const amendments = compileAmendmentInstruments(cases, profiles);
describe("property condition, repairs, compliance and deposit evidence", () => {
  it("preserves an electrical source result across matters for the same property", () => {
    for (const later of cases.filter((c) => c.sequence === 2)) {
      const first = cases.find(
        (c) => c.property_id === later.property_id && c.sequence === 1,
      )!;
      const context = (matter: typeof first) =>
        makeContentContext(profiles, matter, matter.slots[0]!, amendments);
      expect(evidenceFacts(context(later)).electrical).toEqual(
        evidenceFacts(context(first)).electrical,
      );
    }
  });
  it("uses three different repair scopes consistently from inspection to invoice", () => {
    const scopes = new Set<string>();
    for (const matter of cases.filter((c) =>
      c.slots.some((s) => s.family === "R18"),
    )) {
      const documents = matter.slots
        .filter((s) => ["R15", "R16", "R17", "R18"].includes(s.family))
        .map((slot) =>
          authorManagement(
            makeContentContext(profiles, matter, slot, amendments),
          ),
        );
      const scope = documents[0]!.blocks.find(
        (b) => b.kind === "table" && b.columns[0] === "Work item",
      );
      expect(scope?.kind).toBe("table");
      if (scope?.kind !== "table") throw new Error("Missing shared work item");
      const target = scope.rows[0]![1]!;
      scopes.add(target.split(" / ")[0]!);
      for (const doc of documents) expect(textOf(doc)).toContain(target);
    }
    expect(scopes.size).toBe(3);
  });
  it("carries a signed furniture removal into a later relet instead of silently resupplying the bed", () => {
    const later = cases.find(
      (c) => c.sequence === 2 && c.cohort === "active-new-rental",
    )!;
    const slot = later.slots.find((s) => s.family === "R11")!;
    const ctx = makeContentContext(profiles, later, slot, amendments);
    const text = textOf(authorManagement(ctx));
    expect(ctx.home.furnishing).toBe("part-furnished");
    expect(text).toContain("removed with identified consent");
    expect(text).toContain(
      "prior tenancy check-out recorded an unrepaired local carpet mark",
    );
  });
  it("reconciles all remaining families, real item keys and proportionate loss", () => {
    const families = new Set<string>();
    const outcomes = new Set<number>();
    for (const matter of cases)
      for (const slot of matter.slots.filter((s) =>
        /^(?:R(?:11|12|13|15|16|17|18|22|23|24)|C0[1-8])$/.test(s.family),
      )) {
        const ctx = makeContentContext(profiles, matter, slot, amendments);
        const doc = slot.family.startsWith("C")
          ? authorSupporting(ctx)
          : authorManagement(ctx);
        validateManagementDocument(doc, ctx);
        families.add(slot.family);
        if (slot.family === "R24")
          outcomes.add(doc.evidence_facts!.agreed_deduction_pence);
        if (slot.family === "R11")
          for (const room of ctx.home.rooms)
            for (const item of room.items)
              expect(textOf(doc)).toContain(item.key);
      }
    expect(families.size).toBe(18);
    expect(outcomes.has(0)).toBe(true);
    expect(outcomes.size).toBeGreaterThan(2);
    recordScenario(8, "happy", {
      families: families.size,
      distinct_settlement_outcomes: outcomes.size,
      native_layout_verified: false,
    });
  });
  it("rejects invented items/meter resets, inconsistent electrical results and unsupported deductions", () => {
    const matter = cases[0]!;
    const slot = matter.slots.find((s) => s.family === "R11")!;
    const ctx = makeContentContext(profiles, matter, slot, amendments);
    const doc = authorManagement(ctx);
    const facts = doc.evidence_facts!;
    for (const mutation of [
      { item_keys: [...facts.item_keys, "invented/sofa"] },
      {
        meter_readings: {
          ...facts.meter_readings,
          [Object.keys(facts.meter_readings)[0]!]: 0,
        },
      },
      { baseline_present: false, agreed_deduction_pence: 100 },
      {
        electrical: {
          code: "satisfactory" as const,
          observations: ["C2 exposed connection"],
          follow_up: null,
        },
      },
      {
        electrical: {
          code: "unsatisfactory" as const,
          observations: ["C2 exposed connection"],
          follow_up: null,
        },
      },
    ])
      expect(() =>
        validateManagementDocument(
          { ...doc, evidence_facts: { ...facts, ...mutation } },
          ctx,
        ),
      ).toThrow();
    recordScenario(8, "failure", { rejected_evidence_mutations: 5 });
  });
});
