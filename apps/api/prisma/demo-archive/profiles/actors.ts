import type { Actor, PublicEntities } from "../model.js";
import { fictionalName } from "./clients.js";

export function makeCounterparties(deals: PublicEntities["deals"]): Actor[] {
  return deals.flatMap((deal, i) => {
    const key = `counterparty/${String(i + 1).padStart(3, "0")}`;
    const actor: Actor = {
      key,
      name: fictionalName(160 + i),
      role: deal.type === "sale" ? "buyer" : "tenant",
      email: `${key.replaceAll("/", ".")}@people.example`,
      signatory_keys: [key],
    };
    return deal.type === "rental" && i % 5 === 0
      ? [
          actor,
          {
            key: `${key}/guarantor`,
            name: fictionalName(280 + i),
            role: "guarantor",
            email: `guarantor.${i + 1}@people.example`,
            signatory_keys: [`${key}/guarantor`],
          },
        ]
      : [actor];
  });
}
