import type { ContentBlock } from "../../model.js";
import {
  documentFor,
  execution,
  gbp,
  heading as h,
  para as p,
  table as t,
  textOf,
  validateAuthored,
  type CaseDocument,
  type ContentContext,
} from "../context.js";
import { evidenceFacts, roomItemState } from "./facts.js";
import { repairFor } from "./repair.js";

const titles: Record<string, string> = {
  R11: "Inventory and room condition schedule",
  R12: "Check-in and alarm handover",
  R13: "Inventory discrepancy response",
  R15: "Periodic inspection report",
  R16: "Repair scope and landlord authorisation",
  R17: "Fictional contractor findings and work report",
  R18: "Maintenance invoice and reconciliation",
  R22: "Comparative check-out report",
  R23: "Deposit deduction proposal and response",
  R24: "Deposit settlement and refund ledger",
};
export function authorManagement(c: ContentContext): CaseDocument {
  if (c.deal.type !== "rental" || !titles[c.slot.family])
    throw new Error("Invalid property-management family.");
  if (
    ["R22", "R23", "R24"].includes(c.slot.family) &&
    c.matter.cohort !== "ended-rental"
  )
    throw new Error("Check-out/deposit outcome before an evidenced ending.");
  const facts = evidenceFacts(c);
  const floor = roomItemState(c, c.event.date)[0]!.items.find((item) =>
    item.key.endsWith("/floor"),
  )!;
  const repair = repairFor(c);
  const repairNet = repair.net;
  const repairVat = repair.vat;
  const repairTotal = repair.total;
  let blocks: ContentBlock[];
  switch (c.slot.family) {
    case "R11":
      blocks = [
        h("Baseline, method and scope"),
        p(
          `Inventory prepared for ${c.counterparty.name} at the supported possession start ${c.matter.possession!.start}. Base profile observations originate at ${c.home.condition_baseline_date}; item ages below are carried forward to this document date rather than reset at every letting. The schedule uses stable room/item keys, indicative dimensions and descriptive evidence, not copied photographs, a professional survey or a guarantee of concealed condition.`,
        ),
        p(
          "Condition terms distinguish normal use, pre-existing marks, absent items and a later authorised removal. Clean and serviceable does not mean new. The tenant may submit item-specific discrepancies for consideration; an unanswered schedule is not a licence to impose arbitrary deductions. No appliance-safety certification is inferred from an inventory observation.",
        ),
        t(
          ["Property baseline", "Recorded fact"],
          [
            ["Furnishing", c.home.furnishing],
            ["Heating", c.home.heating],
            ["Access", c.home.access],
            ["Outdoor space", c.home.outdoor_space],
            ["Known defect", c.home.defects[0]!.observation],
          ],
        ),
        ...roomItemState(c, c.event.date).flatMap((room): ContentBlock[] => [
          h(`${room.name} / ${room.key}`),
          p(
            `Indicative dimensions ${room.length_m.toFixed(2)}m x ${room.width_m.toFixed(2)}m; synthetic rectangle equivalent, not a survey measurement. Record of this room is tied to the same property throughout the matter. The floor, wall and door entries retain their own ages and pre-existing observations; furniture is listed only where the profile actually supplies it.`,
          ),
          t(
            ["Item / quantity", "Age and baseline", "Condition evidence"],
            room.items.map((item) => [
              `${item.key}\n${item.description} / quantity ${item.quantity}`,
              `${item.age_months} months at document date; ${item.present ? "present in this schedule" : "removed with identified consent"}`,
              item.condition,
            ]),
          ),
          p(
            `Room follow-up: ${room.key === c.home.rooms[0]!.key ? c.home.defects[0]!.action : "No separate material defect is diagnosed from this descriptive inspection. The tenant should identify any additional specific mark by the same item key rather than replacing the whole baseline."} Ordinary wear must be assessed against the age, condition and length of occupation, not against a new-item standard.`,
          ),
        ]),
        h("Evidence and discrepancy acknowledgement"),
        p(
          "No meter has been replaced or reset in this matter. Check-in reads, alarm checks and keys are recorded in the distinct handover event. A later furnishing amendment must identify the exact removed item; the original check-in record is retained and the later comparison marks the authorised removal instead of charging for a missing object.",
        ),
        execution(c, false),
      ];
      break;
    case "R12":
      blocks = [
        h("Possession, keys and observations"),
        p(
          `Possession starts ${c.matter.possession!.start}. Tenant ${c.counterparty.name} receives the agreed premises and numbered key set ${c.home.key}/keys-a. This records an actual simulated move-in event, not an application or draft. ${c.home.access}`,
        ),
        t(
          ["Meter key / unit", "Observed synthetic reading"],
          c.home.meters.map((meter) => [
            `${meter.key} / ${meter.unit}`,
            String(facts.meter_readings[meter.key]),
          ]),
        ),
        t(
          ["Alarm", "Move-in result"],
          c.home.alarms.map((alarm) => [
            `${alarm.key}: ${alarm.location} / ${alarm.type}`,
            "Demonstration functional check recorded at move-in; no independent engineer certification claimed",
          ]),
        ),
        p(
          "Meter identifiers are conspicuous DEMO references. Readings are observations on the same meter history, never an unexplained reset. The tenant is asked to raise a room/item discrepancy specifically and retain the dated condition baseline; the handover does not remove landlord safety duties.",
        ),
        execution(c, false),
      ];
      break;
    case "R13":
      blocks = [
        h("Tenant query and baseline response"),
        p(
          `${c.counterparty.name} identified the pre-existing walking-route wear at ${floor.key}. The initial schedule describes '${floor.condition}'. The response confirms that the reported edge/scuff observation is retained as a pre-existing mark, not newly caused damage. No additional sofa, appliance or furnished item is added.`,
        ),
        t(
          ["Issue", "Decision"],
          [
            ["Item key", floor.key],
            [
              "Evidence",
              "Original room schedule and tenant's item-specific description; no copied photo asserted",
            ],
            [
              "Correction",
              c.index % 3 === 0
                ? "Clarify extent of the existing threshold wear"
                : c.index % 3 === 1
                  ? "Confirm that the recorded baseline already includes the reported mark"
                  : "Add the tenant's wording while preserving the original dated observation",
            ],
            ["Financial effect", "No immediate fee or deposit deduction"],
          ],
        ),
        p(
          "The clarification travels with the original inventory and is considered at check-out. It is not a variation of rent, a replacement tenancy agreement or evidence of a new furnishing item.",
        ),
      ];
      break;
    case "R15":
      blocks = [
        h("Inspection observation and access"),
        p(
          `Inspection concerns the same rooms and item keys as the check-in schedule. ${c.home.defects[0]!.observation}. Reported issue: ${repair.symptom}. ${c.home.access}. Access is by agreed appointment; the agency-held key does not create a general entry right.`,
        ),
        t(
          ["Observation", "Decision / follow-up"],
          [
            [
              "Floor baseline",
              `${floor.key}: ordinary route wear remains distinguishable from new damage`,
            ],
            [
              repair.kind,
              `Ask an appropriate contractor to assess: ${repair.scope}. An agency observation is not a professional safety certificate`,
            ],
            [
              "Landlord",
              "Request authority for the described scope and cost before non-emergency work",
            ],
            [
              "Tenant",
              "Explain appointment arrangements and ask for prompt reporting of changes",
            ],
          ],
        ),
        p(
          `Operative repair-authority term: ${c.clauses["repair-authority"]} pence. A higher evidenced cost needs specific approval; service-level or scope proposals marked draft/unknown do not silently expand this authority.`,
        ),
      ];
      break;
    case "R16":
      blocks = [
        h("Specific work and approval"),
        p(
          `Reported fault: ${repair.symptom} at ${repair.target}. Proposed work: ${repair.scope}. This is not permission to replace unrelated items or diagnose a gas fault.`,
        ),
        t(
          ["Cost and authority", "Value / decision"],
          [
            ["Quoted net", gbp(repairNet)],
            ["Illustrative VAT", gbp(repairVat)],
            ["Authorised total", gbp(repairTotal)],
            [
              "Standing authority",
              `${c.clauses["repair-authority"]} pence; separate owner approval covers this specific job even if above that ceiling`,
            ],
            [
              "Approver",
              `${c.client.name}, through the named principal signatories`,
            ],
          ],
        ),
        p(
          `Approval on ${c.event.date} is specific to this work and cost. A material scope change requires renewed approval. ${c.matter.slots.some((s) => s.family === "R17") ? "A separate subsequent contractor report records what was actually found and done." : "Completion is not asserted by this approval; no contractor completion original is held in this pack."}`,
        ),
        execution(c, false),
      ];
      break;
    case "R17":
      blocks = [
        h("Original fictional contractor report"),
        p(
          `Issuer: Lantern Bench Maintenance Demonstration, an invented contractor, not an actual certified firm. Work item: ${repair.label}. Within the authorised scope, the fictional technician recorded: ${repair.outcome}. No gas work, whole-appliance replacement or statutory safety certificate is claimed.`,
        ),
        t(
          ["Evidence", "Result"],
          [
            ["Authorised work", repair.scope],
            [
              "Component",
              `DEMO-CONTROL-${c.index + 1}; deliberately not a valid product warranty identifier`,
            ],
            [
              "Cost basis",
              `${gbp(repairNet)} net plus ${gbp(repairVat)} illustrative VAT`,
            ],
            ["Follow-up", repair.follow_up],
          ],
        ),
        p(
          "The report follows the landlord authorisation date. Its scope and cost must reconcile to the maintenance invoice; it cannot be repurposed as evidence that a later check-out carpet loss was repaired.",
        ),
      ];
      break;
    case "R18":
      blocks = [
        h("Completed-work invoice"),
        t(
          ["Line", "Amount / basis"],
          [
            [repair.label, gbp(repairNet)],
            ["Illustrative VAT 20%", gbp(repairVat)],
            ["Total", gbp(repairTotal)],
            [
              "Authorisation",
              `Specific landlord approval for ${repair.target}`,
            ],
            [
              "Completion evidence",
              "Fictional contractor findings and controlled test, separately dated",
            ],
          ],
        ),
        p(
          `Invoice DEMO-MAINT-${c.index + 1}; Lantern Bench Maintenance Demonstration. Cost is charged to the landlord account, not automatically to the tenant or their deposit. No bank details, genuine tax number, payment demand or invented tenant damage is included.`,
        ),
        p(
          "The invoice follows the report of completed work. Any later accounting statement must distinguish this landlord maintenance cost from ordinary rent, a holding credit and a contested check-out deduction.",
        ),
      ];
      break;
    case "R22":
      blocks = [
        h("Like-for-like comparison"),
        p(
          `Check-out at the recorded possession end ${c.matter.possession!.end}; tenant ${c.counterparty.name}. Compare against the original check-in items and any dated discrepancy or simulated signed furnishing removal. Ordinary age-related wear is not treated as a new loss. Key set ${c.home.key}/keys-a is reconciled for the following matter without overlapping possession.`,
        ),
        t(
          ["Item", "Check-in / check-out outcome"],
          roomItemState(c, c.event.date).flatMap((room) =>
            room.items.map((item) => [
              item.key,
              !item.present
                ? "Removed by identified resolved furnishing consent; not a missing-item claim"
                : item.key === floor.key && c.index % 3 !== 1
                  ? `${item.condition}; ${c.index % 3 === 0 ? "new small local burn at outer edge" : "contested local stain distinct from the initial walking-route wear"}; obtain proportionate-loss evidence`
                  : `${item.condition}; no evidenced tenant-caused loss beyond ordinary wear`,
            ]),
          ),
        ),
        t(
          ["Meter", "Closing observed reading"],
          c.home.meters.map((meter) => [
            meter.key,
            String(facts.meter_readings[meter.key]),
          ]),
        ),
        p(
          "This comparison is evidence for a proposal, not unilateral consent to a deduction. A later new tenant inherits any unrepaired prior mark in their own baseline; it is not attributed to the later occupier.",
        ),
      ];
      break;
    case "R23":
      if (c.slot.purpose.includes("counterproposal")) {
        blocks = [
          h("Tenant's item-specific counterproposal"),
          p(
            `${c.counterparty.name} responds to the 10 January proposal concerning ${floor.key}. The check-in baseline already described '${floor.condition}'. The tenant asks the landlord to distinguish the additional local mark from this pre-existing wear and to allow for the floor's age rather than charge the replacement estimate in full.`,
          ),
          t(
            ["Response issue", "Position / proposed resolution"],
            [
              [
                "Landlord's original age-adjusted proposal",
                gbp(facts.proposed_deduction_pence),
              ],
              [
                "Tenant's response",
                c.index % 3 === 2
                  ? "Contests sole responsibility and points to the limited affected area"
                  : c.index % 3 === 0
                    ? "Accepts the local incident, with allowance for existing age and condition"
                    : "No additional loss is evidenced; requests full return",
              ],
              [
                "Revised figure offered for agreement",
                gbp(facts.agreed_deduction_pence),
              ],
              [
                "Deposit remaining if accepted",
                gbp(facts.remaining_deposit_pence),
              ],
            ],
          ),
          p(
            "This response is a negotiation record, not a unilateral scheme decision or a completed refund. Agreement is recorded separately on 14 January; the later refund ledger must not apply both the original and revised proposal or charge the unrelated oven maintenance cost.",
          ),
        ];
        break;
      }
      blocks = [
        h("Evidence-based proposal and tenant response"),
        p(
          c.index % 3 === 1
            ? "No tenant-caused loss is evidenced beyond normal wear. The proposal is a full deposit return, with no blanket cleaning or new-for-old charge."
            : `Claimed item ${floor.key}; the check-in baseline records '${floor.condition}'. The check-out comparison identifies a specific additional local mark. A fictional replacement-cost estimate is apportioned using a 96-month useful life and the item's age at check-out; it is not automatically charged in full.`,
        ),
        t(
          ["Stage", "Amount / evidence"],
          [
            ["Proposed age-adjusted loss", gbp(facts.proposed_deduction_pence)],
            [
              "Tenant position",
              c.index % 3 === 2
                ? "Disputes sole responsibility; points to pre-existing wear and limited affected area"
                : c.index % 3 === 0
                  ? "Accepts the local incident but requests allowance for existing age and condition"
                  : "Requests the full balance without deduction",
            ],
            [
              "Agreed proportionate figure if accepted",
              gbp(facts.agreed_deduction_pence),
            ],
            ["Remaining deposit", gbp(facts.remaining_deposit_pence)],
          ],
        ),
        p(
          "A proposal is not consent or a completed payment. The later settlement record must identify agreement and the refund ledger separately. No invoice for the earlier oven repair is used as support for this unrelated carpet issue.",
        ),
      ];
      break;
    case "R24":
      blocks = [
        h("Resolution of the specific condition issue"),
        p(
          c.index % 3 === 0
            ? "The tenant accepts the local burn incident but not full replacement liability. The landlord accepts the age-adjusted reduction with a further allowance for the existing condition; no separate repair invoice is fabricated."
            : c.index % 3 === 1
              ? "The comparison supports normal wear only. Both parties agree no condition deduction and the full deposit balance is returned; no contractor cost is shifted to this account."
              : "The local stain claim remains contested as to sole responsibility. The parties compromise on the smaller responsibility share shown below, rather than asserting an adjudicator decision or deducting the original proposal in full.",
        ),
        h("Agreed settlement and fictional refund event"),
        t(
          ["Ledger line", "GBP amount"],
          [
            ["Deposit held", c.money.deposit],
            [
              "Initial proposal, not automatically applied",
              gbp(facts.proposed_deduction_pence),
            ],
            [
              "Agreed deduction after response",
              gbp(facts.agreed_deduction_pence),
            ],
            ["Refund balance", gbp(facts.remaining_deposit_pence)],
            ["Agreement date", "2026-01-14"],
            ["Synthetic refund event", c.event.date],
          ],
        ),
        p(
          `The agreed sum concerns only the supported ${floor.key} comparison, with age, remaining life and proportionate responsibility considered. ${c.index % 3 === 1 ? "There is no deduction in this matter." : "The landlord's earlier proposal is retained; the tenant's response reduces the amount rather than being silently discarded."} The refund event follows agreement within ten days.`,
        ),
        p(
          "This is a fictional accounting record, not a bank instruction or proof of an actual payment. Earlier disputed figures do not become final merely because a proposal was issued. No automatic cleaning penalty or full new carpet charge is imposed.",
        ),
        execution(c, false),
      ];
      break;
    default:
      throw new Error("Unhandled management family.");
  }
  if (["R15", "R16", "R17", "R18"].includes(c.slot.family))
    blocks.unshift(
      t(
        ["Work item", "Shared order details"],
        [
          ["Target", repair.label],
          ["Reported symptom", repair.symptom],
          ["Authorised scope", repair.scope],
        ],
      ),
    );
  return {
    ...documentFor(
      c,
      titles[c.slot.family]!,
      blocks,
      ["EXT-5", "EXT-7", "EXT-8", "EXT-9", "EXT-11"],
      ["R17", "R18"].includes(c.slot.family) ? "contractor" : "agency",
    ),
    evidence_facts: facts,
  };
}

export function validateManagementDocument(
  doc: CaseDocument,
  c: ContentContext,
): void {
  validateAuthored(doc, c);
  const facts = doc.evidence_facts;
  if (!facts) throw new Error("Missing structured evidence facts.");
  if (
    JSON.stringify(facts.item_keys) !==
    JSON.stringify(evidenceFacts(c).item_keys)
  )
    throw new Error("Invented or omitted inventory item.");
  if (
    JSON.stringify(facts.meter_readings) !==
    JSON.stringify(evidenceFacts(c).meter_readings)
  )
    throw new Error("Unexplained meter reset or reading drift.");
  if (facts.agreed_deduction_pence && !facts.baseline_present)
    throw new Error("Deduction without condition baseline.");
  const serious = facts.electrical.observations.some((v) =>
    /C[12]\b|\bFI\b/.test(v),
  );
  if (
    serious &&
    (facts.electrical.code === "satisfactory" || !facts.electrical.follow_up)
  )
    throw new Error(
      "Contradictory electrical assessment or missing remedial follow-up.",
    );
  if (
    facts.remaining_deposit_pence !==
      (c.deal.type === "rental" ? c.rental_finances.deposit_pence : 0) -
        facts.agreed_deduction_pence ||
    facts.agreed_deduction_pence > facts.proposed_deduction_pence ||
    JSON.stringify(facts) !== JSON.stringify(evidenceFacts(c))
  )
    throw new Error("Evidence/settlement state drift.");
  if (c.slot.family === "C03" && c.home.heating !== "gas")
    throw new Error("Gas report for an electric-only home.");
  if (textOf(doc).includes("automatic new-for-old charge"))
    throw new Error("Unsupported loss treatment.");
}
