"use client";

import type { TeamDocument } from "@agency/contracts";
import { Alert, Button, Dialog, Table } from "@agency/ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { documentStatusLabel, documentTypeLabel } from "@/entities/document";
import {
  documentFileUrl,
  documentPreviewUrl,
  errorMessage,
  queryKeys,
  useApiClient,
} from "@/shared/api";
import { needsPolling, processingLabel } from "./model";
import { UploadTeamDocumentForm } from "./upload-form";
import { useTeamDocumentMutation } from "./use-team-document-mutation";

const POLL_MS = 5000;

function ReindexButton({
  teamId,
  document,
}: {
  teamId: string;
  document: TeamDocument;
}) {
  const api = useApiClient();
  const mutation = useTeamDocumentMutation(teamId, () =>
    api.reindexDocument(document.id),
  );
  const busy =
    mutation.isPending ||
    document.processing_status === "pending" ||
    document.processing_status === "processing";
  return (
    <>
      <Button
        variant="outline"
        disabled={busy}
        aria-label={`Reindex: ${document.title}`}
        onClick={() => mutation.mutate(undefined)}
      >
        Reindex
      </Button>
      {mutation.isError && <Alert>{errorMessage(mutation.error)}</Alert>}
    </>
  );
}

function DeleteButton({
  teamId,
  document,
}: {
  teamId: string;
  document: TeamDocument;
}) {
  const api = useApiClient();
  const [open, setOpen] = useState(false);
  const mutation = useTeamDocumentMutation(
    teamId,
    () => api.deleteDocument(document.id),
    () => setOpen(false),
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!mutation.isPending) {
          setOpen(next);
          if (!next) mutation.reset();
        }
      }}
      trigger={
        <Button variant="danger" aria-label={`Delete: ${document.title}`}>
          Delete
        </Button>
      }
      title="Delete document?"
      description={`Document "${document.title}", its file and its search data will be permanently deleted and cannot be restored.`}
    >
      {mutation.isError && <Alert>{errorMessage(mutation.error)}</Alert>}
      <div className="actions">
        <Button
          variant="danger"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(undefined)}
        >
          {mutation.isPending ? "Deleting…" : "Delete document"}
        </Button>
      </div>
    </Dialog>
  );
}

function Status({ document }: { document: TeamDocument }) {
  return (
    <>
      <span data-status={document.processing_status}>
        {processingLabel[document.processing_status]}
      </span>
      {document.processing_status === "failed" && document.processing_error && (
        <p className="field-error wrap-anywhere">{document.processing_error}</p>
      )}
    </>
  );
}

/** Documents of one team with their indexing status; admin only. */
export function TeamDocumentsPanel({ teamId }: { teamId: string }) {
  const api = useApiClient();
  const [showUpload, setShowUpload] = useState(false);
  const query = useQuery({
    queryKey: queryKeys.teamDocuments(teamId),
    queryFn: ({ signal }) => api.listTeamDocuments(teamId, signal),
    refetchInterval: (state) =>
      needsPolling(state.state.data?.items) ? POLL_MS : false,
  });
  return (
    <section aria-label="Team documents">
      <div className="section-header">
        <h2>Documents</h2>
        <Button onClick={() => setShowUpload((open) => !open)}>
          {showUpload ? "Close upload" : "Upload"}
        </Button>
      </div>
      {showUpload && (
        <UploadTeamDocumentForm
          teamId={teamId}
          onDone={() => setShowUpload(false)}
        />
      )}
      {query.isError ? (
        <Alert>
          {errorMessage(query.error)}{" "}
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </Alert>
      ) : !query.data ? (
        <p className="muted" role="status">
          Loading…
        </p>
      ) : query.data.items.length === 0 ? (
        <p className="empty">No documents</p>
      ) : (
        <Table aria-label="Team documents">
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Type</th>
              <th scope="col">Belongs to</th>
              <th scope="col">Signing</th>
              <th scope="col">Search index</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {query.data.items.map((document) => (
              <tr key={document.id}>
                <td className="wrap-anywhere">{document.title}</td>
                <td>{documentTypeLabel[document.type]}</td>
                <td>
                  {document.deal_id ? (
                    <Link href={`/deals/${document.deal_id}`}>Deal</Link>
                  ) : (
                    "Team collection"
                  )}
                </td>
                <td>{documentStatusLabel[document.status]}</td>
                <td>
                  <Status document={document} />
                </td>
                <td>
                  <div className="actions">
                    <a
                      href={documentPreviewUrl(document.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View
                    </a>
                    <a href={documentFileUrl(document.id)}>Download</a>
                    <ReindexButton teamId={teamId} document={document} />
                    <DeleteButton teamId={teamId} document={document} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}
