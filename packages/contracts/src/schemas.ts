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
export const processingStatusSchema = z.enum([
  "pending",
  "processing",
  "indexed",
  "failed",
]);
/** Types allowed for team-collection documents (shared material, ADR-0007). */
export const teamDocumentTypeSchema = z.enum([
  "listing_sheet",
  "handover_report",
  "other",
]);
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
export const createTeamDocumentSchema = z.strictObject({
  title: titleSchema,
  type: teamDocumentTypeSchema,
  document_number: numberSchema.optional(),
  document_date: dateSchema.optional(),
  effective_from: dateSchema.optional(),
  status: documentStatusSchema.default("unknown"),
});
/** Admin view of any team document (its own collection or one of its deals). */
export const teamDocumentSchema = z.strictObject({
  id: uuidSchema,
  team_id: uuidSchema,
  deal_id: uuidSchema.nullable(),
  type: documentTypeSchema,
  title: titleSchema,
  document_number: numberSchema.nullable(),
  document_date: dateSchema.nullable(),
  effective_from: dateSchema.nullable(),
  status: documentStatusSchema,
  file_name: z.string(),
  mime_type: documentMetadataSchema.shape.mime_type,
  processing_status: processingStatusSchema,
  indexed_at: z.iso.datetime({ offset: true }).nullable(),
  processing_error: z.string().nullable(),
  created_at: z.iso.datetime({ offset: true }),
});
export const teamDocumentListSchema = z.strictObject({
  items: z.array(teamDocumentSchema),
});
export const teamListSchema = z.strictObject({
  items: z.array(
    z.strictObject({ id: uuidSchema, name: z.string(), role: roleSchema }),
  ),
});
const chatTextSchema = z.string().trim().min(1);
export const chatRequestSchema = z.strictObject({
  team_id: uuidSchema,
  message: chatTextSchema.max(4000),
  /** Plain text of earlier turns only; tool results are never accepted. */
  history: z
    .array(
      z.strictObject({
        role: z.enum(["user", "assistant"]),
        content: chatTextSchema.max(8000),
      }),
    )
    .max(20)
    .default([]),
  /** IDs surfaced in earlier turns; access is re-checked on every use. */
  state: z
    .strictObject({
      deal_ids: z.array(uuidSchema).max(20).default([]),
      document_ids: z.array(uuidSchema).max(20).default([]),
    })
    .default({ deal_ids: [], document_ids: [] }),
});
export const chatCitationSchema = z.strictObject({
  id: z.number().int().min(1),
  document_id: uuidSchema,
  title: z.string(),
  page_start: z.number().int().min(1),
  page_end: z.number().int().min(1),
  quote: z.string(),
  preview_url: z.string(),
});
export const chatResponseSchema = z.strictObject({
  /** Answer text in order; each part lists the citations that support it. */
  answer: z.array(
    z.strictObject({
      text: z.string(),
      citations: z.array(z.number().int().min(1)),
    }),
  ),
  citations: z.array(chatCitationSchema),
  state: chatRequestSchema.shape.state,
  usage: z.strictObject({
    model: z.string(),
    model_calls: z.number().int().min(0),
    input_tokens: z.number().int().min(0),
    output_tokens: z.number().int().min(0),
    cache_read_tokens: z.number().int().min(0),
    cache_creation_tokens: z.number().int().min(0),
    latency_ms: z.number().int().min(0),
    stopped_by_budget: z.boolean(),
  }),
});
/**
 * One line of the streamed answer (POST /api/chat/stream, NDJSON). Access and
 * rate checks finish before the first line; later failures arrive as `error`.
 * `delta` text is provisional: `reset` discards it, and `final` carries the
 * authoritative answer with its citations.
 */
export const chatStreamEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("status"),
    stage: z.enum(["working", "searching"]),
  }),
  z.strictObject({ type: z.literal("delta"), text: z.string() }),
  z.strictObject({ type: z.literal("reset") }),
  z.strictObject({ type: z.literal("final"), response: chatResponseSchema }),
  z.strictObject({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
  }),
]);
export const dealListItemSchema = z.strictObject({
  id: uuidSchema,
  number: z.string(),
  type: dealTypeSchema,
  client_name: z.string(),
  property_address: z.string(),
  team_id: uuidSchema,
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
export type CreateTeamDocumentInput = z.infer<typeof createTeamDocumentSchema>;
export type TeamDocument = z.infer<typeof teamDocumentSchema>;
export type TeamDocumentList = z.infer<typeof teamDocumentListSchema>;
export type TeamList = z.infer<typeof teamListSchema>;
export type ProcessingStatus = z.infer<typeof processingStatusSchema>;
export type ChatRequest = z.input<typeof chatRequestSchema>;
export type ChatInput = z.infer<typeof chatRequestSchema>;
export type ChatCitation = z.infer<typeof chatCitationSchema>;
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type DealListItem = z.infer<typeof dealListItemSchema>;
export type DealList = z.infer<typeof dealListSchema>;
export type DealDetail = z.infer<typeof dealDetailSchema>;
export type Role = z.infer<typeof roleSchema>;
export type DealScope = { id: string; team_id: string; role: Role };
export type TeamScope = { team_id: string; role: Role };
