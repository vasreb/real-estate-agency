import { corpus, type AuthoredDocument, type ContentBlock } from "../model.js";
import type { Profiles } from "../profiles/agency.js";
import type { CaseOutline, Slot } from "../scenarios/events.js";
import type { AmendmentInstrument } from "../scenarios/amendments.js";
import { applyAmendments } from "../scenarios/clauses.js";
import { depositCap, holdingCap, invoice } from "../scenarios/money.js";
import { assertEnglishSynthetic } from "./language-policy.js";

export const para = (text: string): ContentBlock => ({
  kind: "paragraph",
  text,
});
export const heading = (text: string): ContentBlock => ({
  kind: "heading",
  level: 2,
  text,
});
export const table = (columns: string[], rows: string[][]): ContentBlock => ({
  kind: "table",
  columns,
  rows,
});
export const gbp = (pence: number): string =>
  `GBP${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export type CaseDocument = AuthoredDocument & {
  family: string;
  date: string;
  property_id: string;
  parties: string[];
  financial_facts: Record<string, number>;
  source_keys: string[];
  variant: string;
  evidence_facts?: {
    item_keys: string[];
    meter_readings: Record<string, number>;
    baseline_present: boolean;
    electrical: {
      code: "satisfactory" | "unsatisfactory";
      observations: string[];
      follow_up: string | null;
    };
    proposed_deduction_pence: number;
    agreed_deduction_pence: number;
    remaining_deposit_pence: number;
  };
};

export function makeContentContext(
  profiles: Profiles,
  matter: CaseOutline,
  slot: Slot,
  instruments: readonly AmendmentInstrument[],
) {
  const deal = profiles.entities.deals.find((v) => v.id === matter.deal_id);
  const property = profiles.entities.properties.find(
    (v) => v.id === matter.property_id,
  );
  const home = profiles.properties.find(
    (v) => v.property_id === matter.property_id,
  );
  const principal = profiles.principals.find(
    (v) => v.key === matter.principal_key,
  );
  const event = matter.events.find((v) => v.key === slot.event_key);
  const client = profiles.entities.clients.find(
    (v) => v.id === deal?.client_id,
  );
  const counterparty = profiles.actors.find(
    (v) => v.key === matter.counterparty_key,
  );
  if (
    !deal ||
    !property ||
    !home ||
    !principal ||
    !event ||
    !client ||
    !counterparty
  )
    throw new Error("Unresolved authoring facts.");
  const index = Number(matter.key.split("/")[1]) - 1;
  const matterAmendments = instruments.filter((a) => a.deal_key === matter.key);
  const amendment = matterAmendments.find((a) => a.key === slot.key);
  const baseClauses: Record<string, string> = {
    "agency-fee": String(125 + (index % 4) * 5),
    "marketing-scope": "Public portal and accompanied viewing instruction",
    "service-level": [
      "Let-only; instruction ends after handover",
      "Rent collection only; owner appoints contractors",
      "Full management; agency arranges inspections and authorised repairs",
    ][index % 3]!,
    "repair-authority": String(10_000 + (index % 5) * 2500),
    parking: home.parking,
    furnishing: home.furnishing,
    bills: "Tenant arranges and pays broadband directly",
    access: "Inspection appointment to be agreed in writing",
    "pet-permission": "No individual pet request recorded",
    administration:
      "Instruction correspondence to principal's original example contact",
    "key-custody": `One management key set ${home.key}/keys-a held by owner`,
    "viewing-arrangements": "Accompanied weekday viewings by prior agreement",
  };
  // Base agreement schedules are the source of each old term; proposed changes never become defaults.
  for (const change of matterAmendments.filter((a) => a.contract_key))
    baseClauses[change.clause_key] = change.old_term;
  const clauses = { ...baseClauses };
  for (const contractKey of new Set(
    matterAmendments
      .map((a) => a.contract_key)
      .filter((key): key is string => !!key),
  )) {
    const changes = matterAmendments.filter(
      (a) => a.contract_key === contractKey,
    );
    Object.assign(
      clauses,
      applyAmendments(
        { key: contractKey, deal_key: matter.key, type: "contract", clauses },
        changes,
        event.date,
      ).operative,
    );
  }
  const surveySlot = matter.slots.find((s) => s.family === "S12");
  const surveyDate = matter.events.find(
    (e) => e.key === surveySlot?.event_key,
  )?.date;
  const saleReduction =
    deal.type === "sale" &&
    surveyDate &&
    event.date >= surveyDate &&
    index % 3 === 2 &&
    !["marketed-sale", "withdrawn-rental"].includes(matter.cohort)
      ? (5_000 + (index % 5) * 1500) * 100
      : 0;
  const priceAgreed = home.asking_sale_pence - saleReduction;
  const fee = invoice(priceAgreed, Number(clauses["agency-fee"]), 2000);
  const sale_finances = {
    asking_sale_pence: home.asking_sale_pence,
    agreed_sale_pence: priceAgreed,
    agency_fee_bps: Number(clauses["agency-fee"]),
    agency_fee_net_pence: fee.net_pence,
    agency_fee_vat_pence: fee.vat_pence,
    agency_fee_total_pence: fee.total_pence,
  };
  const rental_finances = {
    monthly_rent_pence: home.monthly_rent_pence,
    deposit_pence: depositCap(home.monthly_rent_pence),
    holding_pence: holdingCap(home.monthly_rent_pence),
  };
  const financial_facts: Record<string, number> =
    deal.type === "rental" ? { ...rental_finances } : { ...sale_finances };
  if (deal.type === "sale") {
    const offer = matter.events.find((e) => e.kind === "offer");
    if (!offer || event.date < offer.date)
      delete financial_facts.agreed_sale_pence;
    if (slot.family !== "S15") {
      delete financial_facts.agency_fee_net_pence;
      delete financial_facts.agency_fee_vat_pence;
      delete financial_facts.agency_fee_total_pence;
    }
  }
  const partyKeys = [
    ...principal.signatory_keys,
    ...(deal.type === "rental" && slot.family !== "R01" && slot.family !== "R02"
      ? [counterparty.key]
      : []),
  ];
  const guarantor = profiles.actors.find(
    (actor) => actor.key === `${matter.counterparty_key}/guarantor`,
  );
  if (slot.family === "R08") {
    if (!guarantor) throw new Error("Guarantee without named guarantor.");
    partyKeys.splice(principal.signatory_keys.length, 1, guarantor.key);
  } else if (
    slot.family === "R14" &&
    amendment?.consent?.guarantor_consented &&
    guarantor
  )
    partyKeys.push(guarantor.key);
  const signatories = partyKeys.map((key) => {
    const actor = profiles.actors.find((a) => a.key === key);
    if (!actor) throw new Error("Unresolved household signatory.");
    return { actor_key: actor.key, name: actor.name, capacity: actor.role };
  });
  const hasCompletion = matter.cohort === "completed-sale";
  const executed =
    !["pre-let", "marketed-sale"].includes(matter.cohort) ||
    ["S02", "R01"].includes(slot.family);
  const samePropertyDealKeys = new Set(
    profiles.entities.deals
      .filter((d) => d.property_id === property.id)
      .map(
        (d) =>
          `deal/${String(profiles.entities.deals.indexOf(d) + 1).padStart(3, "0")}`,
      ),
  );
  const propertyAmendments = instruments.filter((a) =>
    samePropertyDealKeys.has(a.deal_key),
  );
  const beds = home.rooms
    .flatMap((room) => room.items)
    .filter((item) => item.description === "Bed frame and mattress");
  const allBedsRemoved =
    beds.length > 0 &&
    beds.every((bed) =>
      propertyAmendments.some(
        (a) =>
          a.clause_key === "furnishing" &&
          a.contract_key &&
          a.status === "signed" &&
          a.effective_from <= event.date &&
          a.old_term.includes(bed.key),
      ),
    );
  const stateHome = {
    ...home,
    furnishing:
      home.furnishing === "furnished" && allBedsRemoved
        ? ("part-furnished" as const)
        : home.furnishing,
  };
  return {
    profiles,
    matter,
    slot,
    deal,
    property,
    home: stateHome,
    principal,
    client,
    counterparty,
    event,
    index,
    amendment,
    matterAmendments,
    propertyAmendments,
    baseClauses,
    clauses,
    financial_facts,
    sale_finances,
    rental_finances,
    signatories,
    hasCompletion,
    executed,
    money: {
      asking: gbp(home.asking_sale_pence),
      agreed: gbp(priceAgreed),
      reduction: gbp(saleReduction),
      fee_net: gbp(fee.net_pence),
      fee_vat: gbp(fee.vat_pence),
      fee_total: gbp(fee.total_pence),
      rent: gbp(home.monthly_rent_pence),
      deposit: gbp(rental_finances.deposit_pence),
      holding: gbp(rental_finances.holding_pence),
    },
    solicitors: {
      seller: `Alder Quay Legal Demonstration / case ${index + 1} / seller.${index + 1}@conveyancers.example`,
      buyer: `Merehaven Conveyancing Demonstration / case ${index + 1} / buyer.${index + 1}@conveyancers.example`,
    },
  };
}
export type ContentContext = ReturnType<typeof makeContentContext>;
export function opening(ctx: ContentContext): ContentBlock[] {
  return [
    para(corpus.notice),
    table(
      ["Matter reference", "Details"],
      [
        ["Agency", corpus.agency],
        ["Deal", `${ctx.matter.key} / ${ctx.deal.number}`],
        ["Document date", ctx.event.date],
        ["Instructing principal", ctx.client.name],
        ["Property", ctx.property.address],
        ["Purpose", ctx.slot.purpose],
      ],
    ),
    para(
      `All people, contacts, properties and transaction histories in this document are fictional. Addresses are synthetic streets in ${ctx.home.borough}, London ${ctx.home.district}; they are not assertions about actual residents or titles.`,
    ),
  ];
}
export function execution(
  ctx: ContentContext,
  includeAgency: boolean,
): ContentBlock {
  const state = ctx.amendment
    ? ctx.amendment.status === "signed"
      ? "simulated-signed"
      : ctx.amendment.status
    : ctx.executed
      ? "simulated-signed"
      : "draft";
  return {
    kind: "execution",
    state,
    signatories: [
      ...ctx.signatories,
      ...(includeAgency
        ? [
            {
              actor_key: "agency/operations-lead",
              name: ctx.profiles.staff[8]!.display_name,
              capacity: "Authorised fictional agency representative",
            },
          ]
        : []),
    ],
  };
}
export function documentFor(
  ctx: ContentContext,
  title: string,
  blocks: ContentBlock[],
  sourceKeys: string[],
  issuer: AuthoredDocument["issuer"] = "agency",
): CaseDocument {
  return {
    key: ctx.slot.key,
    title,
    issuer,
    blocks: [...opening(ctx), ...blocks],
    family: ctx.slot.family,
    date: ctx.event.date,
    property_id: ctx.property.id,
    parties: ctx.signatories.map((s) => s.actor_key),
    financial_facts: { ...ctx.financial_facts },
    source_keys: sourceKeys,
    variant: ctx.matter.variant,
  };
}
export function textOf(doc: AuthoredDocument): string {
  return [
    doc.title,
    ...doc.blocks.flatMap((block) =>
      block.kind === "table"
        ? [...block.columns, ...block.rows.flat()]
        : block.kind === "execution"
          ? [
              block.state === "simulated-signed"
                ? "Simulated signature"
                : block.state,
              ...block.signatories.flatMap((s) => [s.name, s.capacity]),
            ]
          : block.kind === "page-break"
            ? []
            : [block.text],
    ),
  ].join("\n");
}
export function validateAuthored(doc: CaseDocument, ctx: ContentContext): void {
  const text = textOf(doc);
  assertEnglishSynthetic(text);
  if (
    doc.key !== ctx.slot.key ||
    doc.family !== ctx.slot.family ||
    doc.date !== ctx.event.date ||
    doc.property_id !== ctx.property.id ||
    JSON.stringify(doc.parties) !==
      JSON.stringify(ctx.signatories.map((s) => s.actor_key))
  )
    throw new Error("Authored identity, parties or property drift.");
  if (
    JSON.stringify(doc.financial_facts) !== JSON.stringify(ctx.financial_facts)
  )
    throw new Error("Authored financial facts drift.");
  if (!text.includes(ctx.client.name) || !text.includes(ctx.property.address))
    throw new Error("Missing standalone principal/property identification.");
  if (
    ctx.slot.family === "S08" &&
    (!text.includes("Subject to contract") ||
      /(?:creates a binding|legally binding sale|buyer is bound to purchase)/i.test(
        text,
      ))
  )
    throw new Error("Ordinary memorandum must not imply binding sale.");
  if (["S13", "S14", "S15"].includes(ctx.slot.family) && !ctx.hasCompletion)
    throw new Error("Completion document in an uncompleted matter.");
  if (ctx.deal.type === "rental") {
    if (
      ctx.event.date >= "2026-05-01" &&
      /new fixed-term AST|Rent increases automatically by this addendum|Official Form 4A certificate|Pay six months of rent before signing|Accept a bid above the advertised rent/i.test(
        text,
      )
    )
      throw new Error(
        "Prohibited or falsely official current tenancy content.",
      );
    if (
      ctx.slot.family === "R14" &&
      ctx.amendment?.status === "signed" &&
      ctx.amendment.contract_key &&
      ctx.profiles.actors.some(
        (actor) => actor.key === `${ctx.matter.counterparty_key}/guarantor`,
      ) &&
      !ctx.amendment.consent?.guarantor_consented
    )
      throw new Error(
        "Applicable signed variation lacks named guarantor consent.",
      );
  }
  if (doc.blocks.filter((b) => b.kind !== "page-break").length < 5)
    throw new Error("Document lacks substantive authored structure.");
}
