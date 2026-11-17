"use client";

import type { DocumentMetadata } from "@agency/contracts";
import { Alert, Button } from "@agency/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { errorMessage, useApiClient } from "@/shared/api";
import { DocumentFields } from "./document-fields";
import {
  contractChoices,
  documentFormSchema,
  toPatch,
  valuesFromDocument,
  type DocumentFormOutput,
  type DocumentFormValues,
} from "./model";
import { useDocumentMutation } from "./use-document-mutation";

/** Metadata only: type is read-only and the file cannot be replaced. */
export function EditDocumentForm({
  dealId,
  document,
  documents,
  onDone,
  onCancel,
}: {
  dealId: string;
  document: DocumentMetadata;
  documents: DocumentMetadata[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const api = useApiClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DocumentFormValues, unknown, DocumentFormOutput>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: valuesFromDocument(document),
  });
  const mutation = useDocumentMutation(
    dealId,
    (values: DocumentFormOutput) =>
      api.patchDocument(document.id, toPatch(document, values)),
    () => onDone(),
  );

  const onSubmit = handleSubmit((values) => {
    if (!mutation.isPending) mutation.mutate(values);
  });

  return (
    <form
      className="form panel"
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      aria-label={`Editing: ${document.title}`}
    >
      <h3>Edit document</h3>
      {mutation.isError && <Alert>{errorMessage(mutation.error)}</Alert>}
      <DocumentFields
        idPrefix={`edit-${document.id}`}
        register={register}
        errors={errors}
        type={document.type}
        typeEditable={false}
        contracts={contractChoices(documents, document.id)}
      />
      <div className="actions">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={mutation.isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
