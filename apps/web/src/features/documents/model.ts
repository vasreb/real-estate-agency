import {
  documentStatusSchema,
  documentTypeSchema,
  MAX_FILE_BYTES,
  type DocumentMetadata,
  type PatchDocumentInput,
} from "@agency/contracts";
import { z } from "zod";
import type { UploadInput } from "@/shared/api";

const optionalText = z.string().trim().max(255, "Не более 255 символов");
const optionalDate = z.union([z.literal(""), z.iso.date("Некорректная дата")]);

/** Form-level schema: inputs are strings; "" means "not set". */
export const documentFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Укажите название")
    .max(255, "Не более 255 символов"),
  type: documentTypeSchema,
  document_number: optionalText,
  document_date: optionalDate,
  effective_from: optionalDate,
  status: documentStatusSchema,
  parent_document_id: z.string(),
});
export type DocumentFormValues = z.input<typeof documentFormSchema>;
export type DocumentFormOutput = z.output<typeof documentFormSchema>;

export const emptyUploadValues: DocumentFormValues = {
  title: "",
  type: "contract",
  document_number: "",
  document_date: "",
  effective_from: "",
  status: "unknown",
  parent_document_id: "",
};

export function valuesFromDocument(
  document: DocumentMetadata,
): DocumentFormValues {
  return {
    title: document.title,
    type: document.type,
    document_number: document.document_number ?? "",
    document_date: document.document_date ?? "",
    effective_from: document.effective_from ?? "",
    status: document.status,
    parent_document_id: document.parent_document_id ?? "",
  };
}

export const MAX_FILE_LABEL = "25 МБ";
const ACCEPTED_EXTENSIONS = /\.(pdf|docx)$/i;

/** Client precheck only; the server validates size and content regardless. */
export function fileProblem(file: File | null | undefined): string | null {
  if (!file) return "Выберите файл";
  if (file.size > MAX_FILE_BYTES)
    return `Файл больше ${MAX_FILE_LABEL} (${MAX_FILE_BYTES.toLocaleString("ru-RU")} байт)`;
  if (!ACCEPTED_EXTENSIONS.test(file.name))
    return "Допускаются только файлы PDF и DOCX";
  return null;
}

export function toUploadInput(values: DocumentFormOutput): UploadInput {
  const input: UploadInput = {
    title: values.title,
    type: values.type,
    status: values.status,
  };
  if (values.document_number) input.document_number = values.document_number;
  if (values.document_date) input.document_date = values.document_date;
  if (values.effective_from) input.effective_from = values.effective_from;
  if (values.type === "amendment" && values.parent_document_id)
    input.parent_document_id = values.parent_document_id;
  return input;
}

/** Only changed fields; a cleared optional field becomes null; type is never sent. */
export function toPatch(
  original: DocumentMetadata,
  values: DocumentFormOutput,
): PatchDocumentInput {
  const patch: PatchDocumentInput = {};
  if (values.title !== original.title) patch.title = values.title;
  if (values.status !== original.status) patch.status = values.status;
  const optional = (value: string) => (value === "" ? null : value);
  const number = optional(values.document_number);
  if (number !== original.document_number) patch.document_number = number;
  const date = optional(values.document_date);
  if (date !== original.document_date) patch.document_date = date;
  const effective = optional(values.effective_from);
  if (effective !== original.effective_from) patch.effective_from = effective;
  if (original.type === "amendment") {
    const parent = optional(values.parent_document_id);
    if (parent !== original.parent_document_id)
      patch.parent_document_id = parent;
  }
  return patch;
}

/** Contracts of this deal that an amendment may reference. */
export function contractChoices(
  documents: DocumentMetadata[],
  excludeId?: string,
) {
  return documents.filter((d) => d.type === "contract" && d.id !== excludeId);
}
