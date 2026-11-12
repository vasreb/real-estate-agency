import type { DocumentMetadata, PatchDocumentInput } from "@agency/contracts";

type DocumentType = DocumentMetadata["type"];

/**
 * Parent policy: only an amendment may reference a parent, never itself.
 * "lookup" means the parent must still be verified (same deal, contract)
 * inside the write transaction.
 */
export function parentRequirement(
  type: DocumentType,
  parentId: string | null | undefined,
  documentId: string,
): "none" | "lookup" | "invalid" {
  if (parentId === undefined || parentId === null) return "none";
  if (type !== "amendment" || parentId === documentId) return "invalid";
  return "lookup";
}

/** `YYYY-MM-DD` → UTC midnight, the representation Prisma uses for SQL `date`. */
export function toSqlDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export type DocumentUpdate = {
  title?: string;
  status?: DocumentMetadata["status"];
  documentNumber?: string | null;
  documentDate?: Date | null;
  effectiveFrom?: Date | null;
  parentDocumentId?: string | null;
};

/** Omitted keys stay omitted (keep the stored value); null clears. No defaults. */
export function toDocumentUpdate(patch: PatchDocumentInput): DocumentUpdate {
  const update: DocumentUpdate = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.document_number !== undefined)
    update.documentNumber = patch.document_number;
  if (patch.document_date !== undefined)
    update.documentDate =
      patch.document_date === null ? null : toSqlDate(patch.document_date);
  if (patch.effective_from !== undefined)
    update.effectiveFrom =
      patch.effective_from === null ? null : toSqlDate(patch.effective_from);
  if (patch.parent_document_id !== undefined)
    update.parentDocumentId = patch.parent_document_id;
  return update;
}
