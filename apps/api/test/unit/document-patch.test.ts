import { patchDocumentSchema } from "@agency/contracts";
import {
  parentRequirement,
  toDocumentUpdate,
} from "../../src/modules/documents/domain/document-rules.js";

const parse = (input: unknown) =>
  toDocumentUpdate(patchDocumentSchema.parse(input));

describe("PATCH → update data", () => {
  it("maps an empty patch to an empty update (no defaults, no resets)", () => {
    expect(parse({})).toEqual({});
  });

  it.each([
    ["title", " Новое ", { title: "Новое" }],
    ["status", "signed", { status: "signed" }],
    ["document_number", "12", { documentNumber: "12" }],
    ["document_number", null, { documentNumber: null }],
    [
      "document_date",
      "2024-02-29",
      { documentDate: new Date("2024-02-29T00:00:00.000Z") },
    ],
    ["document_date", null, { documentDate: null }],
    [
      "effective_from",
      "2026-01-01",
      { effectiveFrom: new Date("2026-01-01T00:00:00.000Z") },
    ],
    ["effective_from", null, { effectiveFrom: null }],
    [
      "parent_document_id",
      "11111111-1111-4111-8111-111111111111",
      { parentDocumentId: "11111111-1111-4111-8111-111111111111" },
    ],
    ["parent_document_id", null, { parentDocumentId: null }],
  ])("maps only %s=%p", (key, value, expected) => {
    expect(parse({ [key]: value })).toEqual(expected);
  });

  it("never emits immutable fields", () => {
    const update = parse({
      title: "x",
      document_number: null,
      document_date: null,
      effective_from: null,
      status: "draft",
      parent_document_id: null,
    });
    for (const key of [
      "type",
      "dealId",
      "fileData",
      "fileName",
      "mimeType",
      "createdAt",
      "id",
    ])
      expect(update).not.toHaveProperty(key);
  });
});

describe("parent policy", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("allows an amendment with or without a parent", () => {
    expect(parentRequirement("amendment", undefined, "x")).toBe("none");
    expect(parentRequirement("amendment", null, "x")).toBe("none");
    expect(parentRequirement("amendment", id, "x")).toBe("lookup");
  });
  it.each(["contract", "listing_sheet", "handover_report", "other"] as const)(
    "rejects a parent on %s",
    (type) => {
      expect(parentRequirement(type, id, "x")).toBe("invalid");
      expect(parentRequirement(type, null, "x")).toBe("none");
    },
  );
  it("rejects a self link", () => {
    expect(parentRequirement("amendment", id, id)).toBe("invalid");
  });
});
