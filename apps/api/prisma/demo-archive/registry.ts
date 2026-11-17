import type { DocumentMetadata } from "@agency/contracts";
import type { CaseDocument, ContentContext } from "./content/context.js";
import { authorSales } from "./content/sales/index.js";
import { authorLettings } from "./content/lettings/index.js";
import { authorManagement } from "./content/property-management/index.js";
import { authorSupporting } from "./content/supporting/index.js";

export const PDF_MIME = "application/pdf";
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export function classification(family: string): DocumentMetadata["type"] {
  if (["S02", "R01", "R07", "R08"].includes(family)) return "contract";
  if (["S03", "R02", "R14"].includes(family)) return "amendment";
  if (["S04", "R03"].includes(family)) return "listing_sheet";
  if (["S14", "R12", "R22", "C05"].includes(family)) return "handover_report";
  return "other";
}
export function authorDocument(c: ContentContext): CaseDocument {
  if (c.slot.family.startsWith("S")) return authorSales(c);
  if (c.slot.family.startsWith("C")) return authorSupporting(c);
  if (/^R(?:0[1-9]|10|14|19|20|21)$/.test(c.slot.family))
    return authorLettings(c);
  return authorManagement(c);
}
export type CompiledDocument = {
  key: string;
  instrument_key: string;
  event_key: string;
  family: string;
  purpose: string;
  author_role: string;
  recipient_actor_keys: string[];
  format: "pdf" | "docx";
  path: string;
  metadata: DocumentMetadata;
  unresolved_parent_reason: string | null;
  revises_instrument_key: string | null;
  provenance: { classification: "original-synthetic"; source_keys: string[] };
  content: CaseDocument;
};
