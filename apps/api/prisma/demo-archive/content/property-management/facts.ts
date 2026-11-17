import { apportionLoss } from "../../scenarios/money.js";
import { seededInt } from "../../profiles/properties.js";
import type { ContentContext, CaseDocument } from "../context.js";

export function itemAgeAt(ageAtBaseline: number, date: string): number {
  return (
    ageAtBaseline +
    (Number(date.slice(0, 4)) - 2025) * 12 +
    Number(date.slice(5, 7)) -
    1
  );
}
export function roomItemState(c: ContentContext, date: string) {
  return c.home.rooms.map((room) => ({
    ...room,
    items: room.items.map((item) => {
      const removed = c.propertyAmendments.some(
        (a) =>
          a.clause_key === "furnishing" &&
          a.old_term.includes(item.key) &&
          a.status === "signed" &&
          a.contract_key &&
          a.effective_from <= date,
      );
      const firstDeal = c.profiles.entities.deals.find(
        (deal) => deal.property_id === c.property.id,
      )!;
      const firstIndex = c.profiles.entities.deals.indexOf(firstDeal);
      const inherited =
        c.matter.sequence === 2 &&
        item.key.endsWith("/room-1/floor") &&
        firstIndex % 3 !== 1;
      return {
        ...item,
        age_months: itemAgeAt(item.age_months, date),
        present: !removed,
        condition: inherited
          ? `${item.condition}; prior tenancy check-out recorded an unrepaired local carpet mark before this new matter; not attributable to the new occupier`
          : item.condition,
      };
    }),
  }));
}
export function evidenceFacts(
  c: ContentContext,
): NonNullable<CaseDocument["evidence_facts"]> {
  const items = c.home.rooms.flatMap((r) => r.items);
  const floor = items.find((item) => item.key.endsWith("/room-1/floor"))!;
  const room = c.home.rooms[0]!;
  const replacement = Math.round(room.length_m * room.width_m * 3000);
  const ended = c.matter.cohort === "ended-rental";
  const age = itemAgeAt(floor.age_months, "2025-12-31");
  const proposed =
    ended && c.index % 3 !== 1
      ? apportionLoss({
          replacement_pence: replacement,
          age_months: age,
          useful_life_months: 96,
          responsibility_bps: 10000,
          baseline_present: true,
        })
      : 0;
  const agreed =
    ended && c.index % 3 !== 1
      ? apportionLoss({
          replacement_pence: replacement,
          age_months: age,
          useful_life_months: 96,
          responsibility_bps: c.index % 3 === 2 ? 6000 : 8000,
          baseline_present: true,
        })
      : 0;
  // The inspection belongs to the property, not the current tenancy/deal.
  const sourceIndex = Number(c.home.key.split("/")[1]) - 1;
  const serious = sourceIndex % 5 === 0;
  const elapsed = Math.max(
    0,
    Math.floor(
      (Date.parse(c.event.date) - Date.parse("2025-01-01")) / 86400000,
    ),
  );
  return {
    item_keys: items.map((item) => item.key),
    meter_readings: Object.fromEntries(
      c.home.meters.map((meter) => [
        meter.key,
        seededInt(meter.key, 1000, 15000) +
          Math.floor(
            elapsed *
              (meter.utility === "electricity"
                ? 6
                : meter.utility === "gas"
                  ? 0.3
                  : 0.4),
          ),
      ]),
    ),
    baseline_present: true,
    electrical: {
      code: serious ? "unsatisfactory" : "satisfactory",
      observations: serious
        ? ["C2 exposed connection identified in historical report"]
        : sourceIndex % 3 === 1
          ? ["No coded observation in the fictional source extract"]
          : [
              "C3 labelling improvement advised; no urgent or potentially dangerous finding in source extract",
            ],
      follow_up: serious
        ? "2024-07-25: fictional remedial record closes the exposed-connection issue, before any corpus move-in"
        : null,
    },
    proposed_deduction_pence: proposed,
    agreed_deduction_pence: agreed,
    remaining_deposit_pence:
      c.deal.type === "rental" ? c.rental_finances.deposit_pence - agreed : 0,
  };
}
