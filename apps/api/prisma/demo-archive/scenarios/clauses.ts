import { dateSchema } from "@agency/contracts";
import { amendmentReasons, type Amendment } from "./amendments.js";

export const clauseRegistry = amendmentReasons.map((reason) => ({
  key: reason.clause,
  scope: reason.scope,
}));
export type BaseContract = {
  key: string;
  deal_key: string;
  type: string;
  clauses: Record<string, string>;
};
export function applyAmendments(
  contract: BaseContract,
  amendments: readonly Amendment[],
  asOf: string,
) {
  dateSchema.parse(asOf);
  if (contract.type !== "contract")
    throw new Error("Amendment parent must be a contract.");
  const operative = { ...contract.clauses };
  const applied: string[] = [];
  const proposed: Amendment[] = [];
  if (new Set(amendments.map((a) => a.key)).size !== amendments.length)
    throw new Error("Duplicate amendment instrument.");
  for (const change of [...amendments].sort(
    (a, b) =>
      a.effective_from.localeCompare(b.effective_from) ||
      a.key.localeCompare(b.key),
  )) {
    dateSchema.parse(change.document_date);
    dateSchema.parse(change.effective_from);
    if (change.deal_key !== contract.deal_key)
      throw new Error("Cross-deal amendment parent refused.");
    if (!change.contract_key) {
      if (!change.unresolved_reason)
        throw new Error(
          "Unresolved historical parent requires textual identification.",
        );
      continue;
    }
    if (change.contract_key !== contract.key)
      throw new Error("Wrong contract parent.");
    if (
      change.unresolved_reason ||
      !change.reason ||
      !change.retained_terms ||
      !change.old_term ||
      !change.new_term ||
      change.old_term === change.new_term
    )
      throw new Error("Incomplete operative amendment.");
    if (change.clause_key === "rent")
      throw new Error(
        "Rent-increase addendum substitution excluded; use the dated statutory process.",
      );
    if (change.clause_key === "parties") {
      if (
        !change.consent ||
        change.consent.actor_keys.length < 2 ||
        !change.consent.guarantor_consented
      )
        throw new Error(
          "Party change requires scenario-specific novation/consent and guarantor treatment.",
        );
    } else if (
      !clauseRegistry.some((clause) => clause.key === change.clause_key)
    )
      throw new Error("Unknown operative clause.");
    if (change.status !== "signed" || change.effective_from > asOf) {
      proposed.push(change);
      continue;
    }
    if (operative[change.clause_key] !== change.old_term)
      throw new Error(
        "Amendment old term does not match chronological operative state.",
      );
    operative[change.clause_key] = change.new_term;
    applied.push(change.key);
  }
  return { operative, applied, proposed };
}
