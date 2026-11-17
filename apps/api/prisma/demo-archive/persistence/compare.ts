import { stableJson, type DocumentRecord } from "../model.js";
import { digestBytes } from "../build.js";

export function compareRows<T>(
  expected: readonly T[],
  existing: readonly T[],
  key: (row: T) => string,
  kind: string,
): T[] {
  const lookup = new Map(expected.map((row) => [key(row), row]));
  if (lookup.size !== expected.length)
    throw new Error(`Duplicate expected ${kind} identity.`);
  const found = new Set<string>();
  for (const row of existing) {
    const id = key(row);
    const wanted = lookup.get(id);
    if (!wanted || found.has(id) || stableJson(row) !== stableJson(wanted))
      throw new Error(
        `Import conflict in ${kind}; no repair/deletion authorised.`,
      );
    found.add(id);
  }
  return expected.filter((row) => !found.has(key(row)));
}
export function compareUserIdentities(
  expected: readonly { id: string; email: string }[],
  existing: readonly { id: string; email: string; passwordHash: string }[],
) {
  return compareRows(
    expected,
    existing.map(({ id, email }) => ({ id, email })),
    (row) => row.id,
    "user/email identities",
  );
}
type StoredDocument = {
  id: string;
  dealId: string;
  parentDocumentId: string | null;
  type: string;
  title: string;
  documentNumber: string | null;
  documentDate: Date | null;
  effectiveFrom: Date | null;
  status: string;
  fileName: string;
  mimeType: string;
  createdAt: Date;
};
export function storedMetadata(row: StoredDocument) {
  return {
    id: row.id,
    deal_id: row.dealId,
    parent_document_id: row.parentDocumentId,
    type: row.type,
    title: row.title,
    document_number: row.documentNumber,
    document_date: row.documentDate?.toISOString().slice(0, 10) ?? null,
    effective_from: row.effectiveFrom?.toISOString().slice(0, 10) ?? null,
    status: row.status,
    file_name: row.fileName,
    mime_type: row.mimeType,
    created_at: row.createdAt.toISOString(),
  };
}
export function assertStoredBytes(
  bytes: Uint8Array,
  expected: DocumentRecord,
): void {
  if (
    bytes.length !== expected.byte_length ||
    digestBytes(bytes) !== expected.sha256
  )
    throw new Error(`Import original-byte conflict: ${expected.key}`);
}
export function documentData(row: DocumentRecord, bytes: Uint8Array) {
  assertStoredBytes(bytes, row);
  const m = row.mapped;
  return {
    id: m.id,
    dealId: m.deal_id,
    parentDocumentId: m.parent_document_id,
    type: m.type,
    title: m.title,
    documentNumber: m.document_number,
    documentDate: m.document_date
      ? new Date(`${m.document_date}T00:00:00.000Z`)
      : null,
    effectiveFrom: m.effective_from
      ? new Date(`${m.effective_from}T00:00:00.000Z`)
      : null,
    status: m.status,
    fileName: m.file_name,
    mimeType: m.mime_type,
    createdAt: new Date(m.created_at),
    fileData: Uint8Array.from(bytes),
  };
}
