import { describe, expect, it } from "vitest";
import {
  createDocumentSchema,
  patchDocumentSchema,
  loginSchema,
  documentMetadataSchema,
  dealListSchema,
  dealDetailSchema,
  documentTypeSchema,
  documentStatusSchema,
} from "./schemas.js";
import { operations } from "./operations.js";

const id = "11111111-1111-4111-8111-111111111111";
const metadata = {
  id,
  deal_id: id,
  parent_document_id: null,
  title: "Contract",
  type: "contract",
  document_number: null,
  document_date: "2024-02-29",
  effective_from: null,
  status: "unknown",
  file_name: "Contract.pdf",
  mime_type: "application/pdf",
  created_at: "2026-11-12T00:00:00.000Z",
};
describe("canonical agency schemas", () => {
  it("normalizes only email; preserves password whitespace", () => {
    expect(
      loginSchema.parse({
        email: " PERSON@Example.test ",
        password: " password ",
      }),
    ).toEqual({ email: "person@example.test", password: " password " });
    expect(
      loginSchema.safeParse({
        email: "a@example.test",
        password: "é".repeat(513),
      }).success,
    ).toBe(false);
  });
  it("accepts metadata/list/detail fixtures and excludes original bytes", () => {
    expect(documentMetadataSchema.parse(metadata)).toEqual(metadata);
    expect(
      documentMetadataSchema.safeParse({ ...metadata, file_data: "private" })
        .success,
    ).toBe(false);
    expect(
      dealListSchema.parse({
        items: [
          {
            id,
            number: "1",
            type: "sale",
            client_name: "Client",
            property_address: "Address",
            team_name: "Team",
          },
        ],
      }).items,
    ).toHaveLength(1);
    expect(
      dealDetailSchema.parse({
        id,
        number: "1",
        type: "sale",
        role: "admin",
        client: { id, name: "Client" },
        property: { id, address: "Address" },
        team: { id, name: "Team" },
        documents: [metadata],
      }).documents,
    ).toHaveLength(1);
  });
  it("defaults only create status, trims titles, and permits an unlinked amendment", () => {
    expect(
      createDocumentSchema.parse({ title: "  New  ", type: "amendment" }),
    ).toEqual({ title: "New", type: "amendment", status: "unknown" });
    expect(patchDocumentSchema.parse({})).toEqual({});
    expect(patchDocumentSchema.parse({ title: " New " })).toEqual({
      title: "New",
    });
  });
  it.each([
    "document_number",
    "document_date",
    "effective_from",
    "parent_document_id",
  ])("preserves omission and accepts explicit null for %s", (key) => {
    expect(patchDocumentSchema.parse({})).not.toHaveProperty(key);
    expect(patchDocumentSchema.parse({ [key]: null })).toEqual({ [key]: null });
  });
  it.each([
    { title: null },
    { status: null },
    { title: "  " },
    { title: "x".repeat(256) },
    { document_number: "x".repeat(256) },
    { status: "completed" },
    { document_date: "" },
    { document_date: "2025-02-29" },
    { effective_from: "2026-11-12T00:00:00Z" },
    { parent_document_id: "" },
    { parent_document_id: "not-uuid" },
    { type: "other" },
    { deal_id: id },
    { file_data: "x" },
    { file_name: "x" },
    { created_at: "2026-01-01" },
    { unexpected: true },
  ])("rejects invalid or read-only PATCH fixture %#", (input) => {
    expect(patchDocumentSchema.safeParse(input).success).toBe(false);
  });
  it.each([
    {},
    { title: "Contract" },
    { type: "contract" },
    { title: null, type: "contract" },
    { title: "  ", type: "contract" },
    { title: "Contract", type: "invoice" },
    { title: "Contract", type: "contract", status: null },
    { title: "Contract", type: "contract", document_number: "" },
    { title: "Contract", type: "contract", document_date: "" },
    { title: "Contract", type: "contract", effective_from: "2026-13-01" },
    { title: "Contract", type: "contract", parent_document_id: "" },
    { title: "Contract", type: "contract", deal_id: id },
    { title: "Contract", type: "contract", file: "bytes" },
    { title: "Contract", type: "contract", file_data: "bytes" },
  ])("rejects invalid upload metadata fixture %#", (input) => {
    expect(createDocumentSchema.safeParse(input).success).toBe(false);
  });
  it("rejects empty document numbers in PATCH and trims accepted ones", () => {
    expect(
      patchDocumentSchema.safeParse({ document_number: " " }).success,
    ).toBe(false);
    expect(patchDocumentSchema.parse({ document_number: " 12-A " })).toEqual({
      document_number: "12-A",
    });
  });
  it("keeps an explicit create status and never adds patch defaults", () => {
    expect(
      createDocumentSchema.parse({
        title: "Act",
        type: "handover_report",
        status: "signed",
      }).status,
    ).toBe("signed");
    expect(patchDocumentSchema.parse({ title: "Act" })).not.toHaveProperty(
      "status",
    );
  });
  it("does not invent an ordering between document and effective dates", () => {
    expect(
      patchDocumentSchema.parse({
        document_date: "2026-11-12",
        effective_from: "2020-01-01",
      }).effective_from,
    ).toBe("2020-01-01");
  });
  it("uses exactly the specified enum values and eight operation descriptors", () => {
    expect(documentTypeSchema.options).toEqual([
      "contract",
      "amendment",
      "listing_sheet",
      "handover_report",
      "other",
    ]);
    expect(documentStatusSchema.options).toEqual([
      "draft",
      "signed",
      "unknown",
    ]);
    expect(
      new Set(operations.map((op) => `${op.method} ${op.path}`)).size,
    ).toBe(8);
    expect(operations.filter((op) => op.status === 204)).toHaveLength(3);
    expect(operations.find((op) => op.binary)?.operationId).toBe(
      "downloadDocument",
    );
  });
});
describe("browser-safe contract package", () => {
  it("imports only zod and its own modules from runtime sources", async () => {
    const { readdir, readFile } = await import("node:fs/promises");
    const sourceDir = new URL("./", import.meta.url);
    const files = (await readdir(sourceDir)).filter(
      (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const text = await readFile(new URL(name, sourceDir), "utf8");
      const specifiers = [...text.matchAll(/from\s+"([^"]+)"/g)].map(
        (match) => match[1],
      );
      for (const specifier of specifiers)
        expect(
          specifier === "zod" || specifier?.startsWith("./"),
          `${name} imports ${specifier}`,
        ).toBe(true);
    }
  });
});
