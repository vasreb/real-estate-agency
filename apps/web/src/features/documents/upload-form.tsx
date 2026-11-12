"use client";

import type { DocumentMetadata } from "@agency/contracts";
import { Alert, Button, Input } from "@agency/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { errorMessage, useApiClient } from "@/shared/api";
import { DocumentFields } from "./document-fields";
import {
  contractChoices,
  documentFormSchema,
  emptyUploadValues,
  fileProblem,
  MAX_FILE_LABEL,
  toUploadInput,
  type DocumentFormOutput,
  type DocumentFormValues,
} from "./model";
import { useDocumentMutation } from "./use-document-mutation";

export function UploadDocumentForm({
  dealId,
  documents,
  onDone,
  onCancel,
}: {
  dealId: string;
  documents: DocumentMetadata[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const api = useApiClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<DocumentFormValues, unknown, DocumentFormOutput>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: emptyUploadValues,
  });
  const type = useWatch({ control, name: "type" });
  const mutation = useDocumentMutation(
    dealId,
    (values: DocumentFormOutput) =>
      api.uploadDocument(dealId, toUploadInput(values), file!),
    () => onDone(),
  );

  const onSubmit = handleSubmit((values) => {
    const problem = fileProblem(file);
    setFileError(problem);
    if (problem || mutation.isPending) return;
    mutation.mutate(values);
  });

  return (
    <form
      className="form panel"
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      aria-label="Загрузка документа"
    >
      <h3>Загрузить документ</h3>
      {mutation.isError && <Alert>{errorMessage(mutation.error)}</Alert>}
      <div className="field">
        <label htmlFor="upload-file">
          Файл (PDF или DOCX, до {MAX_FILE_LABEL})
        </label>
        <Input
          id="upload-file"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          aria-invalid={fileError ? "true" : "false"}
          aria-describedby={fileError ? "upload-file-error" : undefined}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setFileError(null);
          }}
        />
        {fileError && (
          <p id="upload-file-error" className="field-error">
            {fileError}
          </p>
        )}
      </div>
      <DocumentFields
        idPrefix="upload"
        register={register}
        errors={errors}
        type={type}
        typeEditable
        contracts={contractChoices(documents)}
      />
      <div className="actions">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Загрузка…" : "Загрузить"}
        </Button>
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={mutation.isPending}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}
