import {
  sources,
  sourceSchema,
  rejectedClaims,
  assertSourceRegister,
} from "../../prisma/demo-archive/content/sources.js";
import {
  rules,
  resolveTenancy,
  assertTenancyScenario,
  assertRule,
} from "../../prisma/demo-archive/content/rule-matrix.js";
import {
  assertEnglishSynthetic,
  assertOriginalTemplate,
} from "../../prisma/demo-archive/content/language-policy.js";
import { corpus } from "../../prisma/demo-archive/model.js";
import { recordScenario } from "../../prisma/demo-archive/qa/evidence.js";

describe("demo archive source and language policy", () => {
  it("freezes 14 complete dated source records with honest inspection boundaries", () => {
    expect(sources).toHaveLength(14);
    assertSourceRegister(sources);
    for (const source of sources)
      expect(sourceSchema.parse(JSON.parse(JSON.stringify(source)))).toEqual(
        source,
      );
    expect(sources.find((s) => s.key === "EXT-10")?.inspection).toBe(
      "indexed-result-only",
    );
    expect(sources.find((s) => s.key === "EXT-11")?.reuse.permission).toBe(
      "not-granted",
    );
    expect(rejectedClaims.length).toBeGreaterThanOrEqual(5);
    for (const rule of rules) assertRule(rule);
    recordScenario(2, "happy", {
      sources: sources.length,
      rules: rules.length,
      generation_network_calls: 0,
    });
  });

  it("resolves event-date and written/oral continuation duties", () => {
    expect(resolveTenancy("2026-04-30", "2026-04-30", true)).toEqual({
      regime: "historical-ast",
      information: "historical-record",
      deadline: null,
    });
    expect(resolveTenancy("2026-04-30", "2026-05-01", true)).toEqual({
      regime: "assured-periodic",
      information: "information-sheet-delivery",
      deadline: "2026-05-31",
    });
    expect(resolveTenancy("2025-02-01", "2026-05-01", false).information).toBe(
      "written-terms-delivery",
    );
    expect(resolveTenancy("2026-05-01", "2026-05-01", true).information).toBe(
      "written-terms-before-agreement",
    );
    assertTenancyScenario({
      agreement_date: "2026-05-03",
      event_date: "2026-05-05",
      written: true,
      fixed_end: null,
      written_information_date: "2026-05-02",
      monthly_pence: 200_000,
      advertised_pence: 200_000,
      advance_months: 1,
      section21_date: null,
    });
  });

  it("rejects new ASTs, bidding, advance demands, missing or late written information", () => {
    const scenario = {
      agreement_date: "2026-05-03",
      event_date: "2026-05-05",
      written: true,
      fixed_end: null,
      written_information_date: "2026-05-02",
      monthly_pence: 200_000,
      advertised_pence: 200_000,
      advance_months: 1,
      section21_date: null,
    };
    for (const mutation of [
      { fixed_end: "2027-05-02" },
      { monthly_pence: 200_001 },
      { advance_months: 2 },
      { written_information_date: null },
      { written_information_date: "2026-05-04" },
      { section21_date: "2026-05-01" },
    ]) {
      expect(() =>
        assertTenancyScenario({ ...scenario, ...mutation }),
      ).toThrow();
    }
    expect(() => resolveTenancy("2026-05-33", "2026-06-01", true)).toThrow();
    recordScenario(2, "failure", {
      rejected_scenario_mutations: 7,
      protected_forms_and_unattributed_rules_tested: true,
    });
  });

  it("rejects unattributed rules and incomplete source entries", () => {
    expect(() => assertRule({ ...rules[0]!, sources: [] })).toThrow();
    expect(() => assertRule({ ...rules[0]!, sources: ["EXT-99"] })).toThrow();
    expect(() => assertSourceRegister(sources.slice(1))).toThrow();
    expect(
      sourceSchema.safeParse({ ...sources[0], reuse: undefined }).success,
    ).toBe(false);
  });

  it("accepts original English content only, with a detachable notice", () => {
    assertEnglishSynthetic(
      `${corpus.notice}\nThe principal authorises a documented roof inspection before marketing.`,
    );
    assertOriginalTemplate({
      provenance: "original-synthetic",
      official_form: false,
      permission_to_reproduce: false,
    });
    expect(() => assertEnglishSynthetic("Синтетический документ")).toThrow();
    expect(() =>
      assertEnglishSynthetic("Synthetic placeholder: {{tenant}}"),
    ).toThrow();
    expect(() =>
      assertOriginalTemplate({
        provenance: "copied-licensed-form",
        official_form: true,
        permission_to_reproduce: false,
      }),
    ).toThrow();
  });
});
