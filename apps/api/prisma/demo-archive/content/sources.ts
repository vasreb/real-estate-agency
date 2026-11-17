import { z } from "zod";

export const sourceSchema = z.strictObject({
  key: z.string().regex(/^EXT-(?:[1-9]|1[0-4])$/),
  authority: z.string().min(1),
  url: z.url(),
  related_urls: z.array(z.url()),
  title: z.string().min(1),
  published: z.iso.date().nullable(),
  updated: z.iso.date().nullable(),
  effective: z.iso.date().nullable(),
  retrieved: z.literal("2026-11-12"),
  jurisdiction: z.literal("England"),
  relevant_rules_or_families: z.array(z.string().min(1)).min(1),
  reuse: z.strictObject({
    licence: z.string().min(1),
    permission: z.enum(["facts-and-original-summary-only", "not-granted"]),
    full_text_reproduced: z.literal(false),
  }),
  inspection: z.enum(["full-text", "indexed-result-only"]),
  inspection_receipt: z.string().min(1),
  boundary: z.string().min(1),
});
export type Source = z.infer<typeof sourceSchema>;

type Entry = Pick<
  Source,
  "authority" | "url" | "title" | "boundary" | "relevant_rules_or_families"
> &
  Partial<
    Pick<
      Source,
      "published" | "updated" | "effective" | "inspection" | "related_urls"
    >
  >;
const entries: Entry[] = [
  {
    authority: "Ministry of Housing, Communities and Local Government",
    url: "https://www.gov.uk/government/publications/how-to-sell-a-home/how-to-sell-a-home",
    title: "How to sell a home",
    relevant_rules_or_families: ["S01-S16"],
    boundary:
      "2019 agency/conveyancing map only; not current tax or tenancy authority.",
  },
  {
    authority: "Ministry of Housing, Communities and Local Government",
    url: "https://www.gov.uk/guidance/renters-rights-act-an-overview-for-landlords",
    title: "Renters' Rights Act: an overview for landlords",
    published: "2026-05-01",
    effective: "2026-05-01",
    relevant_rules_or_families: [
      "tenancy-reform",
      "rent-increase",
      "R07",
      "R20",
    ],
    boundary:
      "Ordinary England assured tenancies only; exceptional possession/transitional notices excluded.",
  },
  {
    authority: "Ministry of Housing, Communities and Local Government",
    url: "https://www.gov.uk/guidance/tenancy-agreements-written-information-for-your-tenant",
    title: "Tenancy agreements: written information for your tenant",
    published: "2026-05-01",
    effective: "2026-05-01",
    relevant_rules_or_families: ["written-information", "R07", "C04"],
    boundary:
      "New written terms before agreement; continuing written/oral histories distinguished. Existing duties due 31 May 2026.",
  },
  {
    authority: "Ministry of Housing, Communities and Local Government",
    url: "https://www.gov.uk/government/publications/the-renters-rights-act-information-sheet-2026",
    title: "The Renters' Rights Act Information Sheet 2026",
    effective: "2026-05-01",
    relevant_rules_or_families: ["written-information", "C04", "C07"],
    boundary:
      "Archive records synthetic delivery history only. No edited or substituted official sheet and no legally complete service-pack claim.",
  },
  {
    authority: "Ministry of Housing, Communities and Local Government",
    url: "https://www.gov.uk/guidance/fees-you-can-charge-as-part-of-a-tenancy",
    title: "Fees you can charge as part of a tenancy",
    published: "2026-05-01",
    updated: "2026-11-12",
    effective: "2026-05-01",
    relevant_rules_or_families: [
      "deposit-caps",
      "tenant-fees",
      "R04",
      "R05",
      "R09",
      "R23",
    ],
    boundary:
      "Current fees, holding/deposit caps and advance-rent limits; do not backdate 2026 reform restrictions to all historical events.",
  },
  {
    authority: "UK Government",
    url: "https://www.gov.uk/tenancy-deposit-protection",
    related_urls: [
      "https://www.gov.uk/tenancy-deposit-protection/information-landlords-must-give-tenants",
    ],
    title:
      "Tenancy deposit protection and information landlords must give tenants",
    relevant_rules_or_families: ["deposit-timelines", "R09", "R10", "R24"],
    boundary:
      "Protection and prescribed information within 30 days; fictional scheme identifiers are conspicuous DEMO references.",
  },
  {
    authority: "Health and Safety Executive",
    url: "https://www.hse.gov.uk/gas/landlords/dealing.htm",
    title: "Landlords: dealing with tenants and gas safety",
    relevant_rules_or_families: ["gas-records", "C03", "C04"],
    boundary:
      "Access and gas-record delivery only where gas applies; original summaries are not engineer-issued certificates.",
  },
  {
    authority: "Ministry of Housing, Communities and Local Government",
    url: "https://www.gov.uk/government/publications/electrical-safety-standards-in-the-private-and-social-rented-sectors-guidance/electrical-safety-standards-in-the-private-and-social-rented-sectors-guidance",
    title:
      "Electrical safety standards in the private and social rented sectors: guidance",
    relevant_rules_or_families: ["electrical-remediation", "C02", "C04"],
    boundary:
      "Record validity, observations and remedial follow-up explicitly; not a counterfeit EICR.",
  },
  {
    authority: "Ministry of Housing, Communities and Local Government",
    url: "https://www.gov.uk/government/publications/smoke-and-carbon-monoxide-alarms-explanatory-booklet-for-landlords/the-smoke-and-carbon-monoxide-alarm-england-regulations-2015-qa-booklet-for-the-private-rented-sector-landlords-and-tenants",
    title: "Smoke and carbon monoxide alarm regulations: questions and answers",
    relevant_rules_or_families: ["alarm-checks", "R12", "C04"],
    boundary:
      "Move-in checks and applicable alarm requirements; no invented inspections.",
  },
  {
    authority: "The Law Society",
    url: "https://www.lawsociety.org.uk/topics/property/ta6-6th-edition",
    title: "TA6 sixth edition",
    effective: "2026-03-30",
    inspection: "indexed-result-only",
    relevant_rules_or_families: ["cqs-form-reference", "S05"],
    boundary:
      "Direct fetch returned 403 during planning; indexed transition date only. No permission to reproduce licensed TA6/TA7 wording or layout.",
  },
  {
    authority: "Tenancy Deposit Scheme",
    url: "https://www.tenancydepositscheme.com/wp-content/uploads/2023/10/TDS-Guide-to-Inventories-Check-in-and-Check-out-Reports.pdf",
    title: "A guide to inventories, check-in and check-out reports",
    inspection: "indexed-result-only",
    relevant_rules_or_families: ["fair-wear", "R11", "R22", "R23"],
    boundary:
      "Indexed primary-provider inventory/evidence principles, not full-text inspection or permission to copy templates.",
  },
  {
    authority: "Office for National Statistics",
    url: "https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/privaterentandhousepricesuk/september2026",
    title: "Private rent and house prices, UK: September 2026",
    relevant_rules_or_families: ["illustrative-price-bands", "S01", "R03"],
    boundary:
      "Historical provisional stock benchmarks only: London July price GBP569,000 and August rent GBP2,332. Not latest release, individual appraisal or asking-rent evidence.",
  },
  {
    authority: "UK legislation",
    url: "https://www.legislation.gov.uk/uksi/2017/692/regulation/13?view=plain",
    title: "Money Laundering Regulations 2017, regulation 13",
    effective: "2026-06-30",
    relevant_rules_or_families: ["aml-threshold-reference"],
    boundary:
      "Current text inspected in planning: GBP10,000 letting threshold from 30 June 2026. No copied older EUR threshold or invented identity/AML evidence.",
  },
  {
    authority: "UK Government",
    url: "https://www.gov.uk/buying-a-home/making-an-offer",
    title: "Buying a home: making an offer",
    inspection: "indexed-result-only",
    relevant_rules_or_families: ["subject-to-contract", "S07", "S08"],
    boundary:
      "Indexed guidance distinguishing subject-to-contract offers from exchange; not legal advice or permission to imply a binding sale.",
  },
];

export const sources: readonly Source[] = entries.map((entry, i) =>
  sourceSchema.parse({
    key: `EXT-${i + 1}`,
    published: null,
    updated: null,
    effective: null,
    retrieved: "2026-11-12",
    jurisdiction: "England",
    related_urls: [],
    inspection: "full-text",
    inspection_receipt: [1, 2, 4].includes(i)
      ? "Execution session webfetch full HTML text, 2026-11-12; source PDF attachments not inspected."
      : "Approved plan primary-research register, 2026-11-12; not independently re-fetched in execution. Unknown publication/update dates remain null.",
    reuse: {
      licence: [9, 10].includes(i)
        ? "Third-party copyright; reproduction permission not obtained"
        : "Open Government Licence v3.0 where applicable; facts and original summaries only; third-party exceptions excluded",
      permission: [9, 10].includes(i)
        ? "not-granted"
        : "facts-and-original-summary-only",
      full_text_reproduced: false,
    },
    ...entry,
  }),
);

export function assertSourceRegister(register: readonly Source[]): void {
  if (register.length !== 14 || new Set(register.map((s) => s.key)).size !== 14)
    throw new Error("Incomplete or duplicate source register.");
  for (const source of register) sourceSchema.parse(source);
}

export const rejectedClaims = [
  {
    claim: "2019 sales guide supplies current tenancy or tax rules",
    reason: "Historical mapping only",
    sources: ["EXT-1"],
  },
  {
    claim: "Pre-May written ASTs need no reform information history",
    reason:
      "Continuing written tenancies require sheet delivery by 31 May 2026",
    sources: ["EXT-2", "EXT-3", "EXT-4"],
  },
  {
    claim: "A generic addendum can raise post-reform rent",
    reason:
      "Use applicable section 13/Form 4A process, not contractual substitution",
    sources: ["EXT-2"],
  },
  {
    claim: "A current CQS form reference permits copying TA6",
    reason:
      "Licensed form permission not obtained; original seller questionnaire only",
    sources: ["EXT-10"],
  },
  {
    claim: "Old EUR letting AML threshold remains current after 30 June 2026",
    reason: "Dated current text uses GBP10,000",
    sources: ["EXT-13"],
  },
  {
    claim: "ONS stock average proves an individual asking rent",
    reason: "Different populations and dates; use illustrative bands only",
    sources: ["EXT-12"],
  },
  {
    claim: "A worn carpet can automatically be replaced at tenant cost",
    reason: "Evidence, age, fair wear and proportionate loss required",
    sources: ["EXT-5", "EXT-11"],
  },
] as const;
