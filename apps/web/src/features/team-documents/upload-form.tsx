"use client";

import { Alert, Button, Input, Select } from "@agency/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { documentStatusLabel } from "@/entities/document";
import { errorMessage, useApiClient } from "@/shared/api";
import {
  emptyTeamDocumentValues,
  fileProblem,
  teamDocumentFormSchema,
  teamTypeLabel,
  toTeamUploadInput,
  type TeamDocumentFormOutput,
  type TeamDocumentFormValues,
} from "./model";
import { useTeamDocumentMutation } from "./use-team-document-mutation";

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="field-error">
      {message}
    </p>
  ) : null;
}

export function UploadTeamDocumentForm({
  teamId,
  onDone,
}: {
  teamId: string;
  onDone: () => void;
}) {
  const api = useApiClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TeamDocumentFormValues, unknown, TeamDocumentFormOutput>({
    resolver: zodResolver(teamDocumentFormSchema),
    defaultValues: emptyTeamDocumentValues,
  });
  const mutation = useTeamDocumentMutation(
    teamId,
    (values: TeamDocumentFormOutput) =>
      api.uploadTeamDocument(teamId, toTeamUploadInput(values), file!),
    () => {
      reset(emptyTeamDocumentValues);
      setFile(null);
      onDone();
    },
  );
  const onSubmit = handleSubmit(
    (values) => {
      const problem = fileProblem(file);
      setFileError(problem);
      if (problem || mutation.isPending) return;
      mutation.mutate(values);
    },
    // Field errors and the missing file are reported together.
    () => setFileError(fileProblem(file)),
  );
  return (
    <form
      className="form panel"
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      aria-label="Upload to the team collection"
    >
      <h3>Upload to the team collection</h3>
      {mutation.isError && <Alert>{errorMessage(mutation.error)}</Alert>}
      <div className="field">
        <label htmlFor="team-upload-file">
          File (PDF or DOCX, up to 25 MB)
        </label>
        <Input
          id="team-upload-file"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          aria-invalid={fileError ? "true" : "false"}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setFileError(null);
          }}
        />
        <FieldError
          id="team-upload-file-error"
          message={fileError ?? undefined}
        />
      </div>
      <div className="field">
        <label htmlFor="team-upload-title">Title</label>
        <Input id="team-upload-title" {...register("title")} />
        <FieldError
          id="team-upload-title-error"
          message={errors.title?.message}
        />
      </div>
      <div className="field">
        <label htmlFor="team-upload-type">Type</label>
        <Select id="team-upload-type" {...register("type")}>
          {Object.entries(teamTypeLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div className="field">
        <label htmlFor="team-upload-number">Number</label>
        <Input id="team-upload-number" {...register("document_number")} />
        <FieldError
          id="team-upload-number-error"
          message={errors.document_number?.message}
        />
      </div>
      <div className="field">
        <label htmlFor="team-upload-date">Date</label>
        <Input
          id="team-upload-date"
          type="date"
          {...register("document_date")}
        />
        <FieldError
          id="team-upload-date-error"
          message={errors.document_date?.message}
        />
      </div>
      <div className="field">
        <label htmlFor="team-upload-status">Status</label>
        <Select id="team-upload-status" {...register("status")}>
          {Object.entries(documentStatusLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div className="actions">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Uploading…" : "Upload"}
        </Button>
      </div>
    </form>
  );
}
