import { dateSchema } from "@agency/contracts";
import { sources } from "./sources.js";

type Rule = {
  key: string;
  jurisdiction: "England";
  from: string;
  until: string | null;
  applies: string;
  sources: string[];
  requirement: string;
};
export const rules: readonly Rule[] = [
  {
    key: "historical-tenancy",
    jurisdiction: "England",
    from: "2025-01-01",
    until: "2026-04-30",
    applies: "In-scope ordinary historical assured shorthold tenancy events",
    sources: ["EXT-2"],
    requirement:
      "Historical AST terms are not represented as newly issued post-reform terms.",
  },
  {
    key: "tenancy-reform",
    jurisdiction: "England",
    from: "2026-05-01",
    until: null,
    applies: "New and continuing qualifying assured tenancies",
    sources: ["EXT-2"],
    requirement:
      "Assured periodic; no routine new fixed-end AST, new section 21 process or rental bidding.",
  },
  {
    key: "written-information",
    jurisdiction: "England",
    from: "2026-05-01",
    until: null,
    applies:
      "New tenancy agreements and qualifying continuing written/oral tenancies",
    sources: ["EXT-3", "EXT-4"],
    requirement:
      "New written information before agreement; existing written sheet or oral written terms by 31 May 2026. Synthetic delivery records, not a statutory service pack.",
  },
  {
    key: "rent-increase",
    jurisdiction: "England",
    from: "2026-05-01",
    until: null,
    applies: "Ordinary current assured-periodic rent increase events",
    sources: ["EXT-2"],
    requirement:
      "Section 13/Form 4A process; at least two months notice, no more than annual increases; no generic addendum substitution.",
  },
  {
    key: "deposit-caps",
    jurisdiction: "England",
    from: "2025-01-01",
    until: null,
    applies: "In-scope tenancies with annual rent below GBP100,000",
    sources: ["EXT-5"],
    requirement:
      "Integer pence, floor one week holding and five weeks tenancy below GBP50,000 annual rent, six weeks otherwise.",
  },
  {
    key: "deposit-timelines",
    jurisdiction: "England",
    from: "2025-01-01",
    until: null,
    applies: "Tenancy deposit receipts",
    sources: ["EXT-6"],
    requirement:
      "Protection and prescribed information within 30 days; sale exchange and holding deposits are distinct.",
  },
  {
    key: "tenant-fees",
    jurisdiction: "England",
    from: "2026-05-01",
    until: null,
    applies: "Current tenancy fees and advance rent",
    sources: ["EXT-5"],
    requirement:
      "No rent before agreement; at most one month in advance after agreement, no blanket cleaning penalties or invented tenant fees.",
  },
  {
    key: "gas-records",
    jurisdiction: "England",
    from: "2025-01-01",
    until: null,
    applies: "Homes with gas installations only",
    sources: ["EXT-7"],
    requirement:
      "Relevant delivery/access and valid report history; original synthetic extracts are not certificates.",
  },
  {
    key: "electrical-remediation",
    jurisdiction: "England",
    from: "2025-01-01",
    until: null,
    applies: "Electrical report and remedial events",
    sources: ["EXT-8"],
    requirement:
      "Valid reports may carry forward; serious observations need compatible follow-up, never a contradictory satisfactory label.",
  },
  {
    key: "alarm-checks",
    jurisdiction: "England",
    from: "2025-01-01",
    until: null,
    applies: "Applicable smoke/CO move-in checks",
    sources: ["EXT-9"],
    requirement:
      "Move-in check histories follow property equipment, not arbitrary boilerplate.",
  },
  {
    key: "fair-wear",
    jurisdiction: "England",
    from: "2025-01-01",
    until: null,
    applies: "Inventory comparisons and deduction proposals",
    sources: ["EXT-5", "EXT-11"],
    requirement:
      "Baseline and evidence, useful life and age, proportionate loss; no automatic new-for-old.",
  },
  {
    key: "cqs-form-reference",
    jurisdiction: "England",
    from: "2026-03-30",
    until: null,
    applies: "Historical references to CQS form transition only",
    sources: ["EXT-10"],
    requirement: "Do not misdate transition or reproduce licensed TA forms.",
  },
  {
    key: "aml-threshold-reference",
    jurisdiction: "England",
    from: "2026-06-30",
    until: null,
    applies: "Any current letting AML policy reference",
    sources: ["EXT-13"],
    requirement:
      "GBP10,000 threshold reference; older EUR claim rejected. No identity evidence generated.",
  },
  {
    key: "subject-to-contract",
    jurisdiction: "England",
    from: "2025-01-01",
    until: null,
    applies: "Ordinary sales offers and memoranda",
    sources: ["EXT-1", "EXT-14"],
    requirement:
      "Nonbinding subject-to-contract records do not imply exchange or completed conveyancing.",
  },
];

export function assertRule(rule: Rule): void {
  dateSchema.parse(rule.from);
  if (rule.until) {
    dateSchema.parse(rule.until);
    if (rule.until < rule.from) throw new Error("Inverted rule interval.");
  }
  if (
    rule.jurisdiction !== "England" ||
    !rule.applies ||
    !rule.requirement ||
    !rule.sources.length ||
    rule.sources.some((key) => !sources.some((source) => source.key === key))
  )
    throw new Error("Unattributed or inapplicable rule.");
}

export function resolveTenancy(
  agreement: string,
  event: string,
  written: boolean,
) {
  dateSchema.parse(agreement);
  dateSchema.parse(event);
  if (event < agreement) throw new Error("Tenancy event predates agreement.");
  if (event < "2026-05-01")
    return {
      regime: "historical-ast",
      information: "historical-record",
      deadline: null,
    } as const;
  if (agreement >= "2026-05-01")
    return {
      regime: "assured-periodic",
      information: "written-terms-before-agreement",
      deadline: null,
    } as const;
  return {
    regime: "assured-periodic",
    information: written
      ? "information-sheet-delivery"
      : "written-terms-delivery",
    deadline: "2026-05-31",
  } as const;
}

export type TenancyScenario = {
  agreement_date: string;
  event_date: string;
  written: boolean;
  fixed_end: string | null;
  written_information_date: string | null;
  monthly_pence: number;
  advertised_pence: number;
  advance_months: number;
  section21_date: string | null;
};
export function assertTenancyScenario(value: TenancyScenario): void {
  const policy = resolveTenancy(
    value.agreement_date,
    value.event_date,
    value.written,
  );
  if (
    ![value.monthly_pence, value.advertised_pence].every(
      (n) => Number.isSafeInteger(n) && n > 0 && n * 12 < 10_000_000,
    )
  )
    throw new Error("Rent outside corpus scope.");
  if (value.fixed_end) dateSchema.parse(value.fixed_end);
  if (value.section21_date) {
    dateSchema.parse(value.section21_date);
    if (value.section21_date >= "2026-05-01")
      throw new Error("New ordinary section 21 process excluded.");
  }
  if (value.agreement_date >= "2026-05-01") {
    if (value.fixed_end)
      throw new Error("New fixed-end assured tenancy after reform refused.");
    if (
      value.monthly_pence > value.advertised_pence ||
      value.advance_months > 1
    )
      throw new Error("Post-reform bidding or advance-rent demand refused.");
    if (
      !value.written_information_date ||
      value.written_information_date >= value.agreement_date
    )
      throw new Error(
        "Written information must precede agreement in the dated corpus.",
      );
  }
  if (value.written_information_date)
    dateSchema.parse(value.written_information_date);
  if (
    policy.deadline &&
    value.event_date >= policy.deadline &&
    (!value.written_information_date ||
      value.written_information_date > policy.deadline)
  )
    throw new Error("Missing or late reform information delivery.");
}
