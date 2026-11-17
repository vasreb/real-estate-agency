import { corpus, type ContentBlock } from "../../model.js";
import { assertRentIncrease } from "../../scenarios/money.js";
import {
  documentFor,
  execution,
  gbp,
  heading as h,
  para as p,
  table as t,
  type ContentContext,
} from "../context.js";
import { amendmentBlocks } from "../sales/index.js";

const titles: Record<string, string> = {
  R01: "Landlord property-management agreement",
  R02: "Management instruction amendment",
  R03: "Approved letting particulars",
  R04: "Holding-deposit terms",
  R05: "Holding-deposit receipt and allocation",
  R06: "Synthetic referencing outcome",
  R07: "Residential tenancy agreement",
  R08: "Separate guarantor agreement",
  R09: "Tenancy-deposit receipt",
  R10: "Deposit protection and information demonstration record",
  R14: "Tenancy variation instrument",
  R19: "Rent account statement",
  R20: "Rent-increase process demonstration",
  R21: "Agreed tenancy-ending record",
};
const dueDate = (c: ContentContext) =>
  c.matter.possession?.start ?? "Not agreed; pre-let draft only";

function commonAgreementSections(c: ContentContext): ContentBlock[] {
  return [
    h("Property schedule and shared facts"),
    t(
      ["Schedule item", "Recorded baseline"],
      [
        ["Home", c.property.address],
        [
          "Accommodation",
          `${c.home.category}; ${c.home.bedrooms} separate bedrooms, ${c.home.bathrooms} bathrooms; approximately ${c.home.area_m2}m2`,
        ],
        ["Furnishing", c.home.furnishing],
        ["Heating", c.home.heating],
        ["Outdoor space", c.home.outdoor_space],
        ["Access", c.home.access],
        ["Parking", c.baseClauses.parking!],
      ],
    ),
    p(
      `The room and item inventory is identified by property key ${c.home.key}. An indicative area or room dimension is not a survey or promise that furniture will fit. The owner-supplied baseline records: ${c.home.defects[0]!.observation}. Follow-up: ${c.home.defects[0]!.action}. These observations are not professional safety certificates. Each equipment report must identify its inspection date, source and any limitation; an old copy is not described as newly issued merely because it is received with this instruction.`,
    ),
    h("Repairs, safety and access boundaries"),
    p(
      "The landlord retains the statutory responsibilities that cannot be transferred to the tenant or discharged merely by appointing an agent. A tenant should report a fault promptly with sufficient information to arrange appropriate attention; an unreported fault is not automatically evidence of tenant liability. Emergency hazards require appropriate urgent assistance. Non-emergency inspection or repair access must be arranged with the occupier and applicable notice/consent requirements respected. A key held in agency custody is not a general licence to enter without agreement.",
    ),
    p(
      "A repair record must distinguish the reported symptom, the contractor's findings, the authorised scope and the work actually performed. Consent to a cost limit is not a diagnosis or confirmation of completion. The agent should obtain further landlord authority if a non-emergency scope changes materially, preserve invoices and tell the occupier what follow-up remains. Neither a pet permission nor an inventory amendment relieves the landlord of a safety obligation. Valid reports may be carried forward where appropriate, with their original source dates retained.",
    ),
    h("Records, communication and fair treatment"),
    p(
      "Each party should retain a durable copy of the agreement, its schedules and any later resolved variation. The parties' names, capacities and example-only contacts must be checked against the instruction record. A household comprises its individual signatories; a corporate principal acts through its identified authorised representative. Routine correspondence may be copied to a nominated contact only within the recorded scope; that change does not substitute a new landlord, tenant or guarantor. A party substitution requires its own legally appropriate consent/novation treatment and is not implied by an administrative addendum.",
    ),
    p(
      "The agent records a complaint or disputed item specifically, including the evidence sought, the response and the next action. Silence is not agreement to a deduction, fee or new contractual obligation. An unresolved proposal must remain labelled as proposed. Data in this archive are entirely fictional; no copied identity documents, real resident details, valid bank instructions or genuine scheme credentials accompany this agreement. The parties should obtain independent advice on a real transaction; the synthetic drafting is not a guarantee of legal completeness or enforceability.",
    ),
    h("Document control and execution"),
    p(
      "Read the numbered terms and the property schedule together. Where an item is unknown, it remains identified as unknown rather than filled by an invented official record. Later amendments must identify the base agreement, original parties and clause, explain the reason, show the old and replacement term and state an effective date. Only simulated signed, resolved changes are reflected in later operative snapshots; a draft or unknown historical original is retained for evidence without silently changing the terms. No generic addendum is used as a substitute for a statutory rent-increase process.",
    ),
    p(
      "The execution panel records the capacity of each fictional signatory. The words Simulated signature are demonstration markers, not handwriting, an official seal, an electronic-signature certificate or evidence of verified identity. No party is asked to execute this document or send money. If a real-world process requires an exact official document or other prescribed material, this original synthetic agreement and its delivery record do not purport to replace it. The archive is an operational illustration and not a complete statutory service pack.",
    ),
  ];
}

function management(c: ContentContext): ContentBlock[] {
  return [
    h("1. Landlord, agency and appointment"),
    p(
      `${c.client.name} appoints ${corpus.agency} in relation to the property identified in the schedule. The agency acts for the instructing landlord, not as a party granting the tenancy in its own right. The principal's authority is recorded as follows: ${c.principal.authority.replace(/\.$/, "")}. The landlord must approve the initial rent, any referencing conditions, the tenancy terms and the proposed occupiers. The agent has no authority to change the principal, warrant a tenant's future performance or sign a new tenancy without the recorded authority required by the instruction.`,
    ),
    h("2. Selected service and exclusions"),
    p(
      `Base service: ${c.baseClauses["service-level"]}. Where the service is let-only, ongoing rent collection, inspections and routine maintenance remain outside the instruction unless specifically added. Where rent collection is selected, the owner remains responsible for appointing contractors and arranging safety work. Full management adds the inspection and repair coordination expressly described in the agreed scope, but does not transfer non-delegable legal duties or authorise speculative expenditure. The agent will explain the limitations of the selected service rather than present every instruction as full management.`,
    ),
    p(
      `Initial asking rent is ${c.money.rent} per calendar month. The agency will publish the asking price, material property facts and the stated bill/furnishing arrangements and seek the principal's approval before accepting an application. The principal must disclose known defects, restrictions on letting, lease terms affecting use and any required consents. For this ${c.home.tenure} home, ${c.home.lease ? `the synthetic lease has ${c.home.lease.years_remaining} years remaining and records ${c.home.lease.planned_works.toLowerCase()}` : "the description does not establish the absence of a covenant, lender condition or local licensing duty"}. No actual licence, lender approval or management-company consent is invented.`,
    ),
    h("3. Fees and accounts"),
    p(
      `The illustrative landlord agency charge is ${c.baseClauses["service-level"]!.startsWith("Let-only") ? "one half of one month's initial rent plus illustrative VAT for the let-only instruction, payable only on a supported completed letting" : c.baseClauses["service-level"]!.startsWith("Rent collection") ? "six per cent of rent actually collected plus illustrative VAT for the selected collection-only service" : "eight per cent of rent actually collected plus illustrative VAT for the selected full-management service"}. A later service-level change retains this landlord fee basis unless it expressly varies the fee as well; a change of service description alone does not create a tenant charge. No advertising, referencing, inventory or administration fee is imposed on the tenant by this landlord-agent appointment.`,
    ),
    p(
      "Collection accounts distinguish rent received, a holding deposit, a tenancy deposit, an authorised landlord charge and a contractor cost. The agent will issue a statement showing the period, gross receipts, evidenced deductions and landlord balance. A statement is not a bank instruction. The synthetic demonstration includes no bank account, payment link, real tax number or instruction to remit funds. An unpaid rent entry is identified as an arrear rather than treated as collected income; a correction must preserve the original ledger trail.",
    ),
    h("4. Contractor authority and reviews"),
    p(
      `The initial non-emergency repair-authorisation ceiling is ${gbp(Number(c.baseClauses["repair-authority"]))} per distinct job. Obtain a separate recorded approval for a higher non-emergency cost; do not split one repair into smaller invoices to evade the ceiling. The authority does not override safety obligations or prevent appropriate emergency action. The agent will record the reason, authoriser, scope, quoted cost and subsequent outcome. Where the owner retains contractor appointment under a limited service, an agency inspection note is not treated as authority to order the work.`,
    ),
    p(
      "The owner and agency should review the instruction after a material property, occupancy or service change. The landlord must supply accessible current compliance material where required, and the agent must identify missing or expired copies instead of describing them as satisfactory. Gas records apply only where the home has relevant gas installations; electrical-only homes must not receive invented gas checks. The agent will coordinate agreed alarm checks at a supported move-in and retain the result, not create a generic check for a letting that never commenced.",
    ),
    h("5. Ending the appointment"),
    p(
      "Either party may request termination on one month's written notice, subject to any separately recorded live obligations and applicable consumer rights. This appointment creates no automatic withdrawal penalty or fee on an uncompleted proposed letting. On ending, reconcile keys, tenant contacts, client accounting and outstanding repairs and state which party is taking over each item. Termination of management does not itself end a tenancy or authorise possession. Any continuing tenant relationship must be handled under the applicable law and actual tenancy arrangements, not by relabelling the agency closing note.",
    ),
    ...commonAgreementSections(c),
    execution(c, true),
  ];
}
function tenancy(c: ContentContext): ContentBlock[] {
  const current = c.event.date >= "2026-05-01";
  return [
    h("1. Parties and property"),
    p(
      `${c.client.name}, acting through every named principal signatory, is the fictional landlord. ${c.counterparty.name} is the proposed or actual tenant according to the execution state shown below. The agency administers the recorded instruction but is not substituted as landlord. The premises are ${c.property.address}, together with only the facilities and contents included in the schedules. No right to a different flat, an unlisted parking space, an exclusive shared area or an unrecorded storage room is granted by implication.`,
    ),
    h("2. Regime, commencement and occupation"),
    p(
      current
        ? `This is an assured periodic tenancy demonstration. The proposed or recorded possession start is ${dueDate(c)}. The tenancy runs periodically without a fixed contractual end date. Required written information must be supplied before the parties agree the new tenancy; the corresponding synthetic supply record identifies the event and recipients. That record does not claim to reproduce the complete statutory pack. No ordinary section 21 process is created or represented by this agreement.`
        : `This is a historical assured shorthold tenancy demonstration under the rules applicable at the agreement date. Recorded possession starts ${dueDate(c)}; the original intended term is twelve months, subject to applicable statutory rights and any supported agreed surrender. Changes in applicable law take effect according to that law; this dated agreement does not purport to predict a later statutory reform or waive future mandatory rights. Any agreed ending must identify the parties' consent and the actual possession arrangements.`,
    ),
    p(
      "The tenant may use the premises as a private home, subject to the agreed lawful occupancy arrangements. No commercial use, subletting or party substitution is authorised without the appropriate specific treatment. The landlord does not promise vacant possession for a later sale merely by granting this tenancy. The property and counterparties must remain linked to this particular matter; a later relet has a different tenant and a non-overlapping possession history, not a duplicate version of this contract.",
    ),
    h("3. Rent, holding funds and tenancy deposit"),
    p(
      `Base rent is ${c.money.rent} per calendar month, payable monthly for the stated rental period. The advertised rent is the same amount; the agreement does not record bidding above it. A holding deposit, if taken, is ${c.money.holding}, no more than one week's rent. With the applicant's recorded consent it is credited against the first month's rent, leaving ${gbp(c.rental_finances.monthly_rent_pence - c.rental_finances.holding_pence)} of that first instalment. It is not deducted again from the separate tenancy deposit of ${c.money.deposit}. Every receipt identifies which fund it concerns.`,
    ),
    p(
      current
        ? "No rent is required or accepted before the parties sign or otherwise agree the tenancy. After agreement and before the start, the archive permits no more than one month's rent in advance. An applicant's offer to pay earlier or for several months does not authorise a prohibited demand or acceptance. Any later increase uses the applicable statutory section 13/Form 4A process with the required notice and annual interval, not an automatic contractual review or a generic addendum."
        : "The historical rent schedule is monthly; this scenario does not require routine multi-month advances. A later current rent review must be considered under the law applicable to that later event, not treated as an automatic effect of a historical clause. The landlord and agent retain distinct holding, rent and tenancy-deposit ledger entries so that a receipt cannot be counted twice.",
    ),
    p(
      "The tenancy-deposit amount is calculated in integer GBP pence using the relevant five- or six-week cap and rounded down. The landlord must ensure applicable protection and prescribed-information requirements are met within thirty days of receipt. The synthetic protection demonstration uses conspicuous DEMO identifiers and dates; it is not an actual scheme certificate or confirmation of valid service. The deposit is security subject to the proper end-of-tenancy process, not the landlord's unrestricted income and not a sale exchange deposit.",
    ),
    h("4. Contents, utilities and permitted use"),
    p(
      `Initial furnishing description: ${c.home.furnishing}. The room/item schedule controls the included contents, quantity, age and condition; an item absent from that schedule is not invented at check-out. Broadband baseline: ${c.baseClauses.bills}. Ordinary utility and local-authority liabilities follow the expressly recorded arrangements; the landlord does not profit from utility resale. An agreed broadband inclusion may reduce the tenant's responsibility without creating an additional fee or rent increase. Parking baseline: ${c.baseClauses.parking}. An allocated bay may be used only where the agreement or a resolved permission actually includes it.`,
    ),
    p(
      "A tenant's pet request should be considered individually under the applicable requirements; absence of a named permission is not represented as an unlimited statutory right to refuse. Any recorded permission identifies the particular animal and reasonable arrangements without a prohibited pet fee or extra tenancy deposit. The tenant should take reasonable care of the home, report damage or defects promptly and avoid causing nuisance, but is not made liable for ordinary fair wear or for a landlord's non-delegable repair duty. Responsibility for a specific loss must be evidenced rather than presumed from occupation alone.",
    ),
    h("5. Inventory, ending and deposit outcome"),
    p(
      "The check-in schedule records the agreed baseline, including pre-existing marks, item age and meter/alarm observations. The tenant may raise a discrepancy identifying the same room/item key and provide a specific correction. At check-out, compare like with like and allow for the length of occupation, normal use and remaining useful life. There is no automatic professional-cleaning charge, blanket penalty or new-for-old carpet replacement. A claimed cost must be supported, proportionate and discussed with the tenant; silence is not agreement.",
    ),
    p(
      "Ending the tenancy requires the applicable lawful route or a properly recorded agreement; ending agency management alone is insufficient. An agreed surrender record should identify the parties, date, key handover and rent treatment. The eventual deposit account distinguishes an agreed deduction, disputed proposal and actual refund. Any refund shown in the archive is a fictional ledger event without an instruction to transfer money. No complex possession litigation or exceptional transitional notice is manufactured to make the case file look complete.",
    ),
    ...commonAgreementSections(c),
    execution(c, false),
  ];
}

export function authorLettings(c: ContentContext) {
  if (c.deal.type !== "rental" || !titles[c.slot.family])
    throw new Error("Invalid rental family or matter.");
  let blocks: ContentBlock[];
  switch (c.slot.family) {
    case "R01":
      blocks = management(c);
      break;
    case "R07":
      blocks = tenancy(c);
      break;
    case "R02":
    case "R14":
      blocks = amendmentBlocks(c);
      if (c.amendment?.consent)
        blocks.push(
          h("Named guarantor treatment"),
          p(
            `Specific variation consent is ${c.amendment.consent.guarantor_consented ? "recorded with the simulated signed instrument" : "proposed only; no guarantor obligation is silently enlarged"}. Relevant actor keys: ${c.amendment.consent.actor_keys.join("; ")}. The original guarantee and the named change are read together; no general substitution of parties is implied.`,
          ),
        );
      break;
    case "R03":
      blocks = [
        h("Asking rent and accommodation"),
        p(
          `${c.money.rent} per calendar month; ${c.home.category}, approximately ${c.home.area_m2}m2, ${c.home.bedrooms} separate bedrooms and ${c.home.bathrooms} bathrooms. Furnishing: ${c.home.furnishing}. Prospective applicants are not invited to bid above the advertised rent.`,
        ),
        t(
          ["Material fact", "Recorded position"],
          [
            ["Heating", c.home.heating],
            ["Access", c.home.access],
            ["Outdoor space", c.home.outdoor_space],
            ["Parking", c.clauses.parking!],
            ["Known observation", c.home.defects[0]!.observation],
            [
              "Bills",
              "Broadband initially arranged by tenant; any resolved later inclusion must be read in its dated schedule",
            ],
          ],
        ),
        p(
          `Holding cap ${c.money.holding}; tenancy deposit ${c.money.deposit}. No referencing, viewing or routine administration charge is imposed on an applicant. A marketing record does not prove that a tenancy commenced or that an applicant passed the fictional checks.`,
        ),
      ];
      break;
    case "R04":
      blocks = [
        h("Application issue to resolve"),
        p(
          c.index % 3 === 0
            ? "Before the reservation decision the landlord needs the separate named-guarantor position clarified where applicable; a holding deposit is not a guarantee that a tenancy or guarantee will be executed."
            : c.index % 3 === 1
              ? "The applicant's illustrative savings/income combination needs landlord review; the holding deposit does not purchase a favourable reference result or waive a refund right."
              : "The applicant's illustrative self-employed income narrative needs clarification before the landlord decides; the reservation does not authorise a tenant referencing fee.",
        ),
        h("Reservation terms and decision deadline"),
        p(
          `Applicant ${c.counterparty.name}; property ${c.property.address}. Holding deposit ${c.money.holding}, calculated as floor(monthly rent ${c.money.rent} x 12 / 52) in pence. Only one holding deposit may be accepted for this proposed tenancy at a time. The normal decision period is fifteen calendar days from receipt unless a different period is agreed in writing.`,
        ),
        p(
          "The holding deposit is refundable subject to the applicable limited statutory retention grounds; a reference spelling correction alone is not a reason to retain it. If the landlord decides not to proceed, return the funds within the applicable seven-day period. Any decision to retain requires a specific lawful basis and timely written reasons, not a general agency cancellation fee.",
        ),
        p(
          `On a completed agreement, the applicant's recorded choice in this scenario is to credit the holding deposit against the first month's rent. If the application does not proceed, the receipt/refund record must identify the actual outcome. It is separate from the tenancy deposit of ${c.money.deposit} and cannot be counted as both rent and security.`,
        ),
      ];
      break;
    case "R05":
      blocks = [
        h("Reservation decision and applicant consent"),
        p(
          c.index % 3 === 0
            ? "The landlord proceeds after reviewing the recorded guarantor condition, with a separate guarantee required only when a guarantor is actually named. The applicant consents to a rent credit rather than a second security deposit."
            : c.index % 3 === 1
              ? "The landlord proceeds after the savings/income clarification. The applicant authorises the first-rent credit; no premium is retained for the referencing decision."
              : "The landlord proceeds after reviewing the self-employed income clarification. The applicant authorises a first-rent credit without a referencing or administration deduction.",
        ),
        h("Receipt and authorised allocation"),
        t(
          ["Ledger line", "GBP amount"],
          [
            ["Holding funds received", c.money.holding],
            [
              "Credited to first month's rent with applicant consent",
              c.money.holding,
            ],
            ["Cash refund in this completed-agreement scenario", "GBP0.00"],
            ["First monthly rent", c.money.rent],
            [
              "First instalment still due after credit",
              gbp(
                c.rental_finances.monthly_rent_pence -
                  c.rental_finances.holding_pence,
              ),
            ],
          ],
        ),
        p(
          `Applicant ${c.counterparty.name} authorised the credit when the tenancy was agreed on ${c.event.date}. No credit is also taken from the tenancy deposit. Receipt reference DEMO-HOLD-${c.index + 1} is fictional and not a financial-account identifier.`,
        ),
        p(
          "This allocation record is not a demand for rent before agreement or for multiple months in advance. A different outcome would require its own dated refund/retention event and reasons; it is not inferred from the document title.",
        ),
      ];
      break;
    case "R06":
      blocks = [
        h("Fictional checks and decision"),
        p(
          `Applicant: ${c.counterparty.name}. This original summary records a synthetic suitability exercise, not a credit-agency report, actual identity check or Right to Rent verification. No copied ID, income statement, valid credential or real person is represented.`,
        ),
        t(
          ["Issue", "Outcome and limitation"],
          [
            [
              "Affordability narrative",
              c.index % 3 === 0
                ? "Illustrative employed-income profile reviewed; guarantor condition separately recorded if named"
                : c.index % 3 === 1
                  ? "Illustrative savings/income combination considered; no guarantee of future payments"
                  : "Illustrative self-employed profile considered with a request for clarification, then landlord review",
            ],
            [
              "Guarantor",
              c.profiles.actors.some(
                (a) => a.key === `${c.counterparty.key}/guarantor`,
              )
                ? "Named guarantor requires a separate agreement; no automatic unlimited guarantee"
                : "No guarantor condition in this scenario",
            ],
            [
              "Landlord decision",
              c.matter.cohort === "pre-let"
                ? "Application/draft stage; no completed move-in asserted"
                : "Proceed subject to the dated agreement and required information",
            ],
          ],
        ),
        p(
          "A reference outcome neither authorises a prohibited tenant fee nor substitutes for required statutory checks. Any real transaction needs the appropriate independently verified records; these are deliberately not manufactured here.",
        ),
      ];
      break;
    case "R08":
      blocks = [
        h("Separate guarantee: parties and identified tenancy"),
        p(
          `The named guarantor in the execution panel gives only the obligations expressly related to the tenancy between ${c.client.name} and ${c.counterparty.name} for ${c.property.address}, at base monthly rent ${c.money.rent}. This original synthetic agreement is separate from the landlord-agent management contract. It does not make the agency the landlord or conceal a substitution of the tenant.`,
        ),
        h("Scope, demand and limits"),
        p(
          "The demonstration guarantee concerns unpaid agreed rent and evidenced tenant loss under the identified tenancy, subject to applicable law and the terms actually agreed. It does not impose a prohibited fee, guarantee a landlord's safety obligations or create liability for ordinary wear. Before any demand the landlord must identify the obligation, relevant period, payments already received and evidence of the loss; no double recovery is authorised.",
        ),
        h("Variations and reform review"),
        p(
          "A later variation is not automatically covered merely because a historic guarantee exists. Any applicable change must be reviewed and the guarantor's specific consent recorded where required, including the change's scope and date. The archive does not assume an unlimited advance consent to party substitutions, rent increases or fundamentally different obligations. A draft or unknown variation cannot silently enlarge the guarantee.",
        ),
        p(
          "The guarantee is retained as a dated original, with any later mandatory-law review and named consent documented separately when applicable. This is not legal advice that the guarantee would be enforceable in an actual case. Guarantor release, novation or termination would require explicit appropriate treatment, not an administrative change of address.",
        ),
        ...commonAgreementSections(c),
        execution(c, false),
      ];
      break;
    case "R09":
      blocks = [
        h("Security scope, not an advance charge"),
        p(
          c.home.furnishing === "furnished"
            ? "The security covers only evidenced obligations under the tenancy, including listed supplied contents. A furnished home does not authorise an additional furniture deposit or a new-for-old replacement charge."
            : c.home.furnishing === "part-furnished"
              ? "The security is linked to the part-furnished schedule. Only the named supplied items may support a later contents comparison; absent furniture cannot be charged as missing."
              : "The security is linked to the unfurnished schedule and existing fixed fittings. No landlord sofa, bed or other unlisted loose furniture is treated as part of the deposit baseline.",
        ),
        h("Separate tenancy-security receipt"),
        t(
          ["Receipt field", "Value"],
          [
            ["Deposit", c.money.deposit],
            ["Monthly rent used for cap", c.money.rent],
            [
              "Annual band",
              c.home.monthly_rent_pence * 12 < 5_000_000
                ? "Below GBP50,000: five weeks"
                : "GBP50,000 or more and below GBP100,000: six weeks",
            ],
            ["Receipt date", c.event.date],
            ["Reference", `DEMO-DEPOSIT-${c.index + 1}`],
          ],
        ),
        p(
          "The amount is floored in integer pence rather than rounded up beyond the cap. Holding funds have already been allocated only to first-month rent in their separate record. They are not deducted again from this security deposit.",
        ),
        p(
          "Protection and prescribed information are due within thirty days where applicable. The companion demonstration record identifies the synthetic dates; no valid scheme credentials, bank account or real certificate is supplied.",
        ),
      ];
      break;
    case "R10":
      blocks = [
        h("Relevant parties and information review"),
        p(
          c.principal.signatory_keys.length > 1
            ? "All household landlord signatories are identified individually; the household display label is not treated as one person's execution. The tenant and any relevant deposit payer must receive the applicable information; no outside payer is invented in this case."
            : c.principal.authority.toLowerCase().includes("corporate") ||
                c.client.name.includes("Ltd")
              ? "The corporate landlord acts through its named authorised representative. Record the landlord's identity separately from the representative and the agent; neither becomes the tenant or a new deposit payer by implication."
              : "The individual landlord remains distinct from the agency administrator. Receipt of a copy by the agent alone is not represented as tenant delivery, and no third-party deposit payer is assumed.",
        ),
        h("Synthetic protection / information chronology"),
        p(
          `Demonstration identifier DEMO-PROTECT-${c.index + 1}; deposit ${c.money.deposit}; receipt dated ${c.matter.events.find((e) => e.kind === "agreement")?.date ?? "agreement date in the base record"}. Protection and prescribed-information demonstration events are recorded on ${c.event.date}, within the thirty-day receipt window. The scheme name and identifiers are fictional, not valid registration details.`,
        ),
        t(
          ["Record", "Boundary"],
          [
            [
              "Protection",
              "Simulated demonstration event only; not a genuine scheme certificate",
            ],
            [
              "Recipients",
              `${c.counterparty.name} and each named relevant party in the tenancy record`,
            ],
            [
              "Information",
              "Original synthetic outline and delivery history; required official originals are not claimed to be reproduced",
            ],
            [
              "Retention",
              "Preserve receipt, delivery and later deposit-outcome records separately",
            ],
          ],
        ),
        p(
          "This archive is not a legally complete statutory service pack. The document demonstrates chronology and evidence structure without claiming official service, authentication or compliance for any actual landlord.",
        ),
      ];
      break;
    case "R19": {
      const final = c.slot.purpose.includes("final rent");
      blocks = [
        h(
          final
            ? "Final rent account through 31 December 2025"
            : "Monthly rent ledger",
        ),
        t(
          ["Account line", "Amount / status"],
          [
            ["Monthly contractual rent", c.money.rent],
            [
              "Represented period",
              final
                ? "1 March to 31 December 2025: ten monthly instalments"
                : `${c.event.date.slice(0, 7)} monthly instalment; earlier receipts carried separately`,
            ],
            [
              "Rent due for represented period",
              final ? gbp(c.home.monthly_rent_pence * 10) : c.money.rent,
            ],
            [
              "Received",
              final
                ? gbp(c.home.monthly_rent_pence * 10)
                : c.index % 3 === 0
                  ? gbp(c.home.monthly_rent_pence - 10_000)
                  : c.money.rent,
            ],
            [
              "Outstanding",
              final
                ? "GBP0.00"
                : c.index % 3 === 0
                  ? "GBP100.00; polite reminder, no automatic penalty"
                  : "GBP0.00",
            ],
            [
              "Holding credit",
              "Applied once to first-month rent, not again in this period",
            ],
          ],
        ),
        p(
          final
            ? `The first month's holding credit of ${c.money.holding} and the balancing rent payment are counted once. Nine subsequent monthly instalments complete the ten-month account. ${c.index % 3 === 0 ? "The GBP100 August shortfall was received on 8 August 2025, as recorded in the causal ledger, and is not taken again from the deposit." : "The represented rent periods are fully reconciled without a late-payment charge."} The separate deposit comparison/refund is not rent income.`
            : c.index % 3 === 0
              ? "The tenant has explained a short payment and the agency requests confirmation of a reasonable catch-up proposal. This correspondence does not assert possession grounds, impose a fixed arrears-chasing charge or treat an unreceived sum as landlord income."
              : c.index % 3 === 1
                ? "The represented period is paid without an arrears charge. Landlord agency fees and authorised costs must be shown separately on any remittance account."
                : "The tenant corrected the payment reference; the receipt is matched to this matter rather than a different property. No duplicate credit or penalty is raised.",
        ),
        p(
          `Operative service description at this date: ${c.clauses["service-level"]}. A signed resolved management change affects the instruction scope only; it does not automatically alter the tenant's rent or impose a variation fee.`,
        ),
      ];
      break;
    }
    case "R20": {
      const effective = "2026-11-01";
      assertRentIncrease({
        served: c.event.date,
        effective,
        previous_increase: c.matter.possession!.start,
        process: "section13-form4a",
      });
      blocks = [
        h("Reason for the proposed review"),
        p(
          c.index % 3 === 0
            ? "The owner requests review of the longstanding rent following the earlier collection shortfall. Arrears do not themselves justify a penalty or above-market increase; the notice proposal and the outstanding-rent account remain separate."
            : c.index % 3 === 1
              ? "The owner requests a review of the continuing rent without a change of tenant or management service. The file must not treat a management fee or landlord cost as an automatic rent escalator."
              : "The owner proposes a modest review while the tenancy continues on its current furnishing and utility terms. No new service or generic addendum is used to bypass the statutory notice and challenge process.",
        ),
        h("Section 13 / Form 4A process demonstration"),
        p(
          `This is an original synthetic process summary, not the official Form 4A and not a served statutory notice. Proposed monthly rent ${gbp(c.home.monthly_rent_pence + (25 + (c.index % 3) * 25) * 100)} replaces ${c.money.rent} from ${effective}. Demonstration notice date ${c.event.date} gives at least two calendar months; the tenancy start/last baseline ${c.matter.possession!.start} is at least twelve months before the proposed increase.`,
        ),
        p(
          "A current increase is not implemented by a generic tenancy addendum or by an agency fee change. The tenant's applicable opportunity to challenge a proposed above-market increase must be respected. The illustrative amount is not an asserted market valuation and a real notice would require the exact current prescribed form and all applicable service requirements.",
        ),
        p(
          "The archive retains the old rent in earlier statements and records the proposed/effective dates separately. It does not claim to contain the exact official form or a legally complete proof-of-service pack.",
        ),
      ];
      break;
    }
    case "R21":
      if (c.matter.cohort !== "ended-rental")
        throw new Error("Unsupported ending record.");
      blocks = [
        h("Agreed surrender and possession plan"),
        p(
          c.index % 3 === 0
            ? "Reason and consent: the tenant requests an ending to relocate for work. The landlord agrees to the recorded date rather than demanding rent for the unexpired intended term; the separate rent ledger reconciles the shortfall before closing."
            : c.index % 3 === 1
              ? "Reason and consent: the tenant requests an ending after arranging a home purchase. Both parties agree the possession date, with the ordinary rent account reconciled and no automatic early-exit or cleaning charge."
              : "Reason and consent: a change in the tenant's household circumstances leads to a request for an agreed ending. The landlord consents to the recorded date; disputed condition items remain separate and do not create a right to retain the keys or extend rent silently.",
        ),
        p(
          `${c.client.name} and ${c.counterparty.name} record an agreed surrender/ending date of ${c.matter.possession!.end}. Their agreement is recorded on ${c.event.date}, before the actual check-out. This is not a section 21 notice or a court possession order. Both sides' consent is specific to this tenancy; ending the agency appointment alone would not end occupation.`,
        ),
        t(
          ["Item", "Agreed treatment"],
          [
            [
              "Rent",
              "Reconcile amounts to the ending date without duplicate holding credit",
            ],
            ["Keys", `Return and count set ${c.home.key}/keys-a at check-out`],
            [
              "Condition",
              "Compare against the same dated room/item baseline, allowing fair wear",
            ],
            [
              "Deposit",
              "Proposals and disputed items remain separate from an agreed refund",
            ],
          ],
        ),
        p(
          "A later relet can begin only after this matter's non-overlapping possession period ends. This agreement does not authorise entry by a new occupier before surrender or promise vacant possession under a separate proposed sale.",
        ),
        execution(c, false),
      ];
      break;
    default:
      throw new Error("Unhandled rental family.");
  }
  return documentFor(c, titles[c.slot.family]!, blocks, [
    "EXT-2",
    "EXT-3",
    "EXT-5",
    "EXT-6",
  ]);
}
