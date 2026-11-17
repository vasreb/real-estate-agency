import { createHash } from "node:crypto";
import { corpus, stableId, type PropertyProfile } from "../model.js";

export function seededInt(key: string, low: number, high: number): number {
  return (
    low +
    (createHash("sha256")
      .update(`${corpus.seed}/${key}`)
      .digest()
      .readUInt32BE(0) %
      (high - low + 1))
  );
}
export type RichProperty = PropertyProfile & {
  condition_baseline_date: "2025-01-01";
  category:
    | "studio"
    | "one-bed-flat"
    | "two-bed-flat"
    | "maisonette"
    | "terraced-house"
    | "larger-house";
  borough: string;
  district: string;
  fictional_address: true;
  floors: number;
  furnishing: "furnished" | "part-furnished" | "unfurnished";
  outdoor_space: string;
  parking: string;
  access: string;
  asking_sale_pence: number;
  monthly_rent_pence: number;
  lease: {
    reference: string;
    years_remaining: number;
    annual_service_pence: number;
    planned_works: string;
  } | null;
  equipment: {
    key: string;
    description: string;
    fuel: "gas" | "electric";
    installed: string;
  }[];
  meters: { key: string; utility: string; reference: string; unit: string }[];
  alarms: {
    key: string;
    location: string;
    type: "smoke" | "carbon-monoxide";
  }[];
  defects: {
    key: string;
    location: string;
    observation: string;
    action: string;
  }[];
};

const classes = [
  {
    category: "studio",
    count: 12,
    bedrooms: 0,
    area: [25, 38],
    sale: [230_000, 360_000],
    rent: [1400, 1800],
  },
  {
    category: "one-bed-flat",
    count: 24,
    bedrooms: 1,
    area: [38, 58],
    sale: [320_000, 525_000],
    rent: [1700, 2300],
  },
  {
    category: "two-bed-flat",
    count: 24,
    bedrooms: 2,
    area: [58, 90],
    sale: [450_000, 800_000],
    rent: [2200, 3200],
  },
  {
    category: "maisonette",
    count: 12,
    bedrooms: 3,
    area: [75, 110],
    sale: [550_000, 900_000],
    rent: [2400, 3500],
  },
  {
    category: "terraced-house",
    count: 18,
    bedrooms: 3,
    area: [95, 160],
    sale: [700_000, 1_300_000],
    rent: [3000, 4800],
  },
  {
    category: "larger-house",
    count: 6,
    bedrooms: 4,
    area: [130, 220],
    sale: [950_000, 1_900_000],
    rent: [3800, 6500],
  },
] as const;
const districts = [
  { borough: "Haringey", district: "N8", premium: 0.45 },
  { borough: "Islington", district: "N7", premium: 0.8 },
  { borough: "Barnet", district: "N12", premium: 0.3 },
  { borough: "Ealing", district: "W5", premium: 0.55 },
  { borough: "Hounslow", district: "W4", premium: 0.7 },
] as const;
const streets = [
  "Alder Lantern Walk",
  "Briar Lantern Mews",
  "Cedar Lantern Rise",
  "Dove Lantern Gardens",
  "Elm Lantern Court",
  "Fern Lantern Way",
  "Glen Lantern Terrace",
  "Hazel Lantern Close",
];
export function makeProperties() {
  const profiles: RichProperty[] = [];
  const properties = classes.flatMap((group) =>
    Array.from({ length: group.count }, (_, within) => {
      const index = profiles.length;
      const key = `property/${String(index + 1).padStart(3, "0")}`;
      const geography = districts[index % districts.length]!;
      const area = seededInt(`${key}/area`, group.area[0], group.area[1]);
      const conditionScore = seededInt(`${key}/condition`, 0, 2);
      const score =
        (0.5 * (area - group.area[0])) / (group.area[1] - group.area[0]) +
        0.3 * geography.premium +
        0.1 * conditionScore;
      const isHouse = index >= 72;
      const leasehold = index < 60 || (index < 72 && within < 9);
      const heating = index % 4 === 0 ? "electric" : "gas";
      const furnishing =
        index % 3 === 0
          ? "furnished"
          : index % 3 === 1
            ? "part-furnished"
            : "unfurnished";
      const roomNames =
        group.bedrooms === 0
          ? ["Living/sleeping room", "Kitchen", "Shower room", "Entrance"]
          : [
              "Living room",
              "Kitchen",
              ...Array.from(
                { length: group.bedrooms },
                (_, b) => `Bedroom ${b + 1}`,
              ),
              "Bathroom",
              ...(area > 110 ? ["Second shower room"] : []),
              "Hall and circulation",
              ...(area > 100 ? ["Utility room", "Study"] : []),
            ];
      // Areas reconcile; room dimensions are indicative rectangle equivalents, not measured surveys.
      const weights = roomNames.map((name) =>
        name.includes("Living")
          ? 3
          : name.includes("Bedroom")
            ? 2
            : name === "Kitchen"
              ? 1.8
              : name.includes("Bathroom") || name.includes("Shower")
                ? 0.8
                : 1,
      );
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      const rooms = roomNames.map((name, i) => {
        const roomKey = `${key}/room-${i + 1}`;
        const roomArea = (area * weights[i]!) / totalWeight;
        const width = Math.round(Math.sqrt(roomArea / 1.2) * 100) / 100;
        const items: PropertyProfile["rooms"][number]["items"] = [
          {
            key: `${roomKey}/walls`,
            description: "Painted plaster walls and skirting",
            quantity: 1,
            age_months: seededInt(`${roomKey}/decoration`, 4, 48),
            condition:
              conditionScore === 0
                ? "Small scuffs beside the doorway; stable dry surface"
                : "Even finish; minor contact marks below switch",
          },
          {
            key: `${roomKey}/floor`,
            description:
              name.includes("Bedroom") || name.includes("Living")
                ? "Fitted woven carpet"
                : "Resilient sealed floor finish",
            quantity: 1,
            age_months: seededInt(`${roomKey}/floor`, 12, 72),
            condition:
              "Clean, serviceable; wear visible along the normal walking route",
          },
          {
            key: `${roomKey}/door`,
            description: "Internal door, handle and latch",
            quantity: 1,
            age_months: 60,
            condition: "Latch engages; small paint chip at lower hinge",
          },
        ];
        if (name === "Kitchen")
          items.push({
            key: `${roomKey}/oven`,
            description: "Electric oven with two shelves",
            quantity: 1,
            age_months: 15,
            condition:
              "Operated at baseline inspection; enamel wear to lower tray",
          });
        if (
          furnishing === "furnished" &&
          (name.includes("Bedroom") || name === "Living/sleeping room")
        )
          items.push({
            key: `${roomKey}/bed`,
            description: "Bed frame and mattress",
            quantity: 1,
            age_months: 24,
            condition:
              "Frame sound; light compression to mattress, protector supplied",
          });
        const add = (
          suffix: string,
          description: string,
          quantity: number,
          age_months: number,
          condition: string,
        ) =>
          items.push({
            key: `${roomKey}/${suffix}`,
            description,
            quantity,
            age_months,
            condition,
          });
        add(
          "ceiling-light",
          "Ceiling and fixed light fitting",
          1,
          36,
          "Ceiling intact; shade secure; descriptive visual check only, not an electrical test",
        );
        if (/Living|Bedroom|Kitchen|Study/.test(name)) {
          add(
            "window",
            "Double-glazed window, handle and blind",
            1,
            72,
            "Handle closes; light seal discolouration; blind cord and slats retained in baseline",
          );
          add(
            "heat-emitter",
            heating === "gas"
              ? "Wall radiator and valve"
              : "Electric panel heater",
            1,
            28,
            "Secure mounting; light finish wear beside control; no professional safety opinion implied",
          );
        }
        if (name === "Kitchen") {
          add(
            "units",
            "Kitchen cabinets, drawers and worktop",
            1,
            60,
            "Hinges hold; small laminate chip beside sink and light drawer-base wear",
          );
          add(
            "sink-tap",
            "Stainless sink, mixer tap and plug",
            1,
            48,
            "Surface scratching and light limescale at tap base; no active leak observed in baseline",
          );
          if (furnishing !== "unfurnished")
            add(
              "fridge",
              "Fridge-freezer with shelves and drawers",
              1,
              30,
              "Two shelves and two drawers; seals intact; small dent to lower door",
            );
        }
        if (/Bathroom|[Ss]hower/.test(name)) {
          add(
            "toilet",
            "WC pan, seat and cistern",
            1,
            48,
            "Seat secure; light hinge discolouration; no visible crack",
          );
          add(
            "basin",
            "Wash basin, taps and waste",
            1,
            48,
            "Light use scratches and limescale; existing small mark beside overflow",
          );
          add(
            "bath-shower",
            name.includes("Bathroom")
              ? "Bath with shower screen and mixer"
              : "Shower tray, screen and fittings",
            1,
            60,
            "Screen moves freely; aged sealant at lower corner retained as a pre-existing observation",
          );
        }
        if (furnishing === "furnished" && /Bedroom|Living\/sleeping/.test(name))
          add(
            "wardrobe",
            "Freestanding wardrobe with rail",
            1,
            36,
            "Doors align; small scratch at lower left side; rail present",
          );
        if (furnishing === "furnished" && name.includes("Living")) {
          add(
            "seating",
            name === "Living/sleeping room"
              ? "Upholstered armchair"
              : "Two-seat upholstered sofa",
            1,
            40,
            "Fabric intact with normal seat compression; light rub to outer arm",
          );
          add(
            "small-table",
            "Small side table",
            1,
            48,
            "Stable legs; two existing water-ring marks on top",
          );
        }
        return {
          key: roomKey,
          name,
          length_m: Math.round((roomArea / width) * 100) / 100,
          width_m: width,
          items,
        };
      });
      const id = stableId(key);
      profiles.push({
        condition_baseline_date: "2025-01-01",
        key,
        property_id: id,
        category: group.category,
        borough: geography.borough,
        district: geography.district,
        fictional_address: true,
        tenure: leasehold ? "leasehold" : "freehold",
        share_of_freehold: leasehold && index % 7 === 0,
        bedrooms: group.bedrooms,
        bathrooms: area > 110 ? 2 : 1,
        area_m2: area,
        floors: isHouse || group.category === "maisonette" ? 2 : 1,
        heating,
        rooms,
        furnishing,
        outdoor_space: isHouse
          ? "Private rear garden; boundary planting retained"
          : index % 3 === 0
            ? "Shared courtyard; no exclusive storage rights"
            : "No private outdoor space",
        parking:
          index % 4 === 0
            ? "One allocated bay, DEMO-PARK reference in property schedule"
            : "No demised parking; local permit eligibility not warranted",
        access:
          index % 2 === 0 && !isHouse
            ? "Upper floor reached by communal stairs; no lift"
            : "Entrance with a threshold step; no step-free access representation",
        asking_sale_pence:
          Math.round(
            (group.sale[0] + (group.sale[1] - group.sale[0]) * score) / 500,
          ) * 50_000,
        monthly_rent_pence:
          Math.round(
            (group.rent[0] + (group.rent[1] - group.rent[0]) * score) / 5,
          ) * 500,
        lease: leasehold
          ? {
              reference: `DEMO-LEASE-${index + 1}`,
              years_remaining: 82 + (index % 65),
              annual_service_pence: 120_000 + (index % 10) * 24_000,
              planned_works:
                index % 3 === 0
                  ? "Communal roof survey proposed; cost and timing unconfirmed, enquiry required"
                  : "No notified major works in the synthetic owner records; not a warranty",
            }
          : null,
        equipment: [
          {
            key: `${key}/heating`,
            description:
              heating === "gas"
                ? "Gas combination boiler"
                : "Electric panel heating",
            fuel: heating,
            installed: "2022-08-15",
          },
          {
            key: `${key}/oven`,
            description: "Electric oven",
            fuel: "electric",
            installed: "2023-09-10",
          },
        ],
        meters: [
          "electricity",
          "water",
          ...(heating === "gas" ? ["gas"] : []),
        ].map((utility) => ({
          key: `${key}/meter-${utility}`,
          utility,
          reference: `DEMO-METER-${index + 1}-${utility.toUpperCase()}`,
          unit: utility === "electricity" ? "kWh" : "m3",
        })),
        alarms: [
          {
            key: `${key}/smoke`,
            location: "Hall circulation route",
            type: "smoke",
          },
          ...(heating === "gas"
            ? [
                {
                  key: `${key}/co`,
                  location: "Room containing boiler",
                  type: "carbon-monoxide" as const,
                },
              ]
            : []),
        ],
        defects: [
          {
            key: `${key}/defect-1`,
            location: rooms[0]!.key,
            observation:
              conditionScore === 0
                ? "Small historic decoration marks beside window reveal; no current damp diagnosis"
                : "Minor carpet edge wear at living-room threshold",
            action:
              conditionScore === 0
                ? "Inspect after heavy rain; obtain specialist advice if staining changes"
                : "Photograph at handover and allow ordinary wear in any later comparison",
          },
        ],
      });
      return {
        id,
        address: `${index + 11} ${streets[index % streets.length]!}, ${geography.borough}, London ${geography.district} (synthetic address)`,
      };
    }),
  );
  return { properties, profiles };
}
