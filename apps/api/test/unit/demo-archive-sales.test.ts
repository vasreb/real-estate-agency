import { makeProfiles } from "../../prisma/demo-archive/profiles/agency.js";
import { compileCases } from "../../prisma/demo-archive/scenarios/events.js";
import { compileAmendmentInstruments } from "../../prisma/demo-archive/scenarios/amendments.js";
import {
  makeContentContext,
  textOf,
  validateAuthored,
} from "../../prisma/demo-archive/content/context.js";
import { authorSales } from "../../prisma/demo-archive/content/sales/index.js";
import { recordScenario } from "../../prisma/demo-archive/qa/evidence.js";

const profiles = makeProfiles();
const cases = compileCases(profiles);
const amendments = compileAmendmentInstruments(cases, profiles);
describe("substantive original sales documents", () => {
  it("does not backdate a survey price reduction into the original offer", () => {
    const matter = cases.find(
      (c) =>
        c.cohort === "completed-sale" && Number(c.key.split("/")[1]) % 3 === 0,
    )!;
    const original = matter.slots.find((s) => s.family === "S08")!;
    const survey = matter.slots.find((s) => s.family === "S12")!;
    const before = makeContentContext(profiles, matter, original, amendments);
    const after = makeContentContext(profiles, matter, survey, amendments);
    expect(before.financial_facts.agreed_sale_pence).toBe(
      before.home.asking_sale_pence,
    );
    expect(after.financial_facts.agreed_sale_pence).toBeLessThan(
      after.home.asking_sale_pence,
    );
  });
  it("distinguishes loose contents from fixtures and names the corporate principal in the base agreement", () => {
    const matter = cases.find((c) => c.key === "deal/055")!;
    const slot = matter.slots.find((s) => s.family === "S06")!;
    const text = textOf(
      authorSales(makeContentContext(profiles, matter, slot, amendments)),
    );
    expect(text).not.toContain(
      "upholstered sofa; included as an existing fixture",
    );
    expect(text).toContain(
      "loose contents; excluded unless specifically negotiated",
    );
    const change = matter.slots.find((s) => s.amendment)!;
    const doc = authorSales(
      makeContentContext(profiles, matter, change, amendments),
    );
    const base = doc.blocks.find(
      (b) => b.kind === "paragraph" && b.text.startsWith("Base agreement"),
    );
    expect(base?.kind === "paragraph" && base.text).toContain(
      "Ivydale Demonstration Homes Ltd",
    );
  });
  it("authors all sales families and coherent complete, progressing, marketed and withdrawn content", () => {
    const families = new Set<string>();
    let documents = 0;
    for (const c of cases)
      for (const slot of c.slots.filter((s) => s.family.startsWith("S"))) {
        const ctx = makeContentContext(profiles, c, slot, amendments);
        const document = authorSales(ctx);
        validateAuthored(document, ctx);
        const text = textOf(document);
        expect(document.financial_facts).not.toHaveProperty(
          "monthly_rent_pence",
        );
        expect(text).toContain(ctx.property.address);
        expect(text).toContain(ctx.client.name);
        if (slot.family === "S02")
          expect(text.split(/\s+/).length).toBeGreaterThan(900);
        if (slot.family === "S08")
          expect(text).toContain("Subject to contract");
        if (slot.family === "S15") expect(text).toContain(ctx.money.fee_total);
        if (slot.family === "S03") {
          expect(text).toContain(ctx.amendment!.old_term);
          expect(text).toContain(ctx.amendment!.new_term);
        }
        families.add(slot.family);
        documents++;
      }
    expect(families.size).toBe(16);
    recordScenario(6, "happy", {
      authored_sales_documents: documents,
      families: families.size,
      output: "canonical blocks only; originals not yet rendered",
    });
  });

  it("refuses binding-sale memoranda, wrong parties/address, unearned completion and fee drift", () => {
    const c = cases.find((v) => v.cohort === "completed-sale")!;
    const memorandum = c.slots.find((s) => s.family === "S08")!;
    const ctx = makeContentContext(profiles, c, memorandum, amendments);
    const doc = authorSales(ctx);
    expect(() =>
      validateAuthored(
        {
          ...doc,
          blocks: [
            ...doc.blocks,
            {
              kind: "paragraph",
              text: "This memorandum creates a binding sale contract.",
            },
          ],
        },
        ctx,
      ),
    ).toThrow();
    expect(() =>
      validateAuthored({ ...doc, parties: ["wrong-actor"] }, ctx),
    ).toThrow();
    expect(() =>
      validateAuthored(
        { ...doc, property_id: profiles.entities.properties[1]!.id },
        ctx,
      ),
    ).toThrow();
    const invoiceSlot = c.slots.find((s) => s.family === "S15")!;
    const invoiceCtx = makeContentContext(profiles, c, invoiceSlot, amendments);
    expect(() =>
      validateAuthored(
        {
          ...authorSales(invoiceCtx),
          financial_facts: {
            ...invoiceCtx.financial_facts,
            agency_fee_total_pence: 1,
          },
        },
        invoiceCtx,
      ),
    ).toThrow();
    const marketed = cases.find((v) => v.cohort === "marketed-sale")!;
    expect(() =>
      authorSales(
        makeContentContext(
          profiles,
          marketed,
          { ...marketed.slots[0]!, family: "S13" },
          amendments,
        ),
      ),
    ).toThrow();
    recordScenario(6, "failure", { rejected_content_mutations: 5 });
  });
});
