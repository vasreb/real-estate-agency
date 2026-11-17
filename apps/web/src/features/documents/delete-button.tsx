"use client";

import type { DocumentMetadata } from "@agency/contracts";
import { Alert, Button, Dialog } from "@agency/ui";
import { useState } from "react";
import { errorMessage, useApiClient } from "@/shared/api";
import { useDocumentMutation } from "./use-document-mutation";

/** Deletion needs explicit confirmation; cancelling sends no request. */
export function DeleteDocumentButton({
  dealId,
  document,
}: {
  dealId: string;
  document: DocumentMetadata;
}) {
  const api = useApiClient();
  const [open, setOpen] = useState(false);
  const mutation = useDocumentMutation(
    dealId,
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
      description={`Document «${document.title}» and its file will be permanently deleted and cannot be restored.`}
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
