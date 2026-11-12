import type { DocumentMetadata } from "@agency/contracts";
import { Table } from "@agency/ui";
import type { ReactNode } from "react";
import { documentFileUrl } from "@/shared/api";

export const documentTypeLabel: Record<DocumentMetadata["type"], string> = {
  contract: "Договор",
  amendment: "Допсоглашение",
  listing_sheet: "Лист объекта",
  handover_report: "Акт приёма-передачи",
  other: "Другое",
};
export const documentStatusLabel: Record<DocumentMetadata["status"], string> = {
  draft: "Черновик",
  signed: "Подписан",
  unknown: "Не указан",
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
    ? `${document.title} (№ ${document.document_number})`
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
    <Table aria-label="Документы сделки">
      <thead>
        <tr>
          <th scope="col">Название</th>
          <th scope="col">Тип</th>
          <th scope="col">Номер</th>
          <th scope="col">Дата</th>
          <th scope="col">Статус</th>
          <th scope="col">Вступает в силу</th>
          <th scope="col">Связанный договор</th>
          <th scope="col">Действия</th>
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
                    aria-label={`Скачать: ${document.title}`}
                  >
                    Скачать
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
