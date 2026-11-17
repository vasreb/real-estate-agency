import { makeProfiles } from "../../prisma/demo-archive/profiles/agency.js";
import { compileCases } from "../../prisma/demo-archive/scenarios/events.js";
import { compileAmendmentInstruments } from "../../prisma/demo-archive/scenarios/amendments.js";
import {
  makeContentContext,
  textOf,
  validateAuthored,
} from "../../prisma/demo-archive/content/context.js";
import { authorLettings } from "../../prisma/demo-archive/content/lettings/index.js";
import { recordScenario } from "../../prisma/demo-archive/qa/evidence.js";

const profiles = makeProfiles();
const cases = compileCases(profiles);
const amendments = compileAmendmentInstruments(cases, profiles);
describe("period-aware rental and management content", () => {
  it("authors agreements, money flows and permissions with legacy/current distinctions", () => {
    const families = new Set<string>();
    let count = 0;
    for (const matter of cases)
      for (const slot of matter.slots.filter((s) =>
        /^R(?:0[1-9]|10|14|19|20|21)$/.test(s.family),
      )) {
        const ctx = makeContentContext(profiles, matter, slot, amendments);
        const doc = authorLettings(ctx);
        expect(doc.financial_facts).not.toHaveProperty("agreed_sale_pence");
        expect(doc.financial_facts).not.toHaveProperty(
          "agency_fee_total_pence",
        );
        validateAuthored(doc, ctx);
        const text = textOf(doc);
        families.add(slot.family);
        count++;
        if (slot.family === "R07") {
          expect(text).toContain(ctx.money.rent);
          expect(text).toContain(
            ctx.event.date >= "2026-05-01"
              ? "assured periodic"
              : "historical assured shorthold",
          );
          expect(text.split(/\s+/).length).toBeGreaterThan(900);
        }
        if (slot.family === "R01")
          expect(text.split(/\s+/).length).toBeGreaterThan(900);
        if (
          slot.family === "R01" &&
          ctx.baseClauses["service-level"]!.startsWith("Rent collection")
        )
          expect(text).toContain("six per cent");
        if (slot.family === "R07" && ctx.event.date < "2026-05-01")
          expect(text).not.toContain("1 May 2026");
        if (slot.family === "R08" && ctx.event.date < "2026-05-01")
          expect(text).not.toContain("pre-May 2026");
        if (slot.family === "R20") expect(text).toContain("Form 4A");
      }
    expect(families.size).toBe(14);
    recordScenario(7, "happy", {
      families: families.size,
      canonical_documents: count,
      native_layout_verified: false,
    });
  });

  it("rejects fixed-end new AST wording, addendum rent rises, false official forms and lost consent", () => {
    const matter = cases.find((c) => c.cohort === "active-new-rental")!;
    const slot = matter.slots.find((s) => s.family === "R07")!;
    const ctx = makeContentContext(profiles, matter, slot, amendments);
    const doc = authorLettings(ctx);
    for (const text of [
      "New fixed-term AST ending on 2027-05-31.",
      "Rent increases automatically by this addendum.",
      "Official Form 4A certificate.",
      "Pay six months of rent before signing.",
      "Accept a bid above the advertised rent.",
    ])
      expect(() =>
        validateAuthored(
          { ...doc, blocks: [...doc.blocks, { kind: "paragraph", text }] },
          ctx,
        ),
      ).toThrow();
    const withGuarantor = amendments.find(
      (a) =>
        a.status === "signed" &&
        a.contract_key &&
        cases.some(
          (c) =>
            c.key === a.deal_key &&
            profiles.actors.some(
              (actor) => actor.key === `${c.counterparty_key}/guarantor`,
            ),
        ) &&
        a.key.includes("amendment-2"),
    )!;
    const c = cases.find((v) => v.key === withGuarantor.deal_key)!;
    const s = c.slots.find((v) => v.key === withGuarantor.key)!;
    const changed = amendments.map((a) =>
      a.key === s.key ? { ...a, consent: null } : a,
    );
    const bad = makeContentContext(profiles, c, s, changed);
    expect(() => validateAuthored(authorLettings(bad), bad)).toThrow();
    recordScenario(7, "failure", { rejected_content_mutations: 6 });
  });
});
