import { stableId, type Actor } from "../model.js";

const given = [
  "Amelia",
  "Oliver",
  "Nadia",
  "Theo",
  "Clara",
  "Elliot",
  "Freya",
  "Hugo",
  "Leila",
  "Rowan",
  "Sophie",
  "Miles",
  "Anika",
  "Oscar",
  "Celia",
  "Jasper",
  "Mina",
  "Daniel",
  "Esme",
  "Rafael",
];
const surnames = [
  "Alderbrook",
  "Briarcombe",
  "Cedarwick",
  "Dovemere",
  "Elmsworth",
  "Fernley",
  "Glenfield",
  "Hazelcott",
  "Ivydale",
  "Juniperwell",
  "Kestrelby",
  "Larchford",
  "Meadowcroft",
  "Nettlehurst",
  "Oakmere",
  "Pinecombe",
];
export function fictionalName(index: number): string {
  return `${given[index % given.length]!} ${surnames[Math.floor(index / given.length) % surnames.length]!}`;
}
export type Principal = {
  key: string;
  client_id: string;
  kind: "individual" | "household" | "corporate";
  actor_keys: string[];
  signatory_keys: string[];
  authority: string;
};

export function makeClients() {
  const actors: Actor[] = [];
  const principals: Principal[] = [];
  const clients = Array.from({ length: 80 }, (_, i) => {
    const key = `principal/${String(i + 1).padStart(3, "0")}`;
    const id = stableId(key);
    const kind = i < 52 ? "individual" : i < 70 ? "household" : "corporate";
    const signatoryKeys = Array.from(
      { length: kind === "household" ? 2 : 1 },
      (_, j) => `${key}/signatory-${j + 1}`,
    );
    for (const [j, actorKey] of signatoryKeys.entries())
      actors.push({
        key: actorKey,
        name: fictionalName(i * 2 + j),
        role:
          kind === "corporate"
            ? "representative"
            : j === 0
              ? "principal"
              : "co-owner",
        email: `${actorKey.replaceAll("/", ".")}@people.example`,
        signatory_keys: [actorKey],
      });
    const name =
      kind === "corporate"
        ? `${surnames[i - 70]!} Demonstration Homes Ltd`
        : signatoryKeys
            .map((actorKey) => actors.find((a) => a.key === actorKey)!.name)
            .join(" & ");
    principals.push({
      key,
      client_id: id,
      kind,
      actor_keys: [...signatoryKeys],
      signatory_keys: [...signatoryKeys],
      authority:
        kind === "corporate"
          ? `DEMO-BOARD-${i + 1}: named director authorised to instruct the agency; no real company registration`
          : kind === "household"
            ? "Both named co-owners must approve instruction and any change of principal."
            : "Individual instructing owner; no substitute signatory.",
    });
    return { id, name };
  });
  return { clients, principals, actors };
}
