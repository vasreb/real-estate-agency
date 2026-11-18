import {
  documentStatusSchema,
  MAX_FILE_BYTES,
  teamDocumentTypeSchema,
  type ProcessingStatus,
} from "@agency/contracts";
import { z } from "zod";
import type { TeamUploadInput } from "@/shared/api";

const optionalText = z.string().trim().max(255, "Maximum 255 characters");
const optionalDate = z.union([z.literal(""), z.iso.date("Invalid date")]);

export const teamDocumentFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Enter a title")
    .max(255, "Maximum 255 characters"),
  type: teamDocumentTypeSchema,
  document_number: optionalText,
  document_date: optionalDate,
  status: documentStatusSchema,
});
export type TeamDocumentFormValues = z.input<typeof teamDocumentFormSchema>;
export type TeamDocumentFormOutput = z.output<typeof teamDocumentFormSchema>;

export const emptyTeamDocumentValues: TeamDocumentFormValues = {
  title: "",
  type: "other",
  document_number: "",
  document_date: "",
  status: "unknown",
};

export const teamTypeLabel: Record<
  z.infer<typeof teamDocumentTypeSchema>,
  string
> = {
  listing_sheet: "Property sheet",
  handover_report: "Handover report",
  other: "Report or other material",
};

export const processingLabel: Record<ProcessingStatus, string> = {
  pending: "Waiting",
  processing: "Processing",
  indexed: "Indexed",
  failed: "Failed",
};

const ACCEPTED_EXTENSIONS = /\.(pdf|docx)$/i;

/** Client precheck only; the server validates size and content regardless. */
export function fileProblem(file: File | null | undefined): string | null {
  if (!file) return "Select a file";
  if (file.size > MAX_FILE_BYTES) return "File is larger than 25 MB";
  if (!ACCEPTED_EXTENSIONS.test(file.name))
    return "Only PDF and DOCX files are allowed";
  return null;
}

export function toTeamUploadInput(
  values: TeamDocumentFormOutput,
): TeamUploadInput {
  const input: TeamUploadInput = {
    title: values.title,
    type: values.type,
    status: values.status,
  };
  if (values.document_number) input.document_number = values.document_number;
  if (values.document_date) input.document_date = values.document_date;
  return input;
}

/** Keep polling while any document is still being processed. */
export function needsPolling(
  documents: { processing_status: ProcessingStatus }[] | undefined,
): boolean {
  return (documents ?? []).some(
    (document) =>
      document.processing_status === "pending" ||
      document.processing_status === "processing",
  );
}
