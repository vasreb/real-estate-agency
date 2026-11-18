import type { DocumentMetadata } from "@agency/contracts";
import type { Database } from "../../../infrastructure/database/index.js";

/** Explicit projection: file_data is never selected for metadata reads. */
export const documentMetadataSelect = {
  id: true,
  dealId: true,
  parentDocumentId: true,
  type: true,
  title: true,
  documentNumber: true,
  documentDate: true,
  effectiveFrom: true,
  status: true,
  fileName: true,
  mimeType: true,
  createdAt: true,
} as const;

type MetadataRow = {
  id: string;
  dealId: string | null;
  parentDocumentId: string | null;
  type: DocumentMetadata["type"];
  title: string;
  documentNumber: string | null;
  documentDate: Date | null;
  effectiveFrom: Date | null;
  status: DocumentMetadata["status"];
  fileName: string;
  mimeType: string;
  createdAt: Date;
};

const isoDate = (value: Date | null) =>
  value ? value.toISOString().slice(0, 10) : null;

export function toDocumentMetadata(row: MetadataRow): DocumentMetadata {
  // Deal metadata paths only return deal documents; team documents get their
  // own representation with the team documents API.
  if (row.dealId === null) throw new Error("Expected a deal document");
  return {
    id: row.id,
    deal_id: row.dealId,
    parent_document_id: row.parentDocumentId,
    type: row.type,
    title: row.title,
    document_number: row.documentNumber,
    document_date: isoDate(row.documentDate),
    effective_from: isoDate(row.effectiveFrom),
    status: row.status,
    file_name: row.fileName,
    mime_type: row.mimeType as DocumentMetadata["mime_type"],
    created_at: row.createdAt.toISOString(),
  };
}

export function createDocumentMetadataReader(options: { database: Database }) {
  return {
    async listDocumentMetadata(dealId: string): Promise<DocumentMetadata[]> {
      const rows = await options.database.document.findMany({
        where: { dealId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: documentMetadataSelect,
      });
      return rows.map(toDocumentMetadata);
    },
  };
}
