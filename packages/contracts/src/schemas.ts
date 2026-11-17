import { z } from "zod";

export const uuidSchema = z.uuid();
export const dateSchema = z.iso.date();
export const roleSchema = z.enum(["member", "admin"]);
export const dealTypeSchema = z.enum(["sale", "rental"]);
export const documentTypeSchema = z.enum([
  "contract",
  "amendment",
  "listing_sheet",
  "handover_report",
  "other",
]);
export const documentStatusSchema = z.enum(["draft", "signed", "unknown"]);
const titleSchema = z.string().trim().min(1).max(255);
// Empty optional values are rejected; clients clear an optional field with null.
const numberSchema = z.string().trim().min(1).max(255);
export const loginSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z
    .string()
    .min(1)
    .max(1024)
    .refine(
      (value) => new TextEncoder().encode(value).byteLength <= 1024,
      "Password must not exceed 1024 bytes",
    ),
});
export const createDocumentSchema = z.strictObject({
  title: titleSchema,
  type: documentTypeSchema,
  document_number: numberSchema.optional(),
  document_date: dateSchema.optional(),
  effective_from: dateSchema.optional(),
  status: documentStatusSchema.default("unknown"),
  parent_document_id: uuidSchema.optional(),
});
// Deliberately not derived from create: PATCH must never add defaults.
export const patchDocumentSchema = z.strictObject({
  title: titleSchema.optional(),
  document_number: numberSchema.nullable().optional(),
  document_date: dateSchema.nullable().optional(),
  effective_from: dateSchema.nullable().optional(),
  status: documentStatusSchema.optional(),
  parent_document_id: uuidSchema.nullable().optional(),
});
export const documentMetadataSchema = z.strictObject({
  id: uuidSchema,
  deal_id: uuidSchema,
  parent_document_id: uuidSchema.nullable(),
  type: documentTypeSchema,
  title: titleSchema,
  document_number: numberSchema.nullable(),
  document_date: dateSchema.nullable(),
  effective_from: dateSchema.nullable(),
  status: documentStatusSchema,
  file_name: z.string(),
  mime_type: z.enum([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]),
  created_at: z.iso.datetime({ offset: true }),
});
export const dealListItemSchema = z.strictObject({
  id: uuidSchema,
  number: z.string(),
  type: dealTypeSchema,
  client_name: z.string(),
  property_address: z.string(),
  team_name: z.string(),
});
export const dealListSchema = z.strictObject({
  items: z.array(dealListItemSchema),
});
export const dealDetailSchema = z.strictObject({
  id: uuidSchema,
  number: z.string(),
  type: dealTypeSchema,
  client: z.strictObject({ id: uuidSchema, name: z.string() }),
  property: z.strictObject({ id: uuidSchema, address: z.string() }),
  team: z.strictObject({ id: uuidSchema, name: z.string() }),
  role: roleSchema,
  documents: z.array(documentMetadataSchema),
});
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type PatchDocumentInput = z.infer<typeof patchDocumentSchema>;
export type DocumentMetadata = z.infer<typeof documentMetadataSchema>;
export type DealListItem = z.infer<typeof dealListItemSchema>;
export type DealList = z.infer<typeof dealListSchema>;
export type DealDetail = z.infer<typeof dealDetailSchema>;
export type Role = z.infer<typeof roleSchema>;
export type DealScope = { id: string; team_id: string; role: Role };
