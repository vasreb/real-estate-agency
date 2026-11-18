import type { DocumentMetadata, TeamDocument } from "@agency/contracts";
import type { Database } from "../../../infrastructure/database/index.js";

/** Explicit projection: neither file_data nor pdf_representation is selected. */
export const teamDocumentSelect = {
  id: true,
  dealId: true,
  teamId: true,
  deal: { select: { teamId: true } },
  type: true,
  title: true,
  documentNumber: true,
  documentDate: true,
  effectiveFrom: true,
  status: true,
  fileName: true,
  mimeType: true,
  processingStatus: true,
  indexedAt: true,
  processingError: true,
  createdAt: true,
} as const;

type TeamDocumentRow = {
  id: string;
  dealId: string | null;
  teamId: string | null;
  deal: { teamId: string } | null;
  type: DocumentMetadata["type"];
  title: string;
  documentNumber: string | null;
  documentDate: Date | null;
  effectiveFrom: Date | null;
  status: DocumentMetadata["status"];
  fileName: string;
  mimeType: string;
  processingStatus: TeamDocument["processing_status"];
  indexedAt: Date | null;
  processingError: string | null;
  createdAt: Date;
};

const isoDate = (value: Date | null) =>
  value ? value.toISOString().slice(0, 10) : null;

export function toTeamDocument(row: TeamDocumentRow): TeamDocument {
  const teamId = row.teamId ?? row.deal?.teamId;
  if (!teamId) throw new Error("Document without an owning team");
  return {
    id: row.id,
    team_id: teamId,
    deal_id: row.dealId,
    type: row.type,
    title: row.title,
    document_number: row.documentNumber,
    document_date: isoDate(row.documentDate),
    effective_from: isoDate(row.effectiveFrom),
    status: row.status,
    file_name: row.fileName,
    mime_type: row.mimeType as TeamDocument["mime_type"],
    processing_status: row.processingStatus,
    indexed_at: row.indexedAt ? row.indexedAt.toISOString() : null,
    processing_error: row.processingError,
    created_at: row.createdAt.toISOString(),
  };
}

export function createTeamDocumentReader(options: { database: Database }) {
  return {
    /** All documents of a team: its own collection and those of its deals. */
    async listTeamDocuments(teamId: string): Promise<TeamDocument[]> {
      const rows = await options.database.document.findMany({
        where: { OR: [{ teamId }, { deal: { teamId } }] },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: teamDocumentSelect,
      });
      return rows.map(toTeamDocument);
    },
  };
}
