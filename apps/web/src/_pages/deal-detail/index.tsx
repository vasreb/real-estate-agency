"use client";

import type { DealDetail } from "@agency/contracts";
import { Alert, Button } from "@agency/ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { dealTypeLabel, DealSummary } from "@/entities/deal";
import { DocumentsTable } from "@/entities/document";
import {
  DeleteDocumentButton,
  EditDocumentForm,
  UploadDocumentForm,
} from "@/features/documents";
import { errorMessage, queryKeys, useApiClient } from "@/shared/api";
import { AppHeader } from "@/widgets/app-header";

/**
 * Rendering: dynamic server gate (`app/deals/[id]/page.tsx`) resolves
 * 401/404 before output; this client part refetches and hosts admin forms.
 * Write controls render only for the current role "admin".
 */
export function DealDetailPage({ initialData }: { initialData: DealDetail }) {
  const api = useApiClient();
  const query = useQuery({
    queryKey: queryKeys.deal(initialData.id),
    queryFn: ({ signal }) => api.getDeal(initialData.id, signal),
    initialData,
  });
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const deal = query.data;
  const isAdmin = deal.role === "admin";
  const editing = isAdmin
    ? deal.documents.find((d) => d.id === editingId)
    : undefined;

  return (
    <>
      <AppHeader />
      <main id="main" className="page">
        <p>
          <Link href="/deals">← Back to deals</Link>
        </p>
        <h1>
          Deal No. {deal.number} · {dealTypeLabel[deal.type]}
        </h1>
        <DealSummary deal={deal} />
        {query.isError && <Alert>{errorMessage(query.error)}</Alert>}
        <section aria-labelledby="documents-heading">
          <div className="section-header">
            <h2 id="documents-heading">Documents</h2>
            {isAdmin && !uploading && (
              <Button onClick={() => setUploading(true)}>Upload</Button>
            )}
          </div>
          {isAdmin && uploading && (
            <UploadDocumentForm
              dealId={deal.id}
              documents={deal.documents}
              onDone={() => setUploading(false)}
              onCancel={() => setUploading(false)}
            />
          )}
          {editing && (
            <EditDocumentForm
              key={editing.id}
              dealId={deal.id}
              document={editing}
              documents={deal.documents}
              onDone={() => setEditingId(null)}
              onCancel={() => setEditingId(null)}
            />
          )}
          {deal.documents.length === 0 ? (
            <p className="empty">No documents yet</p>
          ) : (
            <DocumentsTable
              documents={deal.documents}
              renderActions={
                isAdmin
                  ? (document) => (
                      <>
                        <Button
                          variant="outline"
                          aria-label={`Edit: ${document.title}`}
                          onClick={() => setEditingId(document.id)}
                        >
                          Edit
                        </Button>
                        <DeleteDocumentButton
                          dealId={deal.id}
                          document={document}
                        />
                      </>
                    )
                  : undefined
              }
            />
          )}
        </section>
      </main>
    </>
  );
}
