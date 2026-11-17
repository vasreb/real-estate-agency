import { createHash } from "node:crypto";
import { z } from "zod";
import {
  dealTypeSchema,
  documentMetadataSchema,
  roleSchema,
  uuidSchema,
  type DocumentMetadata,
} from "@agency/contracts";
import { assertPortablePath, limits } from "./policy.js";

export const corpus = Object.freeze({
  corpus_version: 1,
  seed: "northbridge-vale-archive-v1",
  as_of: "2026-11-12",
  agency: "Northbridge & Vale Residential",
  jurisdiction: "England",
  notice: "Synthetic demonstration document - not for execution",
  counts: Object.freeze({
    teams: 3,
    users: 10,
    team_members: 13,
    clients: 80,
    properties: 96,
    deals: 120,
    documents: 2400,
    pdf: 2160,
    docx: 240,
    amendments: 240,
  }),
});

export function stableJson(value: unknown): string {
  const order = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(order)
      : item && typeof item === "object"
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([key, value]) => [key, order(value)]),
          )
        : item;
  return JSON.stringify(order(value), null, 2) + "\n";
}

// RFC 4122 UUIDv5: namespace is stable and public, not a credential.
const namespace = Buffer.from("55d88e50b71d5bfa966b0ed82e9d2ace", "hex");
export function stableId(key: string): string {
  if (!/^[a-z0-9][a-z0-9/-]*$/.test(key))
    throw new Error("Invalid stable entity key.");
  const digest = createHash("sha1")
    .update(namespace)
    .update(`${corpus.seed}/${key}`, "utf8")
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = digest.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const text = z.string().trim().min(1);
const key = z.string().regex(/^[a-z0-9][a-z0-9/-]*$/);
export const entitiesSchema = z.strictObject({
  teams: z.array(z.strictObject({ id: uuidSchema, name: text })),
  users: z.array(
    z.strictObject({
      id: uuidSchema,
      email: z
        .email()
        .max(254)
        .regex(/^[a-z0-9.-]+@northbridge-vale\.example$/),
    }),
  ),
  team_members: z.array(
    z.strictObject({
      team_id: uuidSchema,
      user_id: uuidSchema,
      role: roleSchema,
    }),
  ),
  clients: z.array(z.strictObject({ id: uuidSchema, name: text })),
  properties: z.array(z.strictObject({ id: uuidSchema, address: text })),
  deals: z.array(
    z.strictObject({
      id: uuidSchema,
      number: text,
      type: dealTypeSchema,
      client_id: uuidSchema,
      property_id: uuidSchema,
      team_id: uuidSchema,
    }),
  ),
});
export type PublicEntities = z.infer<typeof entitiesSchema>;

export const documentRecordSchema = z.strictObject({
  mapped: documentMetadataSchema,
  key,
  family: z
    .string()
    .regex(/^(S(?:0[1-9]|1[0-6])|R(?:0[1-9]|1[0-9]|2[0-4])|C0[1-8])$/),
  instrument_key: key,
  event_key: key,
  purpose: text,
  author_role: text,
  recipient_actor_keys: z.array(key).min(1),
  path: z.string().superRefine((value, ctx) => {
    try {
      assertPortablePath(value);
    } catch {
      ctx.addIssue({ code: "custom", message: "Unsafe document path" });
    }
    if (!value.startsWith("documents/"))
      ctx.addIssue({
        code: "custom",
        message: "Original must be under documents/",
      });
  }),
  byte_length: z.number().int().positive().lt(limits.original_bytes_exclusive),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  unresolved_parent_reason: text.nullable(),
  revises_instrument_key: key.nullable(),
  provenance: z.strictObject({
    classification: z.enum([
      "original-synthetic",
      "synthetic-third-party-copy",
      "synthetic-historical-copy",
    ]),
    source_keys: z.array(z.string().regex(/^EXT-(?:[1-9]|1[0-4])$/)),
  }),
});
export type DocumentRecord = z.infer<typeof documentRecordSchema>;

/** Strict validation, not spread/cast: profiles cannot silently become DB fields. */
export function projectDocumentMetadata(value: unknown): DocumentMetadata {
  return documentMetadataSchema.parse(documentRecordSchema.parse(value).mapped);
}

export type ContentBlock =
  | { kind: "heading"; level: 1 | 2; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "table"; columns: string[]; rows: string[][] }
  | {
      kind: "execution";
      signatories: { actor_key: string; name: string; capacity: string }[];
      state: "simulated-signed" | "draft" | "unknown";
    }
  | { kind: "page-break" };
export type AuthoredDocument = {
  key: string;
  title: string;
  issuer: "agency" | "surveyor" | "contractor" | "conveyancer";
  blocks: ContentBlock[];
};
// Authoring-only: never passed to Prisma or included inside a mapped record.
export type Actor = {
  key: string;
  name: string;
  role:
    | "principal"
    | "co-owner"
    | "buyer"
    | "tenant"
    | "guarantor"
    | "representative"
    | "agency";
  email: string;
  signatory_keys: string[];
};
export type PropertyProfile = {
  key: string;
  property_id: string;
  tenure: "leasehold" | "freehold";
  share_of_freehold: boolean;
  bedrooms: number;
  bathrooms: number;
  area_m2: number;
  heating: "electric" | "gas";
  rooms: {
    key: string;
    name: string;
    length_m: number;
    width_m: number;
    items: {
      key: string;
      description: string;
      quantity: number;
      age_months: number;
      condition: string;
    }[];
  }[];
};
