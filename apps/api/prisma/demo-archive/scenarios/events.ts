import { dateSchema } from "@agency/contracts";
import { corpus } from "../model.js";
import { seededInt } from "../profiles/properties.js";
import { validateProfiles, type Profiles } from "../profiles/agency.js";
import { amendmentCount } from "./amendments.js";
import { cohortForIndex, cohorts, offsets, type CohortKey } from "./cohorts.js";
import { purposesFor } from "./case-inventories.js";

export type CaseEvent = {
  key: string;
  kind: string;
  date: string;
  depends_on: string[];
  description: string;
};
export type Slot = {
  key: string;
  family: string;
  event_key: string;
  purpose: string;
  author_role: string;
  recipient_actor_keys: string[];
  amendment: boolean;
  contractual_fee_basis: string | null;
};
export type CaseOutline = {
  key: string;
  deal_id: string;
  property_id: string;
  principal_key: string;
  counterparty_key: string;
  cohort: CohortKey;
  sequence: 1 | 2;
  variant: string;
  events: CaseEvent[];
  slots: Slot[];
  possession: { start: string; end: string | null } | null;
  ingest_at: string;
};

function dateAt(start: string, days: number) {
  return new Date(Date.parse(start) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
function milestoneDates(
  cohort: CohortKey,
  index: number,
): Record<string, string> {
  const base =
    cohort === "ended-rental"
      ? "2025-01-10"
      : cohort === "active-legacy-rental"
        ? "2025-08-10"
        : cohort === "active-new-rental"
          ? "2026-05-01"
          : cohort === "completed-sale"
            ? "2025-01-15"
            : cohort === "progressing-sale"
              ? "2026-08-15"
              : cohort === "marketed-sale" || cohort === "pre-let"
                ? "2026-10-15"
                : "2026-08-10";
  const start = dateAt(
    base,
    cohort === "active-new-rental" ? index % 3 : index % 10,
  );
  const isRental = [
    "ended-rental",
    "active-legacy-rental",
    "active-new-rental",
  ].includes(cohort);
  const agreement =
    cohort === "ended-rental"
      ? "2025-02-20"
      : cohort === "active-legacy-rental"
        ? "2025-10-20"
        : "2026-05-20";
  return {
    instruction: start,
    marketing: dateAt(start, 5),
    application: isRental ? dateAt(agreement, -10) : dateAt(start, 10),
    agreement: isRental ? agreement : dateAt(start, 12),
    compliance: isRental ? dateAt(agreement, -2) : dateAt(start, 7),
    protection: dateAt(agreement, 5),
    "move-in":
      cohort === "ended-rental"
        ? "2025-03-01"
        : cohort === "active-legacy-rental"
          ? "2025-11-01"
          : "2026-06-01",
    discrepancy: dateAt(agreement, 15),
    inspection: cohort === "ended-rental" ? "2025-06-15" : "2026-07-15",
    repair: cohort === "ended-rental" ? "2025-07-10" : "2026-08-10",
    statement: cohort === "ended-rental" ? "2025-08-01" : "2026-09-01",
    reform: "2026-05-20",
    "rent-review": "2026-09-01",
    ending: "2025-11-01",
    checkout: "2025-12-31",
    settlement: "2026-01-14",
    offer: dateAt(start, cohort === "withdrawn-sale" ? 8 : 15),
    progression: dateAt(start, cohort === "withdrawn-sale" ? 14 : 30),
    negotiation: dateAt(start, cohort === "withdrawn-sale" ? 16 : 45),
    exchange: dateAt(start, 60),
    completion: dateAt(start, 75),
    withdrawal: dateAt(start, 20),
    closing:
      cohort === "ended-rental"
        ? "2026-01-21"
        : cohort === "completed-sale"
          ? dateAt(start, 80)
          : dateAt(start, 25),
  };
}
export function compileCases(profiles: Profiles): CaseOutline[] {
  validateProfiles(profiles);
  const seen = new Map<CohortKey, number>();
  const cases = profiles.entities.deals.map((deal, index): CaseOutline => {
    const key = `deal/${String(index + 1).padStart(3, "0")}`;
    const cohort = cohortForIndex(index);
    const definition = cohorts.find((c) => c.key === cohort)!;
    const cohortIndex = seen.get(cohort) ?? 0;
    seen.set(cohort, cohortIndex + 1);
    const groupIndices = profiles.entities.deals
      .map((_, i) => i)
      .filter((i) => cohortForIndex(i) === cohort)
      .sort(
        (a, b) =>
          seededInt(`offset/${a}`, 0, 0x7fff_ffff) -
          seededInt(`offset/${b}`, 0, 0x7fff_ffff),
      );
    const budget =
      definition.mean + offsets(cohort)[groupIndices.indexOf(index)]!;
    const home = profiles.properties.find(
      (p) => p.property_id === deal.property_id,
    )!;
    const principal = profiles.principals.find(
      (p) => p.client_id === deal.client_id,
    )!;
    const counterparty_key = `counterparty/${String(index + 1).padStart(3, "0")}`;
    const sequence = index < 96 ? 1 : 2;
    const dates = milestoneDates(cohort, index);
    const amendments = amendmentCount(cohort, cohortIndex);
    const purposes = purposesFor(
      cohort,
      home.heating === "gas",
      home.tenure === "leasehold",
      profiles.actors.some((a) => a.key === `${counterparty_key}/guarantor`),
    );
    if (purposes.length < budget - amendments)
      throw new Error(
        `Authored inventory too small for ${key}; repair purpose inventory, not quotas.`,
      );
    const events: CaseEvent[] = [
      {
        key: `${key}/instruction`,
        kind: "instruction",
        date: dates.instruction!,
        depends_on: [],
        description: "The instructing principal opens this agency matter.",
      },
    ];
    const slots: Slot[] = [];
    const chosen = purposes.slice(0, budget - amendments);
    for (const [i, purpose] of chosen.entries()) {
      const eventKey = `${key}/event-${i + 1}`;
      const depends =
        purpose.milestone === "completion"
          ? [`${key}/exchange`]
          : [`${key}/instruction`];
      events.push({
        key: eventKey,
        kind: purpose.milestone,
        date:
          purpose.family === "R17"
            ? dateAt(dates.repair!, 2)
            : purpose.family === "R18"
              ? dateAt(dates.repair!, 3)
              : purpose.family === "R23"
                ? purpose.purpose.includes("counterproposal")
                  ? "2026-01-12"
                  : "2026-01-10"
                : purpose.family === "R24"
                  ? "2026-01-16"
                  : purpose.family === "R19" &&
                      purpose.purpose.includes("final rent")
                    ? "2026-01-06"
                    : purpose.family === "C03" &&
                        cohort === "active-legacy-rental"
                      ? "2026-10-01"
                      : dates[purpose.milestone]!,
        depends_on: depends,
        description: purpose.purpose,
      });
      slots.push({
        key: `${key}/document-${i + 1}`,
        family: purpose.family,
        event_key: eventKey,
        purpose: purpose.purpose,
        author_role: purpose.author,
        recipient_actor_keys:
          purpose.recipient === "counterparty"
            ? [counterparty_key]
            : principal.actor_keys,
        amendment: false,
        contractual_fee_basis:
          purpose.family === "S15"
            ? "Operative sales agency fee payable on confirmed completion"
            : null,
      });
    }
    if (cohort === "completed-sale")
      events.push({
        key: `${key}/exchange`,
        kind: "exchange",
        date: dates.exchange!,
        depends_on: [`${key}/instruction`],
        description:
          "Fictional conveyancer confirms exchange; not an agency-made sale contract.",
      });
    if (cohort === "ended-rental" && index % 3 === 0)
      events.push({
        key: `${key}/rent-catchup`,
        kind: "rent-receipt",
        date: "2025-08-08",
        depends_on: [`${key}/instruction`],
        description:
          "The GBP100 August shortfall is received; later closing accounts do not leave it silently unpaid or deduct it twice.",
      });
    for (let i = 0; i < amendments; i++) {
      const eventKey = `${key}/amendment-event-${i + 1}`;
      const tenancyChange =
        deal.type === "rental" && i > 0 && cohort !== "pre-let";
      const parentFamily = tenancyChange
        ? "R07"
        : deal.type === "sale"
          ? "S02"
          : "R01";
      const parentSlot = slots.find((s) => s.family === parentFamily);
      if (!parentSlot)
        throw new Error("Amendment inventory lacks base agreement.");
      events.push({
        key: eventKey,
        kind: "amendment",
        date: dateAt(
          tenancyChange ? dates.agreement! : dates.instruction!,
          tenancyChange ? 30 + i * 10 : 8 + i * 2,
        ),
        depends_on: [parentSlot.event_key],
        description:
          "Principal and relevant parties record a specific proposed or simulated-executed clause change.",
      });
      slots.push({
        key: `${key}/amendment-${i + 1}`,
        family:
          deal.type === "sale"
            ? "S03"
            : i === 0 || cohort === "pre-let"
              ? "R02"
              : "R14",
        event_key: eventKey,
        purpose:
          "Record a clause-specific old/new term, reason, retained terms and explicit simulated execution state.",
        author_role: "agency contract administrator",
        recipient_actor_keys: principal.actor_keys,
        amendment: true,
        contractual_fee_basis: null,
      });
    }
    const possession = profiles.possession.find((p) => p.deal_id === deal.id);
    return {
      key,
      deal_id: deal.id,
      property_id: deal.property_id,
      principal_key: principal.key,
      counterparty_key,
      cohort,
      sequence,
      variant: [
        "chain-dependent / evidence-led repair",
        "no-chain / no-loss return",
        "survey-negotiated / contested proportionate loss",
      ][index % 3]!,
      events,
      slots,
      possession: possession
        ? { start: possession.start, end: possession.end }
        : null,
      ingest_at: "2026-11-12T12:00:00.000Z",
    };
  });
  validateCases(cases);
  return cases;
}

export function validateCases(cases: readonly CaseOutline[]): void {
  if (cases.length !== 120 || cases.flatMap((c) => c.slots).length !== 2400)
    throw new Error("Case/file allocation mismatch.");
  const slots = cases.flatMap((c) => c.slots);
  if (
    new Set(slots.map((s) => s.key)).size !== slots.length ||
    slots.filter((s) => s.amendment).length !== 240 ||
    cases.filter((c) => c.slots.every((s) => !s.amendment)).length < 16
  )
    throw new Error(
      "Duplicate inventory identity or amendment distribution mismatch.",
    );
  for (const c of cases) {
    const events = new Map(c.events.map((e) => [e.key, e]));
    if (events.size !== c.events.length)
      throw new Error("Duplicate case event.");
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const visit = (key: string): void => {
      if (visiting.has(key)) throw new Error("Cyclic case event dependencies.");
      if (visited.has(key)) return;
      const event = events.get(key);
      if (!event) throw new Error("Missing case event dependency.");
      visiting.add(key);
      event.depends_on.forEach(visit);
      visiting.delete(key);
      visited.add(key);
    };
    c.events.forEach((e) => visit(e.key));
    if (c.slots.filter((s) => s.amendment).length > 6)
      throw new Error("Too many amendment instruments in one matter.");
    for (const event of c.events) {
      dateSchema.parse(event.date);
      if (
        event.date < "2025-01-01" ||
        event.date > corpus.as_of ||
        !event.description
      )
        throw new Error("Unsupported case event.");
      for (const parentKey of event.depends_on) {
        const parent = events.get(parentKey);
        if (!parent || parent.date > event.date)
          throw new Error("Causal event inversion.");
      }
      if (event.kind === "completion" && c.cohort !== "completed-sale")
        throw new Error("Completion outside completed-sale scenario.");
    }
    for (const slot of c.slots) {
      if (
        !events.has(slot.event_key) ||
        !slot.purpose ||
        !slot.author_role ||
        !slot.recipient_actor_keys.length
      )
        throw new Error(
          "Filler slot without causal event, purpose, author or recipient.",
        );
      if (
        slot.family === "S15" &&
        c.cohort !== "completed-sale" &&
        !slot.contractual_fee_basis
      )
        throw new Error("Unearned withdrawal fee invoice.");
    }
    if (
      c.possession &&
      cases.some(
        (other) =>
          other !== c &&
          other.property_id === c.property_id &&
          other.possession &&
          c.possession!.start < (other.possession.end ?? "9999-12-31") &&
          other.possession.start < (c.possession!.end ?? "9999-12-31"),
      )
    )
      throw new Error("Repeated-property possession overlap.");
  }
  for (const cohort of cohorts) {
    const group = cases.filter((c) => c.cohort === cohort.key);
    if (
      group.length !== cohort.count ||
      group.reduce((sum, c) => sum + c.slots.length, 0) !== cohort.files
    )
      throw new Error("Cohort allocation mismatch.");
  }
}
