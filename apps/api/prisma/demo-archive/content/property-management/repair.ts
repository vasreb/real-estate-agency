import type { ContentContext } from "../context.js";

/** One work order feeds observation, authority, report and invoice. */
export function repairFor(c: ContentContext) {
  const scopes = [
    {
      kind: "Oven control",
      target: `${c.home.rooms.find((r) => r.name === "Kitchen")!.key}/oven`,
      symptom: "Intermittent oven temperature control during ordinary cooking",
      scope:
        "Inspect the existing control connection and thermostat; replace only the failed control component supported by testing, then function-check",
      outcome:
        "Secured the intermittent control connection and replaced the failed thermostat control; a controlled heating cycle remained stable",
      follow_up:
        "Occupier to report renewed temperature fluctuation; this functional test is not a statutory electrical certificate",
      net: 12500,
    },
    {
      kind: "Kitchen mixer",
      target: `${c.home.rooms.find((r) => r.name === "Kitchen")!.key}/sink-tap`,
      symptom:
        "Fresh drip from the kitchen mixer spindle, distinct from the baseline limescale",
      scope:
        "Isolate the local water supply, inspect and replace the worn mixer cartridge and seals; retain the existing sink and check for leaks",
      outcome:
        "Replaced the worn cartridge and seals; checked the mixer and visible supply joints under running and static conditions without a continuing drip",
      follow_up:
        "Occupier to check for recurrence over the next week; report concealed damp separately rather than treating this local repair as a whole-system survey",
      net: 14500,
    },
    {
      kind: "Internal door latch",
      target: `${c.home.rooms[0]!.key}/door`,
      symptom:
        "Living-room internal latch no longer engages reliably after ordinary use",
      scope:
        "Adjust the existing internal door keep and hinges, replace the worn latch, retain the door leaf and check free opening and closing",
      outcome:
        "Adjusted the keep and hinge alignment and replaced the worn internal latch; the door opened and closed without binding at the visit",
      follow_up:
        "Occupier to report renewed binding; no external-security lock, fire-door certification or additional key set is represented",
      net: 10500,
    },
  ];
  const item = scopes[c.index % 3]!;
  const net = item.net + (c.index % 4) * 1500;
  const vat = Math.round(net / 5);
  return {
    ...item,
    label: `${item.kind} / ${item.target}`,
    net,
    vat,
    total: net + vat,
  };
}
