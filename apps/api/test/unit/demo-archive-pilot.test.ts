import { compileCorpus } from "../../prisma/demo-archive/compiler.js";
import { makeProfiles } from "../../prisma/demo-archive/profiles/agency.js";
import { compileAmendmentInstruments } from "../../prisma/demo-archive/scenarios/amendments.js";
import { makeContentContext } from "../../prisma/demo-archive/content/context.js";
import {
  selectPilot,
  validatePilotDocument,
} from "../../prisma/demo-archive/qa/pilot.js";
import { recordScenario } from "../../prisma/demo-archive/qa/evidence.js";
describe("representative complete-pack gate", () => {
  it("selects two matters per cohort plus missing family/reason/longest/unresolved coverage", () => {
    const corpus = compileCorpus();
    const selection = selectPilot(corpus);
    expect(selection.matter_keys.length).toBeGreaterThanOrEqual(18);
    expect(selection.families.length).toBe(48);
    expect(selection.amendment_reasons.length).toBe(12);
    for (const count of Object.values(selection.cohorts))
      expect(count).toBeGreaterThanOrEqual(2);
    expect(selection.states).toEqual(
      expect.arrayContaining(["draft", "unknown", "signed", "unresolved"]),
    );
    expect(
      selection.documents.every((doc) =>
        selection.matter_keys.includes(
          corpus.scenario_timelines.find(
            (c) => c.deal_id === doc.metadata.deal_id,
          )!.key,
        ),
      ),
    ).toBe(true);
    recordScenario(12, "happy", {
      stage:
        "selection only; original-byte and manual pack review still required",
      matters: selection.matter_keys.length,
      families: 48,
      reasons: 12,
    });
  }, 30_000);
  it("refuses generic addenda and contradictory financial/condition prose", () => {
    const corpus = compileCorpus();
    const profiles = makeProfiles();
    const instruments = compileAmendmentInstruments(
      corpus.scenario_timelines,
      profiles,
    );
    const doc = corpus.documents.find((d) => d.metadata.type === "amendment")!;
    const matter = corpus.scenario_timelines.find(
      (c) => c.deal_id === doc.metadata.deal_id,
    )!;
    const ctx = makeContentContext(
      profiles,
      matter,
      matter.slots.find((s) => s.key === doc.key)!,
      instruments,
    );
    expect(() =>
      validatePilotDocument(
        {
          ...doc.content,
          blocks: [
            {
              kind: "paragraph",
              text: "The parties agree to changes without an identified operative term.",
            },
          ],
        },
        ctx,
      ),
    ).toThrow();
    expect(() =>
      validatePilotDocument(
        {
          ...doc.content,
          financial_facts: {
            ...doc.content.financial_facts,
            monthly_rent_pence: 1,
          },
        },
        ctx,
      ),
    ).toThrow();
    expect(() =>
      validatePilotDocument(
        {
          ...doc.content,
          blocks: [
            ...doc.content.blocks,
            {
              kind: "paragraph",
              text: "The carpet was brand new with no pre-existing marks.",
            },
          ],
        },
        ctx,
      ),
    ).toThrow();
    recordScenario(12, "failure", { rejected_content_mutations: 3 });
  }, 30_000);
});
