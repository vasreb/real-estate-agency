import type { CohortKey } from "./cohorts.js";

export type Purpose = {
  family: string;
  purpose: string;
  milestone: string;
  author: string;
  recipient: "principal" | "counterparty";
  optional?: boolean;
};
const p = (
  family: string,
  purpose: string,
  milestone: string,
  recipient: Purpose["recipient"] = "principal",
  author = "agency case officer",
): Purpose => ({ family, purpose, milestone, recipient, author });
const common = {
  energy: p(
    "C01",
    "Record the source and limitations of the owner-supplied synthetic energy assessment",
    "instruction",
  ),
  electrical: p(
    "C02",
    "Review electrical observations, report validity and any required follow-up",
    "compliance",
  ),
  gas: p(
    "C03",
    "Review the gas-installation record and supply evidence for this home",
    "compliance",
  ),
  supply: p(
    "C04",
    "Record compliance-document delivery and identify absent official originals",
    "compliance",
    "counterparty",
  ),
  keys: p(
    "C05",
    "Reconcile numbered agency key sets and authorised custody",
    "instruction",
  ),
  history: p(
    "C06",
    "Record receipt and provenance of an older owner-held supporting original",
    "instruction",
  ),
  delivery: p(
    "C07",
    "Acknowledge delivery of the identified instruction papers to the named principal",
    "instruction",
  ),
  close: p(
    "C08",
    "Close the agency matter with open items and final file-custody instructions",
    "closing",
  ),
};
const sale = {
  appraisal: p(
    "S01",
    "Explain the illustrative asking-price band and condition/tenure adjustments",
    "instruction",
  ),
  agency: p(
    "S02",
    "Agree the owner's sales instruction, agency fee and termination obligations",
    "instruction",
  ),
  listing: p(
    "S04",
    "Approve particulars derived from the shared property profile",
    "marketing",
  ),
  seller: p(
    "S05",
    "Record the owner's answers and unresolved property enquiries in an original questionnaire",
    "instruction",
  ),
  fixtures: p(
    "S06",
    "Identify included and excluded fittings using the room and equipment baseline",
    "marketing",
  ),
  offer: p(
    "S07",
    "Record the buyer's subject-to-contract offer and funding/chain position",
    "offer",
  ),
  memo: p(
    "S08",
    "Circulate nonbinding agreed commercial details and fictional conveyancer contacts",
    "offer",
    "counterparty",
  ),
  progression: p(
    "S09",
    "Record outstanding enquiries, dependencies and the next agreed follow-up",
    "progression",
  ),
  title: p(
    "S10",
    "Summarise synthetic tenure information without purporting to be a registered title",
    "progression",
  ),
  lease: p(
    "S11",
    "Review lease/service-charge and planned-works enquiries requiring confirmation",
    "progression",
  ),
  survey: p(
    "S12",
    "Record a specific survey concern and the parties' negotiated response",
    "progression",
  ),
  completion: p(
    "S13",
    "Record conveyancer-reported exchange and completion as separate confirmed events",
    "completion",
  ),
  handover: p(
    "S14",
    "Record authorised release of keys after confirmed completion",
    "completion",
    "counterparty",
  ),
  invoice: p(
    "S15",
    "Calculate the agreed agency fee on the completed price and operative fee clause",
    "completion",
  ),
  withdrawal: p(
    "S16",
    "Record the owner's withdrawal or failed progression and outstanding liabilities",
    "withdrawal",
  ),
};
const rent = {
  management: p(
    "R01",
    "Agree landlord-agent service scope, charges and repair authority",
    "instruction",
  ),
  listing: p(
    "R03",
    "Publish the asking rent, furnishing, bills and access facts from the property profile",
    "marketing",
  ),
  holding: p(
    "R04",
    "Agree a capped holding deposit, decision deadline and refund/credit treatment",
    "application",
    "counterparty",
  ),
  holdingOutcome: p(
    "R05",
    "Reconcile the holding-deposit receipt with its authorised credit or refund",
    "agreement",
    "counterparty",
  ),
  referencing: p(
    "R06",
    "Record fictional referencing outcome and any guarantor condition without identity documents",
    "application",
  ),
  tenancy: p(
    "R07",
    "Agree the dated tenancy terms, rent, deposit and property schedules",
    "agreement",
    "counterparty",
  ),
  guarantee: p(
    "R08",
    "Record the named guarantor's separate obligations and variation-consent boundary",
    "agreement",
    "counterparty",
  ),
  deposit: p(
    "R09",
    "Acknowledge the tenancy deposit separately from holding funds and rent",
    "agreement",
    "counterparty",
  ),
  protection: p(
    "R10",
    "Record synthetic protection/prescribed-information timing and missing official originals",
    "protection",
    "counterparty",
  ),
  inventory: p(
    "R11",
    "Establish room/item condition, age and evidence keys before possession",
    "move-in",
    "counterparty",
  ),
  checkin: p(
    "R12",
    "Record meter observations, key handover and alarm checks at move-in",
    "move-in",
    "counterparty",
  ),
  discrepancy: p(
    "R13",
    "Resolve a tenant-reported discrepancy against the named inventory item",
    "discrepancy",
    "counterparty",
  ),
  inspection: p(
    "R15",
    "Record inspection observations, occupant comments and agreed actions",
    "inspection",
  ),
  repair: p(
    "R16",
    "Obtain landlord authority for a specific evidenced maintenance scope and cost",
    "repair",
  ),
  contractor: p(
    "R17",
    "Record the contractor's findings, work performed and follow-up checks",
    "repair",
    "principal",
    "fictional maintenance contractor",
  ),
  invoice: p(
    "R18",
    "Reconcile the authorised repair scope, completed work and invoice amount",
    "repair",
    "principal",
    "fictional maintenance contractor",
  ),
  statement: p(
    "R19",
    "Reconcile period rent due, receipts and landlord remittance without bank instructions",
    "statement",
  ),
  increase: p(
    "R20",
    "Demonstrate the applicable statutory rent-review notice process without reproducing an official form",
    "rent-review",
    "counterparty",
  ),
  ending: p(
    "R21",
    "Record agreed tenancy-ending or surrender terms and possession arrangements",
    "ending",
    "counterparty",
  ),
  checkout: p(
    "R22",
    "Compare the same room/item keys at check-out with the check-in baseline",
    "checkout",
    "counterparty",
  ),
  deductions: p(
    "R23",
    "Record an evidence-based deduction proposal, fair-wear allowance and tenant response",
    "settlement",
    "counterparty",
  ),
  settlement: p(
    "R24",
    "Reconcile agreed proportionate loss, disputed balance and deposit refund",
    "settlement",
    "counterparty",
  ),
};

/** Core dependencies first, then distinct supported optional events, never duplicate exports. */
export function purposesFor(
  cohort: CohortKey,
  gas: boolean,
  leasehold: boolean,
  guarantor: boolean,
): Purpose[] {
  const compliance = [
    common.energy,
    common.electrical,
    ...(gas ? [common.gas] : []),
    common.supply,
  ];
  switch (cohort) {
    case "marketed-sale":
      return [
        sale.agency,
        sale.appraisal,
        sale.listing,
        sale.seller,
        sale.fixtures,
        common.energy,
        common.keys,
        common.delivery,
        common.history,
        common.electrical,
      ];
    case "completed-sale":
      return [
        sale.agency,
        sale.appraisal,
        sale.listing,
        sale.seller,
        sale.fixtures,
        sale.offer,
        sale.memo,
        sale.progression,
        sale.title,
        ...(leasehold ? [sale.lease] : []),
        sale.survey,
        sale.completion,
        sale.handover,
        sale.invoice,
        common.close,
        ...compliance,
        common.keys,
        common.history,
        common.delivery,
        p(
          "S08",
          "Circulate revised nonbinding memorandum after the survey negotiation",
          "negotiation",
          "counterparty",
        ),
        p(
          "S09",
          "Confirm closure of the specific funding/chain dependency before exchange",
          "exchange",
        ),
        p(
          "C07",
          "Acknowledge receipt of the final fee statement and closing papers",
          "closing",
        ),
      ];
    case "progressing-sale":
      return [
        sale.agency,
        sale.appraisal,
        sale.listing,
        sale.seller,
        sale.fixtures,
        sale.offer,
        sale.memo,
        sale.progression,
        sale.title,
        sale.survey,
        ...(leasehold ? [sale.lease] : []),
        common.energy,
        common.keys,
        common.delivery,
        common.history,
        common.electrical,
        p(
          "S09",
          "Review the lender/survey enquiry still preventing exchange",
          "negotiation",
        ),
        p(
          "S08",
          "Circulate an agreed subject-to-contract price revision without inventing completion",
          "negotiation",
          "counterparty",
        ),
      ];
    case "withdrawn-sale":
      return [
        sale.agency,
        sale.appraisal,
        sale.listing,
        sale.seller,
        sale.withdrawal,
        common.close,
        common.keys,
        common.delivery,
        common.energy,
        common.history,
        sale.offer,
        sale.memo,
        sale.progression,
        sale.survey,
        sale.fixtures,
      ];
    case "withdrawn-rental":
      return [
        rent.management,
        p(
          "C08",
          "Record withdrawal before any letting, holding deposit or move-in",
          "withdrawal",
        ),
        common.keys,
        common.delivery,
        common.energy,
        rent.listing,
        common.history,
      ];
    case "pre-let":
      return [
        rent.management,
        rent.listing,
        rent.holding,
        rent.referencing,
        p(
          "R07",
          "Prepare unexecuted periodic tenancy terms with no completed move-in claim",
          "application",
          "counterparty",
        ),
        common.energy,
        common.keys,
        common.delivery,
        common.history,
        common.electrical,
      ];
    case "active-new-rental":
      return [
        rent.management,
        rent.listing,
        rent.holding,
        rent.holdingOutcome,
        rent.referencing,
        p(
          "C04",
          "Supply the required written tenancy information before any new periodic agreement is made",
          "compliance",
          "counterparty",
        ),
        rent.tenancy,
        ...(guarantor ? [rent.guarantee] : []),
        rent.deposit,
        rent.protection,
        rent.inventory,
        rent.checkin,
        ...(!guarantor ? [common.supply] : []),
        common.electrical,
        common.energy,
        ...(gas ? [common.gas] : []),
        rent.discrepancy,
        common.keys,
        p(
          "C07",
          "Record the tenant's acknowledgement of the written terms and property schedules",
          "agreement",
          "counterparty",
        ),
      ];
    case "active-legacy-rental":
      return [
        rent.management,
        rent.listing,
        rent.holding,
        rent.holdingOutcome,
        rent.referencing,
        rent.tenancy,
        ...(guarantor ? [rent.guarantee] : []),
        rent.deposit,
        rent.protection,
        rent.inventory,
        rent.checkin,
        p(
          "C04",
          "Record reform information-sheet delivery to every named continuing tenant",
          "reform",
          "counterparty",
        ),
        rent.inspection,
        rent.statement,
        common.electrical,
        common.energy,
        ...(gas ? [common.gas] : []),
        rent.repair,
        rent.contractor,
        rent.invoice,
        rent.increase,
        rent.discrepancy,
        common.keys,
        common.history,
        common.delivery,
      ];
    case "ended-rental":
      return [
        rent.management,
        rent.listing,
        rent.holding,
        rent.holdingOutcome,
        rent.referencing,
        rent.tenancy,
        ...(guarantor ? [rent.guarantee] : []),
        rent.deposit,
        rent.protection,
        rent.inventory,
        rent.checkin,
        rent.ending,
        rent.checkout,
        rent.deductions,
        rent.settlement,
        common.close,
        rent.inspection,
        rent.repair,
        rent.contractor,
        rent.invoice,
        rent.statement,
        common.electrical,
        common.supply,
        common.energy,
        ...(gas ? [common.gas] : []),
        rent.discrepancy,
        common.keys,
        common.history,
        common.delivery,
        p(
          "R19",
          "Reconcile the final rent account through the agreed surrender date",
          "ending",
        ),
        p(
          "R23",
          "Record the tenant's item-specific counterproposal and revised fair-wear allowance",
          "settlement",
          "counterparty",
        ),
        p(
          "C07",
          "Acknowledge receipt of the agreed closing account without payment instructions",
          "closing",
          "counterparty",
        ),
      ];
  }
}
