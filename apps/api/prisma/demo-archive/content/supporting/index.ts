import type { ContentBlock } from "../../model.js";
import {
  documentFor,
  heading as h,
  para as p,
  table as t,
  type ContentContext,
} from "../context.js";
import { evidenceFacts } from "../property-management/facts.js";
import { seededInt } from "../../profiles/properties.js";

const titles: Record<string, string> = {
  C01: "Synthetic energy assessment source summary",
  C02: "Synthetic electrical report extract",
  C03: "Synthetic gas safety record extract",
  C04: "Compliance and information delivery record",
  C05: "Key custody change record",
  C06: "Historical-source receipt note",
  C07: "Document delivery acknowledgement",
  C08: "Matter closing and open-items summary",
};
export function authorSupporting(c: ContentContext) {
  if (!titles[c.slot.family]) throw new Error("Invalid supporting family.");
  const facts = evidenceFacts(c);
  const propertyVariant = seededInt(`${c.home.key}/source-review`, 0, 2);
  let blocks: ContentBlock[];
  switch (c.slot.family) {
    case "C01":
      blocks = [
        h("Original synthetic summary, not an EPC"),
        p(
          `Source assessment date 2024-06-01; DEMO-ENERGY-${c.home.key.replaceAll("/", "-")}. The fictional profile describes ${c.home.heating} heating, ${c.home.area_m2}m2 approximate area and the recorded dwelling category. No real assessor, lodgement number, official certificate or measured efficiency rating is represented.`,
        ),
        t(
          ["Observation", "Scope / limitation"],
          [
            ["Heating", c.home.heating],
            ["Building form", c.home.category],
            [
              "Potential improvement",
              propertyVariant === 0
                ? "Review heating controls and insulation suitability with independent advice"
                : propertyVariant === 1
                  ? "Consider draught reduction without obstructing ventilation"
                  : "Review lighting and control use before specifying works",
            ],
            [
              "Age/provenance",
              "Older supporting assessment is received as a historical source, not newly issued on this matter date",
            ],
          ],
        ),
        p(
          "An actual transaction may require a valid official EPC. This original synthetic summary and the recorded source date do not claim to replace it or establish a legal exemption.",
        ),
      ];
      break;
    case "C02":
      blocks = [
        h("Original assessment and remedial history"),
        p(
          `Historical source inspection 2024-07-18; DEMO-ELECTRICAL-${c.home.key.replaceAll("/", "-")}. This is an original fictional extract, not an EICR, engineer certificate or copied official layout. Stated source reinspection horizon 2029-07-18 remains a demonstration profile fact, subject to any earlier recorded requirement.`,
        ),
        t(
          ["Field", "Source result"],
          [
            ["Original assessment", facts.electrical.code],
            ["Observations", facts.electrical.observations.join("; ")],
            [
              "Remediation",
              facts.electrical.follow_up ??
                "No C1/C2/FI requiring a remedial closure is represented",
            ],
            [
              "Current interpretation",
              facts.electrical.code === "unsatisfactory"
                ? "Original result remains unsatisfactory; separate dated remedial evidence closes the identified issue before occupation"
                : "Original satisfactory classification retained with the stated improvement observation",
            ],
          ],
        ),
        p(
          "Do not relabel the original unsatisfactory result as satisfactory without its distinct follow-up. A valid source may carry forward between tenancies; receipt in a new matter does not reset its inspection date or establish that later alterations are covered.",
        ),
      ];
      break;
    case "C03":
      if (c.home.heating !== "gas")
        throw new Error("Gas report for electric-only property.");
      blocks = [
        h("Synthetic record, scope and supply"),
        p(
          `This original fictional extract concerns the gas heating appliance at ${c.home.key}/heating; it is not CP12, a Gas Safe engineer certificate or a valid registration. Source inspection date ${c.matter.cohort === "active-legacy-rental" ? "2026-10-01 (renewal; initial source 2025-10-01 retained in history)" : c.matter.cohort === "active-new-rental" ? "2026-05-10" : c.deal.type === "rental" ? "2025-02-01" : "2024-07-01"}. It is not invented as a newly issued official certificate merely because an agency receives the copy.`,
        ),
        t(
          ["Record", "Demonstration fact"],
          [
            [
              "Appliance",
              "Existing gas combination boiler; no electric-only home is assigned this family",
            ],
            [
              "Access",
              "Occupier/owner appointment and source delivery recorded separately",
            ],
            [
              "Observation",
              "Fictional source reports no unresolved dangerous classification; no real inspection is claimed",
            ],
            [
              "Validity boundary",
              "Use only for the stated source period; an expired historical copy is not current compliance",
            ],
          ],
        ),
        p(
          "Earlier and renewal dates must be read in sequence. The archive contains synthetic delivery/provenance records rather than a legally complete gas-safety service pack or an engineer's assurance for any real home.",
        ),
        t(
          ["Source scope note", "Observation / next action"],
          [
            [
              "Access and inspection limitation",
              propertyVariant === 0
                ? "Boiler enclosure and visible flue route are described in the fictional source; concealed routes are not certified by this extract"
                : propertyVariant === 1
                  ? "The fictional visit is limited to the landlord's boiler; no tenant-owned portable appliance is included"
                  : "The fictional source distinguishes the boiler check from the external condensate route; this summary does not diagnose frost protection",
            ],
            [
              "Action for management",
              propertyVariant === 0
                ? "Retain access to the enclosure for the next competent-person visit; do not obstruct it with stored furniture"
                : propertyVariant === 1
                  ? "Keep tenant-owned equipment outside the represented scope and ask for competent advice if its ownership or installation changes"
                  : "Ask the owner to review exposed pipe protection before winter if needed; no remedial work is claimed as completed in this extract",
            ],
          ],
        ),
      ];
      break;
    case "C04":
      blocks = [
        h("Named material and recipients"),
        p(
          `Delivery purpose: ${c.slot.purpose}. Recipient ${c.counterparty.name}; instructing principal ${c.client.name}. Date ${c.event.date}. ${c.slot.purpose.includes("reform") ? "The continuing written tenancy is recorded as receiving the Renters' Rights Act Information Sheet history before 31 May 2026. The actual exact official PDF is not reproduced or modified here." : c.slot.purpose.includes("written") ? "Written information is recorded before the new periodic tenancy agreement. This synthetic account does not claim that an original summary replaces all required prescribed material." : "The file records the dated source materials supplied, their validity boundaries and any original not reproduced in this archive."}`,
        ),
        t(
          ["Material", "Source / boundary"],
          [
            [
              "Electrical",
              "2024-07-18 source, with 2024-07-25 remediation where C2 recorded",
            ],
            [
              "Gas",
              c.home.heating === "gas"
                ? "Applicable dated gas history; renewal needed when its source period ends"
                : "Not applicable: property profile is electric-only",
            ],
            [
              "Energy",
              "2024-06-01 synthetic source summary, not an official EPC",
            ],
            [
              "Alarms",
              "Move-in check only where a supported possession event exists",
            ],
          ],
        ),
        p(
          "All named recipients are fictional. This is a synthetic delivery history, not an exact official sheet, proof of actual legal service or a legally complete statutory pack. Absence of an official original is disclosed rather than hidden by a claimed certificate.",
        ),
      ];
      break;
    case "C05":
      blocks = [
        h("Identified set and custody position"),
        t(
          ["Field", "Record"],
          [
            ["Set", `${c.home.key}/keys-a`],
            ["Count", String(1 + (c.index % 2))],
            [
              "Baseline custodian",
              "Owner, pending any separately recorded agency handover",
            ],
            ["Operative term at record date", c.clauses["key-custody"]!],
            [
              "Authority",
              "Only agreed viewings or repair appointments; no unrestricted entry right",
            ],
          ],
        ),
        p(
          "A later signed, resolved custody variation is a separate event, not a second copy of this receipt. A missing or additional set must be reconciled explicitly; no unexplained key duplication is created.",
        ),
        p(
          `Access limitation: ${c.home.access}. At completion or tenancy ending, the relevant handover identifies the recipient and date rather than presuming that every agency-held key may be released.`,
        ),
        t(
          ["Custody control", "Instruction for this appointment"],
          [
            [
              "Access request",
              c.index % 3 === 0
                ? "Owner-present appointment: no unaccompanied applicant or contractor receives this set"
                : c.index % 3 === 1
                  ? "Agency-accompanied appointment: log collection and return on the same day only after the current custodian authorises release"
                  : "Restricted access: contractor must provide a named attendee and agreed time; no after-hours release",
            ],
            [
              "Exception handling",
              c.index % 3 === 0
                ? "If the owner cannot attend, postpone rather than infer permission from key availability"
                : c.index % 3 === 1
                  ? "An unreturned set is escalated to the principal that day; do not create a replacement set without authority"
                  : "An attendee or time change needs renewed occupier approval before a key leaves the custodian",
            ],
          ],
        ),
      ];
      break;
    case "C06":
      blocks = [
        h("Historical provenance and receipt"),
        p(
          `Receipt on ${c.event.date} of the owner-held synthetic supporting index for ${c.home.key}. Source dates include energy 2024-06-01 and electrical 2024-07-18; any recorded electrical remediation is a distinct 2024-07-25 history. These are old source facts, not certificates newly issued at receipt.`,
        ),
        t(
          ["Source", "Trust / reuse boundary"],
          [
            [
              "Owner-held copy",
              "Synthetic historical copy, no claim of verified official authorship",
            ],
            [
              "Repeated property",
              c.matter.sequence === 2
                ? "Carry forward the same source dates; do not reset validity at relet or resale"
                : "Initial matter retains original source-date metadata for later reuse",
            ],
            [
              "Missing original",
              "Exact official certificates/forms not reproduced; request authoritative material for any real transaction",
            ],
          ],
        ),
        p(
          "Provenance identifies who supplied a copy and what it purports to describe; it does not authenticate an issuer, reproduce a licensed form or justify a current-compliance assertion from an expired record.",
        ),
        t(
          ["Source-specific review", "Result and action"],
          [
            [
              "Electrical source classification",
              `${facts.electrical.code}: ${facts.electrical.observations.join("; ")}`,
            ],
            [
              "Required follow-up",
              facts.electrical.follow_up ??
                "No serious coded defect in this source; preserve the original date, not a new inspection claim",
            ],
            [
              "Property restrictions",
              c.home.lease
                ? `Owner-supplied lease reference ${c.home.lease.reference}; ${c.home.lease.planned_works}. Refer the underlying copy to the conveyancer rather than treating the source index as consent`
                : "Freehold description only; ask the conveyancer to investigate title restrictions rather than invent a lease or managing-agent consent",
            ],
            [
              "Heating source applicability",
              c.home.heating === "gas"
                ? "Gas source validity must be checked at the relevant occupation/delivery date; electrical remediation is not a gas check"
                : "Electric-only profile: exclude gas certificates from the index and retain the applicable electrical source",
            ],
          ],
        ),
      ];
      break;
    case "C07":
      blocks = [
        h("Specific delivery acknowledgement"),
        p(
          `${c.slot.purpose} Delivery on ${c.event.date} to the relevant named recipient, linked to ${c.matter.key}. The acknowledgement identifies the actual document purpose rather than merely padding a case file with a duplicate export.`,
        ),
        t(
          ["Delivery detail", "Recorded scope"],
          [
            ["Principal", c.client.name],
            ["Counterparty where applicable", c.counterparty.name],
            [
              "Method",
              c.index % 3 === 0
                ? "Fictional email attachment to example-only contact"
                : c.index % 3 === 1
                  ? "Fictional hand-delivery acknowledgement"
                  : "Fictional durable electronic copy, recipient identified",
            ],
            [
              "Authority",
              "Acknowledgement of receipt only; not agreement to an unpaid fee or a deposit deduction",
            ],
          ],
        ),
        p(
          "No actual message was sent and no signature or identity was authenticated. Required exact official material, if not reproduced in this archive, is identified as missing rather than claimed to be an attached altered form.",
        ),
      ];
      break;
    case "C08":
      blocks = [
        h("Outcome and retained open items"),
        p(
          `Matter outcome: ${c.matter.cohort}. ${c.matter.cohort === "completed-sale" ? "Retain distinct conveyancer-reported exchange/completion confirmations, key authority and fee calculation." : c.matter.cohort === "ended-rental" ? "Possession ended before any subsequent matter; retain comparison, tenant response and the separate agreed deposit refund ledger." : "Instruction was withdrawn or progression stopped; no completion, move-in or automatic withdrawal fee is invented."}`,
        ),
        t(
          ["Open/closed item", "Disposition"],
          [
            [
              "Keys",
              `Reconcile set ${c.home.key}/keys-a to its dated custody and handover records`,
            ],
            [
              "Accounts",
              "Retain rent/fee/deposit ledgers separately; no bank instructions in the release",
            ],
            [
              "Property history",
              "Carry condition and source dates forward without resetting item age or creating a new certificate",
            ],
            [
              "Future matter",
              "Different deal key and counterparties where appropriate; no overlapping possession",
            ],
          ],
        ),
        p(
          "The closing note does not erase unknowns, prove a proposed document was executed or replace a missing official record. Relevant unresolved historical amendments remain unapplied and explicitly identified in the manifest.",
        ),
      ];
      break;
    default:
      throw new Error("Unhandled supporting family.");
  }
  return {
    ...documentFor(
      c,
      titles[c.slot.family]!,
      blocks,
      ["EXT-3", "EXT-4", "EXT-7", "EXT-8", "EXT-9"],
      ["C02", "C03"].includes(c.slot.family) ? "contractor" : "agency",
    ),
    evidence_facts: facts,
  };
}
