"use client";

import type { DocumentMetadata } from "@agency/contracts";
import { Input, Select } from "@agency/ui";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import {
  contractLabel,
  documentStatusLabel,
  documentTypeLabel,
} from "@/entities/document";
import type { DocumentFormValues } from "./model";

type Props = {
  idPrefix: string;
  register: UseFormRegister<DocumentFormValues>;
  errors: FieldErrors<DocumentFormValues>;
  type: DocumentMetadata["type"];
  typeEditable: boolean;
  contracts: DocumentMetadata[];
};

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="field-error">
      {message}
    </p>
  ) : null;
}

export function DocumentFields({
  idPrefix,
  register,
  errors,
  type,
  typeEditable,
  contracts,
}: Props) {
  const id = (name: string) => `${idPrefix}-${name}`;
  const described = (name: keyof DocumentFormValues) =>
    errors[name]
      ? {
          "aria-invalid": "true" as const,
          "aria-describedby": id(`${name}-error`),
        }
      : { "aria-invalid": "false" as const };
  return (
    <>
      <div className="field">
        <label htmlFor={id("title")}>Title</label>
        <Input
          id={id("title")}
          {...described("title")}
          {...register("title")}
        />
        <FieldError id={id("title-error")} message={errors.title?.message} />
      </div>
      <div className="field">
        <label htmlFor={id("type")}>Type</label>
        {typeEditable ? (
          <Select id={id("type")} {...register("type")}>
            {Object.entries(documentTypeLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        ) : (
          <Input id={id("type")} value={documentTypeLabel[type]} readOnly />
        )}
      </div>
      <div className="field">
        <label htmlFor={id("number")}>Number</label>
        <Input
          id={id("number")}
          {...described("document_number")}
          {...register("document_number")}
        />
        <FieldError
          id={id("document_number-error")}
          message={errors.document_number?.message}
        />
      </div>
      <div className="field">
        <label htmlFor={id("date")}>Document date</label>
        <Input
          id={id("date")}
          type="date"
          {...described("document_date")}
          {...register("document_date")}
        />
        <FieldError
          id={id("document_date-error")}
          message={errors.document_date?.message}
        />
      </div>
      <div className="field">
        <label htmlFor={id("effective")}>Effective date</label>
        <Input
          id={id("effective")}
          type="date"
          {...described("effective_from")}
          {...register("effective_from")}
        />
        <FieldError
          id={id("effective_from-error")}
          message={errors.effective_from?.message}
        />
      </div>
      <div className="field">
        <label htmlFor={id("status")}>Status</label>
        <Select id={id("status")} {...register("status")}>
          {Object.entries(documentStatusLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      {type === "amendment" && (
        <div className="field">
          <label htmlFor={id("parent")}>Related contract</label>
          <Select id={id("parent")} {...register("parent_document_id")}>
            <option value="">Not selected</option>
            {contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contractLabel(contract)}
              </option>
            ))}
          </Select>
        </div>
      )}
    </>
  );
}
