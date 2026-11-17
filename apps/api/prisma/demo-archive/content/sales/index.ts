import { corpus, type ContentBlock } from "../../model.js";
import {
  documentFor,
  execution,
  heading as h,
  para as p,
  table as t,
  type ContentContext,
} from "../context.js";
import { roomItemState } from "../property-management/facts.js";

const titles: Record<string, string> = {
  S01: "Residential market appraisal",
  S02: "Residential sales agency agreement",
  S03: "Sales instruction amendment",
  S04: "Approved sales particulars",
  S05: "Original seller property questionnaire",
  S06: "Fixtures and contents schedule",
  S07: "Subject-to-contract offer record",
  S08: "Memorandum of sale",
  S09: "Sales progression review",
  S10: "Synthetic title-information summary",
  S11: "Leasehold management enquiry summary",
  S12: "Survey and negotiation record",
  S13: "Exchange and completion confirmation",
  S14: "Completion key-release handover",
  S15: "Agency fee invoice",
  S16: "Withdrawal and fall-through report",
};

function agencyAgreement(c: ContentContext): ContentBlock[] {
  return [
    h("1. Parties, definitions and instruction"),
    p(
      `${c.client.name} instructs ${corpus.agency} to provide the sales agency services described below for ${c.property.address}. The principal comprises the individual signatories listed in the execution panel; a household display name is not a substitute for the consent of each co-owner. A corporate principal acts through the named authorised representative under the fictional authority recorded in its instruction file. The agency has no authority to sign a transfer, exchange contracts, commit the principal to a sale or receive an exchange deposit on the principal's behalf.`,
    ),
    p(
      "In this agreement, the property means the premises identified in Schedule A, the instruction means this agency appointment, an introduced purchaser means a person whose introduction is documented in the viewing or offer record, and completion means completion reported by the parties' conveyancers, not acceptance of an offer. A business day is a weekday other than an English public holiday. References to a written approval mean an identifiable approval from the principal, retained with this matter. An unanswered message is not approval.",
    ),
    h("2. Nature and limits of the service"),
    p(
      `This is an agency instruction, not a contract to sell the land. Initial marketing scope: ${c.baseClauses["marketing-scope"]}. The agency will prepare original particulars from the owner-supplied facts, arrange accompanied viewings, record offers accurately and coordinate progress with the named professional contacts. The principal remains responsible for checking the accuracy of the owner questionnaire and for taking independent conveyancing, valuation, tax and building-survey advice. The illustrative appraisal is not a secured-lending valuation and no sale price, buyer finance approval or completion date is guaranteed.`,
    ),
    p(
      `The appointment is ${c.index % 3 === 0 ? "sole agency for an initial twelve-week review period, without a sole-selling-rights fee merely because the owner finds a purchaser independently" : c.index % 3 === 1 ? "a non-exclusive agency appointment, requiring recorded discussion of any earlier agent introduction before a fee is agreed" : "a limited marketing-and-progression appointment with a written review after six weeks; any expansion requires the principal's approval"}. The principal must tell the agency about another agent's live instruction and any person already introduced. Before proceeding with a potentially overlapping introduction, the agency will explain the risk of two fees and request written clarification. This clause does not determine a disputed third party's contractual entitlement.`,
    ),
    h("3. Property information and marketing approval"),
    p(
      `Schedule A records ${c.home.category}, approximately ${c.home.area_m2} square metres, ${c.home.bedrooms} separate bedrooms and ${c.home.bathrooms} bathroom(s). Tenure is ${c.home.tenure}${c.home.share_of_freehold ? ", with an additional stated share-of-freehold interest that does not replace the leasehold title" : ""}. The agency will not turn an unverified statement into a warranty. Lease duration, service charges, proposed works, access limitations and known defects must be disclosed with their source and uncertainty. The principal will review the particulars before publication and promptly notify any material change.`,
    ),
    p(
      `Initial asking price: ${c.money.asking}. This figure is an invitation for offers, not an agreed transaction price or a representation of the property's current market value. ${c.home.defects[0]!.observation}. Proposed action: ${c.home.defects[0]!.action}. The agency will refer a technical diagnosis to a suitable independent professional rather than infer one from a photograph. A price reduction following a survey or funding issue is recorded as a dated offer/negotiation event and circulated to the parties; it is not silently substituted into earlier originals.`,
    ),
    h("4. Viewings, keys and occupied property"),
    p(
      `Viewing arrangement: ${c.baseClauses["viewing-arrangements"]}. Access: ${c.home.access}. The agency must obtain the relevant occupier's specific consent, protect security information and record custody of every key set. An agency-held key does not confer an unrestricted right of entry. If a tenant remains in occupation, a sale instruction does not itself establish vacant possession or entitle the agency to promise an ending date. Any proposed sale with occupation continuing must be identified in the memorandum and referred to the conveyancers.`,
    ),
    p(
      "The principal should secure valuables and disclose any known hazard affecting a viewing. The agency will not leave an applicant unattended or issue a key to a purchaser before an authorised completion release. A cancellation, lost key or access concern is logged and escalated to the principal. Reasonable rescheduling must be discussed rather than treated as a breach automatically attracting a penalty. Meter readings and final occupier arrangements remain matters for the dated handover and the parties' professional advisers.",
    ),
    h("5. Fee, basis of calculation and payment"),
    p(
      `The base agency fee is ${Number(c.baseClauses["agency-fee"]) / 100}% of the completed sale price excluding VAT; VAT is shown separately at the illustrative 20% rate. The fee becomes due only on a completed transaction with an evidenced contractual basis under this appointment. It is not charged merely because an offer is accepted, a memorandum is circulated or the principal withdraws. Any signed fee amendment must identify this agreement and the agency-fee clause, record the old and new basis and state its effective date. An unexecuted proposal or an unknown historical copy does not alter the operative rate.`,
    ),
    p(
      "No additional photography, portal, referral or abortive-sale charge is authorised by this document. If the principal later requests a separate paid service, the agency must first identify its scope, price and cancellation terms and obtain written approval; a contractor's invoice is not automatically an agency fee. The completion invoice must show the sale-price basis, operative percentage, net fee, VAT and total. This synthetic archive contains no bank account, payment instruction, valid tax registration or authority to transfer funds.",
    ),
    h("6. Offers, communication and professional boundaries"),
    p(
      "The agency records offers, funding representations, chain dependencies and any stated conditions without treating them as verified guarantees. A buyer's representative or conveyancer must be distinguished from the instructing seller. Offers and memoranda remain subject to contract unless and until the parties' conveyancers confirm exchange. The principal decides whether to accept or reject an offer after appropriate advice. The agency will keep a dated record of material changes and unresolved enquiries, identify who is expected to respond and state the next review date.",
    ),
    p(
      "Neither this appointment nor a memorandum replaces searches, survey reports, title investigation or a conveyancer's undertaking. A synthetic title summary is an administrative index of the documents said to be held; it is not an official register extract. The agency will not copy licensed Law Society forms, claim official certification or imply that simulated signatures have been cryptographically verified. Any agency-held professional copy in this archive must be labelled as a fictional third-party copy and tied to a particular case event.",
    ),
    h("7. Review, termination and retained records"),
    p(
      "Either party may request a review of scope and service. The principal may end this appointment by giving fourteen calendar days' written notice after the initial review period, or earlier by written agreement. This provision does not displace any applicable consumer cancellation right. The agency should explain the appointment and provide the principal with a durable copy before work begins. No blanket withdrawal penalty or new fee is created by termination. A disputed introduction, already approved separate service or live offer must be described expressly in the closing record rather than concealed in a standard charge.",
    ),
    p(
      "On ending the instruction the agency will stop marketing within a reasonable recorded period, cancel viewings, reconcile key custody and provide an open-items summary. Retained correspondence must be limited to the matter's legitimate administrative needs and shared only with the relevant parties. The principal should raise a complaint first with the agency's fictional operations lead; this demonstration does not purport to supply a real redress membership or an executable complaints procedure. No term purports to exclude a statutory duty, misrepresentation remedy or other right that cannot lawfully be excluded.",
    ),
    h("Schedule A. Property and instruction particulars"),
    t(
      ["Item", "Agreed baseline"],
      [
        ["Premises", c.property.address],
        ["Principal", c.client.name],
        ["Tenure", c.home.tenure],
        ["Outdoor space", c.home.outdoor_space],
        ["Parking", c.home.parking],
        ["Heating", c.home.heating],
        ["Instruction date", c.event.date],
        ["Correspondence", c.baseClauses.administration!],
      ],
    ),
    h("Schedule B. Execution and document limitations"),
    p(
      "The parties confirm that the recorded instruction scope and schedules have been read together. Each named household owner has a separate simulated execution line. A representative's capacity is stated instead of suggesting that a household label or trading name can sign. All signatures below are fictional markers for demonstration; no image of a real signature, official seal or verified electronic-signature certificate is supplied. This document is original synthetic drafting informed by public guidance, not a licensed standard form or advice on enforceability.",
    ),
    execution(c, true),
  ];
}

export function amendmentBlocks(c: ContentContext): ContentBlock[] {
  const a = c.amendment;
  if (!a)
    throw new Error("Amendment slot lacks a distinct operative instrument.");
  const actors = a.base_agreement.party_actor_keys.map(
    (key) =>
      c.profiles.actors.find((v) => v.key === key)?.name ??
      "Unresolved historical party",
  );
  return [
    h("1. Identified base agreement"),
    p(
      `Base agreement ${a.base_agreement.number}, dated ${a.base_agreement.date}; instructing principal ${c.client.name}, acting through its identified signatories/representative. Named execution participants: ${actors.join("; ")}. Property: ${c.property.address}. This instrument concerns clause/schedule '${a.clause_key}' only. ${a.unresolved_reason ?? "The held base agreement belongs to this same matter and is a contract, not another amendment."}`,
    ),
    h("2. Operative change"),
    p(
      a.clause_key === "agency-fee"
        ? "Fee-rate terms below are expressed in basis points of the completed price: 100 basis points equals 1%, excluding separately calculated VAT. This changes the landlord/seller's agency fee, not the tenant's rent."
        : a.clause_key === "repair-authority"
          ? "Repair-authority amounts below are integer GBP pence per distinct non-emergency job; 100 pence equals GBP1.00. No tenant charge is created."
          : "The replacement applies only to the identified clause or schedule and to the property and parties identified above.",
    ),
    t(
      ["Element", "Term"],
      [
        ["Existing term", a.old_term],
        ["Replacement term", a.new_term],
        ["Reason", a.reason],
        ["Effective date", a.effective_from],
        [
          "Execution state",
          a.status === "signed"
            ? "Simulated signed original"
            : a.status === "draft"
              ? "Draft - proposed terms only"
              : "Unknown historical execution - not applied",
        ],
      ],
    ),
    p(a.retained_terms),
    h("3. Scope and dependencies"),
    p(
      "This change does not substitute a statutory rent-increase notice, impose a prohibited tenant fee, release a guarantor without the required treatment or change a contracting party by implication. A party substitution would need scenario-specific novation/consent; none is created by this instrument. Any furnishing or key-custody change must be reconciled to the same identified inventory items or custody schedule.",
    ),
    h("4. Retention and execution"),
    p(
      a.status === "signed" && a.contract_key
        ? "This simulated signed, resolved instrument is applied to later operative snapshots on or after its effective date. Earlier dated originals remain unchanged."
        : "Do not apply this proposal or unresolved/unknown historical change to downstream rent, fees, possession, inventory or other operative state.",
    ),
    execution(c, true),
  ];
}

export function authorSales(c: ContentContext) {
  const title = titles[c.slot.family];
  if (!title || c.deal.type !== "sale")
    throw new Error("Invalid sales family or matter.");
  if (["S13", "S14", "S15"].includes(c.slot.family) && !c.hasCompletion)
    throw new Error("Completion artefact in uncompleted sale.");
  let blocks: ContentBlock[];
  switch (c.slot.family) {
    case "S02":
      blocks = agencyAgreement(c);
      break;
    case "S03":
      blocks = amendmentBlocks(c);
      break;
    case "S01":
      blocks = [
        h("Appraisal basis and illustrative band"),
        p(
          `Indicative asking price ${c.money.asking}. The ${c.home.area_m2}m2 ${c.home.category} is assessed against an authoring band adjusted for borough, size and recorded condition, not against scraped actual comparables. It is neither a mortgage valuation nor evidence that an ONS stock average equals a new asking price.`,
        ),
        t(
          ["Factor", "Evidence and effect"],
          [
            [
              "Accommodation",
              `${c.home.bedrooms} bedrooms / ${c.home.bathrooms} bathrooms; room schedule controls all particulars`,
            ],
            [
              "Tenure",
              `${c.home.tenure}; ${c.home.lease ? `${c.home.lease.years_remaining} years remaining in synthetic owner records` : "freehold; boundary/title enquiries remain outstanding"}`,
            ],
            ["Condition", c.home.defects[0]!.observation],
            [
              "Access and outdoor space",
              `${c.home.access}; ${c.home.outdoor_space}`,
            ],
          ],
        ),
        h("Marketing decision"),
        p(
          `The principal is asked to approve the particulars and the asking price before publication. ${c.index % 3 === 0 ? "Review after the first four accompanied viewings; do not assume a chain-dependent applicant can exchange immediately." : c.index % 3 === 1 ? "Prioritise applicants able to evidence funding; absence of a chain is not proof of available cash." : "Disclose the recorded condition issue and obtain a specific survey response before discussing a negotiated reduction."}`,
        ),
      ];
      break;
    case "S04":
      blocks = [
        h("Accommodation and material facts"),
        p(
          `${c.home.category}; approximate internal area ${c.home.area_m2}m2, ${c.home.bedrooms} separate bedrooms, ${c.home.bathrooms} bathrooms over ${c.home.floors} floor(s). Asking ${c.money.asking}; subject to contract. Room dimensions below are synthetic indicative rectangle equivalents, not a measured survey.`,
        ),
        t(
          ["Room", "Indicative dimensions"],
          c.home.rooms.map((r) => [
            r.name,
            `${r.length_m.toFixed(2)}m x ${r.width_m.toFixed(2)}m`,
          ]),
        ),
        p(
          `Tenure ${c.home.tenure}. ${c.home.lease ? `Remaining lease ${c.home.lease.years_remaining} years; annual service charge ${c.home.lease.annual_service_pence / 100} GBP in fictional records; ${c.home.lease.planned_works}.` : "Freehold description subject to conveyancer verification."} ${c.home.share_of_freehold ? "A stated share of freehold accompanies, rather than replaces, the leasehold interest." : ""}`,
        ),
        p(
          `Heating: ${c.home.heating}. Outdoor space: ${c.home.outdoor_space}. Parking: ${c.home.parking}. Access: ${c.home.access}. Known observation: ${c.home.defects[0]!.observation}. Occupation/possession must be confirmed by the conveyancers; marketing does not warrant vacant possession.`,
        ),
      ];
      break;
    case "S05":
      blocks = [
        h("Owner answers and source boundaries"),
        p(
          "This is an original synthetic owner questionnaire, not TA6 or another licensed Law Society form. Answers identify the owner's present knowledge, not an official search or guarantee.",
        ),
        t(
          ["Question", "Owner answer / follow-up"],
          [
            [
              "Who instructs the agency?",
              `${c.client.name}; all listed signatories confirm the instruction`,
            ],
            ["Known condition issue?", c.home.defects[0]!.observation],
            [
              "Alterations and consents?",
              c.index % 3 === 0
                ? "Internal kitchen refit reported; request owner-held invoices and consent evidence; no approval assumed"
                : c.index % 3 === 1
                  ? "No structural works reported during this ownership; conveyancer to investigate prior records"
                  : "Window replacement reported; documentary consent/guarantee copies not yet verified",
            ],
            ["Boundary/access issue?", c.home.access],
            [
              "Leasehold works?",
              c.home.lease?.planned_works ??
                "No leasehold service-charge regime is represented",
            ],
            [
              "What changes must be notified?",
              "Any new leak, neighbour issue, alteration, occupier change or material inaccuracy before exchange",
            ],
          ],
        ),
        p(
          "The principal will pass later corrections to the agent and conveyancer. An unknown answer remains unknown; no fictitious certificate, title number or actual resident is inserted to complete the form.",
        ),
      ];
      break;
    case "S06":
      blocks = [
        h("Room-linked inclusion schedule"),
        t(
          ["Item key", "Description / inclusion", "Condition baseline"],
          roomItemState(c, c.event.date).flatMap((r) =>
            r.items.map((item) => [
              item.key,
              `${r.name}: ${item.description}; ${!item.present ? "previously removed with consent; not offered as included" : /\/(bed|wardrobe|seating|small-table|fridge)$/.test(item.key) ? "loose contents; excluded unless specifically negotiated" : "included as an existing fixture"}`,
              item.condition,
            ]),
          ),
        ),
        p(
          `Heating equipment: ${c.home.equipment.map((e) => e.description).join("; ")}. This is a transaction-specific original schedule, not a licensed fittings form. Any later negotiated inclusion must identify the item and be confirmed to both conveyancers; it does not alter the room dimensions or prove appliance safety.`,
        ),
      ];
      break;
    case "S07":
      blocks = [
        h("Offer and funding representations"),
        p(
          `Subject to contract. ${c.counterparty.name} offers ${c.money.asking} against an advertised asking price of ${c.money.asking}. Funding is represented as ${c.index % 3 === 0 ? "mortgage plus equity from a related sale; chain and lender conditions remain outstanding" : c.index % 3 === 1 ? "savings-funded with no related sale; source and availability remain for professional verification" : "mortgage-backed, subject to an independent survey and valuation"}. No exchange deposit or payment instruction is requested by the agency.`,
        ),
        p(
          `Seller contact: ${c.solicitors.seller}. Buyer contact: ${c.solicitors.buyer}. The parties' positions and contacts are fictional. Acceptance is an instruction to progress enquiries, not exchange or a binding land sale.`,
        ),
        h("Next decision"),
        p(
          "Obtain the principal's recorded response, verify the intended conveyancer contacts and identify any conditions still to be resolved. Keep later survey negotiations separate from the original offer record.",
        ),
      ];
      break;
    case "S08":
      blocks = [
        h("Subject to contract - administrative memorandum"),
        p(
          `${c.client.name} as instructing seller; ${c.counterparty.name} as proposed buyer. Proposed consideration ${c.slot.purpose.includes("revised") || c.slot.purpose.includes("revision") ? c.money.agreed : c.money.asking}. ${c.slot.purpose.includes("revised") || c.slot.purpose.includes("revision") ? `Revision reflects the recorded survey negotiation; original asking/offer ${c.money.asking} is retained in earlier originals.` : "Any subsequent negotiation must be separately dated and circulated."}`,
        ),
        t(
          ["Role", "Fictional contact / condition"],
          [
            ["Seller conveyancer", c.solicitors.seller],
            ["Buyer conveyancer", c.solicitors.buyer],
            [
              "Funding/chain",
              c.index % 3 === 0
                ? "Dependent related sale; dates not guaranteed"
                : c.index % 3 === 1
                  ? "No related sale reported; funds still require verification"
                  : "Mortgage valuation and survey conditions outstanding",
            ],
            [
              "Possession",
              "Conveyancers must confirm the agreed basis; no automatic vacant-possession promise",
            ],
          ],
        ),
        p(
          "This memorandum records commercial instructions only. It is not a contract to sell land, does not constitute exchange and creates no authority for the agency to bind either party. Conveyancing enquiries and any proposed dates remain subject to the parties' professional advice.",
        ),
      ];
      break;
    case "S09":
      if (c.slot.purpose.includes("Confirm closure")) {
        blocks = [
          h("Dependency closure before exchange"),
          p(
            `The fictional conveyancer contacts confirm that the previously logged ${c.index % 3 === 0 ? "related-sale funding dependency" : c.index % 3 === 1 ? "owner-document enquiry" : "survey and lender-response condition"} has reached an agreed position. This dated closure is later than the initial outstanding-enquiry review. The principal authorises the conveyancers to consider exchange; the agency does not exchange for either party.`,
          ),
          t(
            ["Closure evidence", "Recorded position"],
            [
              ["Seller contact", c.solicitors.seller],
              ["Buyer contact", c.solicitors.buyer],
              ["Commercial price after negotiation", c.money.agreed],
              [
                "Remaining dependency",
                "Completion and key authority still require their separate later confirmation",
              ],
            ],
          ),
          p(
            "Retain the earlier open enquiry rather than silently replacing it with this outcome. This progress note is not a land-sale contract, professional undertaking or completion receipt.",
          ),
        ];
        break;
      }
      if (c.slot.purpose.includes("still preventing")) {
        blocks = [
          h("Further unresolved lender/survey review"),
          p(
            `Since the earlier progression review, the agency has requested the specific lender/survey clarification through ${c.solicitors.buyer}. The enquiry remains unresolved at this later review; neither party has confirmed exchange. The record is an actual follow-up on the named condition, not a duplicate export of the first progress note.`,
          ),
          t(
            ["Follow-up", "Owner / next decision"],
            [
              ["Current price position", c.money.agreed],
              ["Seller response", c.solicitors.seller],
              [
                "Outstanding evidence",
                "Written professional response required before proposing exchange",
              ],
              [
                "Agency action",
                "Keep the principal informed; do not invent a completion date",
              ],
            ],
          ),
          p(
            "The buyer's funding and the principal's decision remain distinct. A later resolution must be recorded as a new event, not inferred from silence or an unexecuted proposal.",
          ),
        ];
        break;
      }
      blocks = [
        h("Progression issue and decision log"),
        p(
          `Current dependency: ${c.index % 3 === 0 ? "confirmation that the related sale has reached a compatible funding stage" : c.index % 3 === 1 ? "resolution of the owner-document/title enquiry before an exchange date is proposed" : "a written response to the survey concern and lender valuation condition"}. No exchange or completion is confirmed by this review; any later outcome requires its own dated conveyancer confirmation.`,
        ),
        t(
          ["Action", "Owner / status"],
          [
            ["Confirm source of information", c.solicitors.seller],
            ["Obtain counterparty response", c.solicitors.buyer],
            ["Review known issue", c.home.defects[0]!.action],
            [
              "Escalation",
              "Agency operations lead records the next decision; no assumed professional undertaking",
            ],
          ],
        ),
        p(
          "Follow-up is confined to the identified issue. A draft promise, unconfirmed call or target date is not relabelled as completed conveyancing. Any change of price or conditions must preserve the earlier dated instruction.",
        ),
      ];
      break;
    case "S10":
      blocks = [
        h("Synthetic source index, not an official title"),
        p(
          `Tenure: ${c.home.tenure}. Reference DEMO-TITLE-INDEX-${c.index + 1} is an archive identifier, deliberately not a registered title number. Principal: ${c.client.name}. Owner-supplied summary and current agency instruction are indexed for the conveyancer, not treated as proof of ownership.`,
        ),
        t(
          ["Enquiry", "Recorded position"],
          [
            ["Ownership/signing authority", c.principal.authority],
            ["Access", c.home.access],
            ["Parking", c.home.parking],
            [
              "Lease details",
              c.home.lease
                ? `${c.home.lease.reference}; ${c.home.lease.years_remaining} years stated, verification outstanding`
                : "Freehold description; official register investigation not reproduced",
            ],
          ],
        ),
        p(
          "Ask the conveyancer to resolve any discrepancy against authoritative title material. Do not use this synthetic summary as a certified copy, lender report or warranty of boundaries, easements or charges.",
        ),
      ];
      break;
    case "S11":
      if (!c.home.lease)
        throw new Error("Leasehold summary for freehold home.");
      blocks = [
        h("Lease and management enquiry"),
        p(
          `Lease reference ${c.home.lease.reference}; stated remaining term ${c.home.lease.years_remaining} years. Stated annual service charge GBP${(c.home.lease.annual_service_pence / 100).toFixed(2)}. These are fictional owner-profile facts, not an official lease or managing-agent certificate.`,
        ),
        p(c.home.lease.planned_works),
        t(
          ["Issue", "Decision / follow-up"],
          [
            [
              "Works exposure",
              c.index % 3 === 0
                ? "Request scope and estimated timing before the buyer confirms their position"
                : "Record absence of a notified demand, without warranting that no future works will arise",
            ],
            [
              "Share of freehold",
              c.home.share_of_freehold
                ? "Additional interest; the leasehold term and obligations remain relevant"
                : "No additional freehold share represented",
            ],
            [
              "Approval",
              "Conveyancers to review consents, charges and transfer requirements",
            ],
          ],
        ),
        p(
          "Do not imply that the agency has answered a complete licensed management-enquiry form. Outstanding copies are named in the progression record, with any cost or timing uncertainty retained.",
        ),
      ];
      break;
    case "S12":
      blocks = [
        h("Specific observation and negotiation"),
        p(
          `The fictional survey enquiry concerns: ${c.home.defects[0]!.observation}. The agency records the concern but makes no engineering diagnosis. Requested action: ${c.home.defects[0]!.action}. Buyer ${c.counterparty.name} and seller ${c.client.name} were asked to confirm their negotiating positions through their conveyancers.`,
        ),
        t(
          ["Commercial position", "Amount / outcome"],
          [
            ["Original asking/offer basis", c.money.asking],
            ["Negotiated reduction", c.money.reduction],
            ["Agreed commercial figure", c.money.agreed],
            [
              "Outcome",
              c.index % 3 === 2
                ? "Condition-led reduction recorded, subject to contract and lender response"
                : c.index % 3 === 1
                  ? "Price retained; buyer to obtain independent advice before proceeding"
                  : "No price change; chain/funding dependency remains the controlling issue",
            ],
          ],
        ),
        p(
          "The agreed commercial figure is not exchange. Later memoranda and the eventual fee invoice, if a transaction completes, must use the appropriate dated price and operative agency-fee clause.",
        ),
      ];
      break;
    case "S13":
      blocks = [
        h("Resolved condition preceding exchange"),
        p(
          c.index % 3 === 0
            ? "The previously recorded related-sale funding dependency was resolved through the fictional conveyancers before exchange. Completion is a later separately confirmed event; a chain target was not used as key-release authority."
            : c.index % 3 === 1
              ? "The outstanding owner-document enquiry was closed before exchange. This confirmation does not claim that the agency certified title or supplied a conveyancer's undertaking."
              : "The survey-led negotiation and lender-response condition were resolved before exchange. The consideration below follows the recorded revised commercial figure, not the earlier unadjusted asking price.",
        ),
        h("Conveyancer-reported events"),
        t(
          ["Event", "Confirmed fictional record"],
          [
            [
              "Exchange",
              c.matter.events.find((e) => e.kind === "exchange")!.date,
            ],
            ["Completion", c.event.date],
            ["Consideration", c.money.agreed],
            ["Seller contact", c.solicitors.seller],
            ["Buyer contact", c.solicitors.buyer],
          ],
        ),
        p(
          "The agency recorded separate exchange and completion confirmations from the fictional conveyancer contacts. This is an agency-held operational confirmation, not a transfer, undertaking or official register entry. No agency staff member is represented as having exchanged contracts for a party.",
        ),
        p(
          "Release keys only against the identified completion authority. Reconcile the fee invoice separately; do not turn the conveyancing consideration into an agency receipt or include bank details.",
        ),
      ];
      break;
    case "S14":
      blocks = [
        h("Completion-only authority and custody"),
        p(
          `Following the completion confirmation dated ${c.event.date}, release key set ${c.home.key}/keys-a to ${c.counterparty.name} or their specifically authorised representative. Record ${1 + (c.index % 2)} keys; do not create an additional set without a custody event.`,
        ),
        t(
          ["Check", "Recorded outcome"],
          [
            ["Authority", `Fictional seller contact ${c.solicitors.seller}`],
            ["Recipient", c.counterparty.name],
            ["Access limitation", c.home.access],
            [
              "Unresolved item",
              c.index % 3 === 0
                ? "Meter/account transfer for parties to confirm"
                : c.index % 3 === 1
                  ? "No additional key set is represented"
                  : "Retain known condition note with the handover",
            ],
          ],
        ),
        p(
          "This handover does not certify the condition of concealed systems or establish an unrecorded right to vacant possession. Any remaining occupier issue must be referred to the conveyancers, not concealed by a key receipt.",
        ),
      ];
      break;
    case "S15":
      blocks = [
        h("Instruction-specific entitlement"),
        p(
          c.index % 3 === 0
            ? "The appointment was sole agency, not sole selling rights. This completed transaction follows the documented agency introduction; no fee is claimed merely because the owner could have found an independent purchaser."
            : c.index % 3 === 1
              ? "The appointment was non-exclusive. This fee concerns the documented introduction and completed matter only; it makes no determination of a competing agent's entitlement and creates no second fee automatically."
              : "The appointment was limited marketing and progression. Only the agreed completed-sale percentage is invoiced; no additional survey-negotiation or expanded-service charge has been introduced.",
        ),
        h("Completion fee calculation"),
        t(
          ["Line", "Basis / amount"],
          [
            ["Completed consideration", c.money.agreed],
            [
              "Operative agency fee",
              `${c.sale_finances.agency_fee_bps / 100}% excluding VAT`,
            ],
            ["Net fee", c.money.fee_net],
            ["Illustrative VAT 20%", c.money.fee_vat],
            ["Total", c.money.fee_total],
          ],
        ),
        p(
          `Invoice reference DEMO-FEE-${c.index + 1}. The fee follows the operative agency-fee clause at completion, including only simulated signed, resolved amendments effective by this date. Earlier proposals and unknown historical originals are not applied. The seller is ${c.client.name}; the buyer is not the agency's instructing client.`,
        ),
        p(
          "Synthetic financial record only: no payment instruction, bank account, genuine VAT number, request to remit funds or assertion of actual tax liability. The closing record acknowledges issue of the invoice, not a payment unless a separate receipt event supports it.",
        ),
      ];
      break;
    case "S16":
      blocks = [
        h("Withdrawal / failed progression"),
        p(
          `${c.index % 3 === 0 ? "The owner withdraws while the prospective buyer's chain remains unresolved" : c.index % 3 === 1 ? "The principal suspends the sale for a change in personal plans before exchange" : "The proposed buyer does not proceed after the condition enquiry and funding review"}. No exchange or completion is represented. Retain the offer history without converting it into a binding sale.`,
        ),
        t(
          ["Action", "Owner / disposition"],
          [
            [
              "Marketing",
              "Agency stops active advertising and cancels unconfirmed viewings",
            ],
            ["Keys", `Reconcile ${c.home.key}/keys-a with the principal`],
            [
              "Conveyancers",
              "Notify the fictional contacts that progression has stopped",
            ],
            [
              "Fees",
              "No automatic withdrawal or completion fee is raised; any separately approved service would need its own evidenced basis",
            ],
          ],
        ),
        p(
          "Closing the instruction does not erase the source records or imply that another proposed transaction has completed. A later instruction must have its own deal reference and date history.",
        ),
      ];
      break;
    default:
      throw new Error("Unhandled sales family.");
  }
  return documentFor(
    c,
    title,
    blocks,
    c.slot.family === "S01"
      ? ["EXT-1", "EXT-12"]
      : c.slot.family === "S05"
        ? ["EXT-1", "EXT-10"]
        : ["EXT-1", "EXT-14"],
  );
}
