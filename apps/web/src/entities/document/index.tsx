import type { DocumentMetadata } from "@agency/contracts";
import { Table } from "@agency/ui";
import type { ReactNode } from "react";
import { documentFileUrl } from "@/shared/api";

export const documentTypeLabel: Record<DocumentMetadata["type"], string> = {
  contract: "Contract",
  amendment: "Amendment",
  listing_sheet: "Property sheet",
  handover_report: "Handover report",
  other: "Other",
};
export const documentStatusLabel: Record<DocumentMetadata["status"], string> = {
  draft: "Draft",
  signed: "Signed",
  unknown: "Not specified",
};
export const EMPTY = "—";

/** `YYYY-MM-DD` → `DD.MM.YYYY` by string, so no timezone can shift the day. */
export function formatDate(value: string | null): string {
  if (!value) return EMPTY;
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

export function contractLabel(document: DocumentMetadata): string {
  return document.document_number
    ? `${document.title} (No. ${document.document_number})`
    : document.title;
}

export function DocumentsTable({
  documents,
  renderActions,
}: {
  documents: DocumentMetadata[];
  renderActions?: (document: DocumentMetadata) => ReactNode;
}) {
  const byId = new Map(documents.map((d) => [d.id, d]));
  return (
    <Table aria-label="Deal documents">
      <thead>
        <tr>
          <th scope="col">Title</th>
          <th scope="col">Type</th>
          <th scope="col">Number</th>
          <th scope="col">Date</th>
          <th scope="col">Status</th>
          <th scope="col">Effective</th>
          <th scope="col">Related contract</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {documents.map((document) => {
          const parent = document.parent_document_id
            ? byId.get(document.parent_document_id)
            : undefined;
          return (
            <tr key={document.id}>
              <td className="wrap-anywhere">{document.title}</td>
              <td>{documentTypeLabel[document.type]}</td>
              <td>{document.document_number ?? EMPTY}</td>
              <td>{formatDate(document.document_date)}</td>
              <td>{documentStatusLabel[document.status]}</td>
              <td>{formatDate(document.effective_from)}</td>
              <td>{parent ? contractLabel(parent) : EMPTY}</td>
              <td>
                <div className="actions">
                  <a
                    className="button button-outline"
                    href={documentFileUrl(document.id)}
                    download
                    aria-label={`Download: ${document.title}`}
                  >
                    Download
                  </a>
                  {renderActions?.(document)}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
