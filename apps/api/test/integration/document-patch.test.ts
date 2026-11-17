import { randomUUID } from "node:crypto";
import { documentMetadataSchema } from "@agency/contracts";
import { createSamplePdf, ids, PDF_MIME } from "../fixtures/index.js";
import {
  accounts,
  createTestApp,
  login,
  openDatabase,
  ORIGIN,
} from "./helpers.js";

const db = openDatabase();
const app = createTestApp(db);
let admin: string;
const pdf = await createSamplePdf("patch test");
const created: string[] = [];

beforeAll(async () => {
  admin = await login(app, accounts.admin);
});
afterAll(async () => {
  await db.document.deleteMany({
    where: { id: { in: created }, parentDocumentId: { not: null } },
  });
  await db.document.deleteMany({ where: { id: { in: created } } });
  await app.close();
  await db.$disconnect();
});

async function seedDocument(data: {
  type: "contract" | "amendment" | "other";
  parentDocumentId?: string;
}) {
  const document = await db.document.create({
    data: {
      dealId: ids.dealNorthRental,
      title: "Original",
      documentNumber: "N-1",
      documentDate: new Date("2026-01-10T00:00:00Z"),
      effectiveFrom: new Date("2026-02-01T00:00:00Z"),
      status: "draft",
      fileName: "orig.pdf",
      mimeType: PDF_MIME,
      fileData: pdf,
      ...data,
    },
    select: { id: true },
  });
  created.push(document.id);
  return document.id;
}

const patch = (
  documentId: string,
  payload: unknown,
  options: { cookie?: string | null; origin?: string | null } = {},
) => {
  const cookie = options.cookie === undefined ? admin : options.cookie;
  return app.inject({
    method: "PATCH",
    url: `/api/documents/${documentId}`,
    headers: {
      ...(options.origin === null ? {} : { origin: options.origin ?? ORIGIN }),
      ...(cookie ? { cookie } : {}),
    },
    payload: payload as Record<string, unknown>,
  });
};

describe("PATCH /api/documents/{documentId}", () => {
  it("updates provided fields, keeps omitted ones, clears nulls, and returns metadata", async () => {
    const id = await seedDocument({ type: "contract" });
    const response = await patch(id, {
      title: " New title ",
      status: "signed",
      document_number: null,
      effective_from: null,
    });
    expect(response.statusCode).toBe(200);
    expect(documentMetadataSchema.parse(response.json())).toMatchObject({
      id,
      title: "New title",
      status: "signed",
      document_number: null,
      document_date: "2026-01-10",
      effective_from: null,
      type: "contract",
      deal_id: ids.dealNorthRental,
    });
    const noop = await patch(id, {});
    expect(noop.statusCode).toBe(200);
    expect(noop.json()).toEqual(response.json());
    const stored = await db.document.findUniqueOrThrow({
      where: { id },
      select: { fileData: true, fileName: true, mimeType: true },
    });
    expect(Buffer.from(stored.fileData).equals(Buffer.from(pdf))).toBe(true);
    expect(stored.fileName).toBe("orig.pdf");
  });

  it("links and unlinks an amendment to a same-deal contract", async () => {
    const contract = await seedDocument({ type: "contract" });
    const amendment = await seedDocument({ type: "amendment" });
    const linked = await patch(amendment, { parent_document_id: contract });
    expect(linked.json()).toMatchObject({ parent_document_id: contract });
    const unlinked = await patch(amendment, { parent_document_id: null });
    expect(unlinked.json()).toMatchObject({ parent_document_id: null });
  });

  it.each([
    { type: "contract" },
    { deal_id: ids.dealNorthSale },
    { file_data: "x" },
    { created_at: "2026-01-01T00:00:00Z" },
    { title: null },
    { status: null },
    { title: "  " },
    { status: "archived" },
    { document_date: "" },
    { document_date: "2026-02-30" },
    { parent_document_id: "" },
    { unknown: 1 },
  ])(
    "rejects invalid or read-only body %o with 400 and changes nothing",
    async (body) => {
      const id = await seedDocument({ type: "contract" });
      const before = await db.document.findUniqueOrThrow({ where: { id } });
      const response = await patch(id, body);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
      expect(await db.document.findUniqueOrThrow({ where: { id } })).toEqual(
        before,
      );
    },
  );

  it("rejects a wrong-deal or self relink with 400 and keeps the previous parent", async () => {
    const contract = await seedDocument({ type: "contract" });
    const amendment = await seedDocument({
      type: "amendment",
      parentDocumentId: contract,
    });
    for (const parent of [
      ids.docSouthContract,
      ids.docNorthContract,
      amendment,
    ]) {
      const response = await patch(amendment, { parent_document_id: parent });
      expect(response.statusCode).toBe(400);
    }
    expect(
      (
        await db.document.findUniqueOrThrow({
          where: { id: amendment },
          select: { parentDocumentId: true },
        })
      ).parentDocumentId,
    ).toBe(contract);
  });

  it("returns 401/403/404 in the documented precedence", async () => {
    const id = await seedDocument({ type: "other" });
    expect((await patch(id, { title: "x" }, { cookie: null })).statusCode).toBe(
      401,
    );
    expect((await patch(id, { title: "x" }, { origin: null })).statusCode).toBe(
      403,
    );
    const member = await login(app, accounts.member);
    expect(
      (await patch(id, { title: "x" }, { cookie: member })).statusCode,
    ).toBe(403);
    const other = await login(app, accounts.other);
    const foreign = await patch(id, { title: "x" }, { cookie: other });
    const missing = await patch(randomUUID(), { title: "x" });
    expect(foreign.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(foreign.body).toBe(missing.body);
    expect((await patch("bad-id", { title: "x" })).statusCode).toBe(400);
  });
});
