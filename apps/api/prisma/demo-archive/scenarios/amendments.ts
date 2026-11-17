import { dateSchema, type DocumentMetadata } from "@agency/contracts";
import type { Profiles } from "../profiles/agency.js";
import type { CaseOutline } from "./events.js";

export const amendmentReasons = [
  {
    clause: "agency-fee",
    reason: "Reduced agency fee following a revised instruction scope",
    scope: "agency",
  },
  {
    clause: "marketing-scope",
    reason: "Pause public advertising while the owner completes agreed works",
    scope: "agency",
  },
  {
    clause: "service-level",
    reason: "Change from rent collection to full property management",
    scope: "management",
  },
  {
    clause: "repair-authority",
    reason: "Increase documented landlord repair-authorisation limit",
    scope: "management",
  },
  {
    clause: "parking",
    reason: "Record consent to use the previously excluded allocated bay",
    scope: "tenancy",
  },
  {
    clause: "furnishing",
    reason: "Remove named owner furniture and revise the inventory baseline",
    scope: "tenancy",
  },
  {
    clause: "bills",
    reason:
      "Clarify responsibility for named utility accounts without profit resale",
    scope: "tenancy",
  },
  {
    clause: "access",
    reason: "Agree a named inspection appointment and contact method",
    scope: "tenancy",
  },
  {
    clause: "pet-permission",
    reason: "Record permission for the individually described household pet",
    scope: "tenancy",
  },
  {
    clause: "administration",
    reason: "Change correspondence address and delivery contact only",
    scope: "agency",
  },
  {
    clause: "key-custody",
    reason: "Transfer a numbered management key set with a custody receipt",
    scope: "management",
  },
  {
    clause: "viewing-arrangements",
    reason: "Restrict occupied-property viewings to agreed accompanied windows",
    scope: "agency",
  },
] as const;

export type Amendment = {
  key: string;
  contract_key: string | null;
  deal_key: string;
  clause_key: string;
  old_term: string;
  new_term: string;
  reason: string;
  effective_from: string;
  document_date: string;
  status: DocumentMetadata["status"];
  retained_terms: string;
  unresolved_reason: string | null;
  consent: {
    treatment: "novation" | "specific-consent";
    actor_keys: string[];
    guarantor_consented: boolean;
  } | null;
};
export function makeAmendment(input: {
  key: string;
  contract_key: string;
  deal_key: string;
  reason_index: number;
  date: string;
  status: Amendment["status"];
  old_term: string;
  new_term: string;
}): Amendment {
  dateSchema.parse(input.date);
  const reason = amendmentReasons[input.reason_index];
  if (
    !reason ||
    !input.old_term ||
    !input.new_term ||
    input.old_term === input.new_term
  )
    throw new Error("Amendment needs an identifiable operative old/new term.");
  return {
    key: input.key,
    contract_key: input.contract_key,
    deal_key: input.deal_key,
    clause_key: reason.clause,
    old_term: input.old_term,
    new_term: input.new_term,
    reason: reason.reason,
    document_date: input.date,
    effective_from: input.date,
    status: input.status,
    retained_terms:
      "All identified base agreement terms not expressly varied remain unchanged; no statutory right is displaced.",
    unresolved_reason: null,
    consent: null,
  };
}

/** Together these cohort counts reserve 240 instruments over 104 amended matters. */
export function amendmentCount(cohort: string, indexInCohort: number): number {
  switch (cohort) {
    case "ended-rental":
      return 4;
    case "active-legacy-rental":
      return 3;
    case "active-new-rental":
      return 2;
    case "pre-let":
    case "completed-sale":
    case "progressing-sale":
      return 1;
    case "withdrawn-sale":
      return indexInCohort < 4 ? 1 : 0;
    case "marketed-sale":
    case "withdrawn-rental":
      return 0;
    default:
      throw new Error("Unknown amendment cohort.");
  }
}

export type AmendmentInstrument = Amendment & {
  base_agreement: {
    number: string;
    date: string;
    party_actor_keys: string[];
    clause: string;
  };
  simulated_signature: boolean;
};

/** All relationships are logical generator keys; final UUID mapping belongs to the compiler. */
export function compileAmendmentInstruments(
  cases: readonly CaseOutline[],
  profiles: Profiles,
): AmendmentInstrument[] {
  const instruments: AmendmentInstrument[] = [];
  const agencyReasons = [0, 1, 9, 11];
  const managementReasons = [2, 3, 10];
  for (const [caseIndex, c] of cases.entries()) {
    const home = profiles.properties.find(
      (p) => p.property_id === c.property_id,
    )!;
    const principal = profiles.principals.find(
      (p) => p.key === c.principal_key,
    )!;
    const bed = home.rooms
      .flatMap((room) => room.items)
      .find(
        (item) =>
          item.description === "Bed frame and mattress" &&
          !instruments.some(
            (earlier) =>
              earlier.status === "signed" &&
              earlier.contract_key &&
              earlier.clause_key === "furnishing" &&
              earlier.old_term.includes(item.key),
          ),
      );
    const usedTenancyReasons = new Set<number>();
    for (const [within, slot] of c.slots.filter((s) => s.amendment).entries()) {
      let reasonIndex =
        slot.family === "S03"
          ? agencyReasons[caseIndex % agencyReasons.length]!
          : slot.family === "R02"
            ? managementReasons[caseIndex % managementReasons.length]!
            : 4 + ((caseIndex + within) % 5);
      if (slot.family === "R14") {
        const eligible = [4, 5, 6, 7, 8].filter(
          (reason) =>
            !usedTenancyReasons.has(reason) &&
            (reason !== 4 || home.parking.startsWith("One allocated")) &&
            (reason !== 5 || !!bed),
        );
        reasonIndex = eligible.includes(reasonIndex)
          ? reasonIndex
          : eligible[0]!;
        if (reasonIndex === undefined)
          throw new Error("No supported distinct tenancy change reason.");
        usedTenancyReasons.add(reasonIndex);
      }
      const reason = amendmentReasons[reasonIndex]!;
      const parentFamily =
        slot.family === "S03" ? "S02" : slot.family === "R02" ? "R01" : "R07";
      const parent = c.slots.find((s) => s.family === parentFamily);
      const event = c.events.find((e) => e.key === slot.event_key)!;
      if (!parent)
        throw new Error("Missing same-deal base agreement for amendment.");
      const baseEvent = c.events.find((e) => e.key === parent.event_key)!;
      const day = 5 + (caseIndex % 20);
      const terms: Record<string, [string, string]> = {
        "agency-fee": [
          String(125 + (caseIndex % 4) * 5),
          String(100 + (caseIndex % 4) * 5),
        ],
        "marketing-scope": [
          "Public portal and accompanied viewing instruction",
          `Pause public portal marketing for ${14 + (caseIndex % 4) * 7} days for the owner's documented works; accompanied pre-arranged enquiries only`,
        ],
        "service-level": [
          "Rent collection only; owner appoints contractors",
          `Full management with inspections every ${caseIndex % 2 === 0 ? 3 : 4} months; owner retains statutory duties`,
        ],
        "repair-authority": [
          String(10_000 + (caseIndex % 5) * 2500),
          String(25_000 + (caseIndex % 5) * 5000),
        ],
        parking: [
          "Allocated bay excluded from occupation rights",
          `Owner consents to use of the existing allocated bay ${home.key}/bay-1; no additional rent or third-party right created`,
        ],
        furnishing: [
          bed
            ? `${bed.key} supplied in the inventory`
            : "No removable bed supplied",
          bed
            ? `Owner removes ${bed.key} by agreed appointment; retain the recorded floor and wall baseline`
            : "No furniture change authorised",
        ],
        bills: [
          "Tenant arranges and pays broadband directly",
          `Owner supplies a broadband connection capped at GBP${25 + (caseIndex % 5) * 5} per month within existing rent; no utility resale profit or extra tenant fee`,
        ],
        access: [
          "Inspection appointment to be agreed in writing",
          `Consent to one accompanied inspection on day ${day} of the following calendar month, ${caseIndex % 2 ? "10:00-11:00" : "14:00-15:00"}; rearrange by agreement, no general entry waiver`,
        ],
        "pet-permission": [
          "No individual pet request recorded",
          `Permission for one ${caseIndex % 2 ? "adult indoor cat" : "small adult dog"}; no pet deposit, prohibited fee or displacement of statutory rights`,
        ],
        administration: [
          "Instruction correspondence to principal's original example contact",
          `Copy non-sensitive instruction correspondence to case.${caseIndex + 1}@owners.example; no change of contracting principal`,
        ],
        "key-custody": [
          `One management key set ${home.key}/keys-a held by owner`,
          `Transfer set ${home.key}/keys-a to agency logged custody for named repair appointments only; ${1 + (caseIndex % 2)} keys recorded`,
        ],
        "viewing-arrangements": [
          "Accompanied weekday viewings by prior agreement",
          `Accompanied ${caseIndex % 2 ? "Saturday 10:00-12:00" : "Tuesday 16:00-18:00"} windows only; specific occupant consent remains required`,
        ],
      };
      const [oldTerm, newTerm] = terms[reason.clause]!;
      const serial = instruments.length;
      const status =
        serial < 210 ? "signed" : serial < 230 ? "draft" : "unknown";
      const unresolved = serial >= 238;
      const change = makeAmendment({
        key: slot.key,
        contract_key: parent.key,
        deal_key: c.key,
        reason_index: reasonIndex,
        date: event.date,
        status,
        old_term: oldTerm,
        new_term: newTerm,
      });
      instruments.push({
        ...change,
        consent:
          parentFamily === "R07" &&
          profiles.actors.some(
            (actor) => actor.key === `${c.counterparty_key}/guarantor`,
          )
            ? {
                treatment: "specific-consent",
                actor_keys: [
                  ...principal.signatory_keys,
                  c.counterparty_key,
                  `${c.counterparty_key}/guarantor`,
                ],
                guarantor_consented: status === "signed",
              }
            : null,
        contract_key: unresolved ? null : parent.key,
        unresolved_reason: unresolved
          ? `Historical received original refers to DEMO-HISTORICAL-BASE-${serial + 1}; that earlier instruction agreement is not held. Do not substitute the current agency instruction or apply this unknown change.`
          : null,
        base_agreement: {
          number: unresolved
            ? `DEMO-HISTORICAL-BASE-${serial + 1}`
            : `DEMO-${parent.key.replaceAll("/", "-").toUpperCase()}`,
          date: unresolved ? "2025-01-02" : baseEvent.date,
          party_actor_keys: [
            ...principal.signatory_keys,
            ...(parentFamily === "R07"
              ? [c.counterparty_key]
              : ["agency/northbridge-vale"]),
          ],
          clause: reason.clause,
        },
        simulated_signature: status === "signed",
      });
    }
  }
  if (instruments.length !== 240)
    throw new Error("Amendment allocation mismatch.");
  return instruments;
}
