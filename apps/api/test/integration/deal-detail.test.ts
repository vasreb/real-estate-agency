import { randomUUID } from "node:crypto";
import { dealDetailSchema } from "@agency/contracts";
import { createDatabase } from "../../src/infrastructure/database/index.js";
import { createDocumentMetadataReader } from "../../src/modules/documents/index.js";
import { DOCX_MIME, ids, PDF_MIME } from "../fixtures/index.js";
import { accounts, createTestApp, login, openDatabase } from "./helpers.js";

const db = openDatabase();
const clock = { now: new Date() };
const app = createTestApp(db, { clock });
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});
beforeEach(() => {
  clock.now = new Date();
});

const detail = (dealId: string, cookie?: string) =>
  app.inject({
    url: `/api/deals/${dealId}`,
    headers: cookie ? { cookie } : {},
  });

describe("GET /api/deals/{dealId}", () => {
  it("returns the deal, related records, current role, and document metadata", async () => {
    const response = await detail(
      ids.dealNorthSale,
      await login(app, accounts.admin),
    );
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    const body = dealDetailSchema.parse(response.json());
    expect(body).toMatchObject({
      id: ids.dealNorthSale,
      number: "2026-001",
      type: "sale",
      role: "admin",
      client: { id: ids.clientCompany, name: "Romashka LLC" },
      property: {
        id: ids.propertyCentral,
        address: "Moscow, Tverskaya St., 1, apt. 10",
      },
      team: { id: ids.teamNorth, name: "Team North" },
    });
    const contract = body.documents.find((d) => d.id === ids.docNorthContract);
    const amendment = body.documents.find(
      (d) => d.id === ids.docNorthAmendment,
    );
    expect(contract).toMatchObject({
      type: "contract",
      parent_document_id: null,
      document_number: "PA-2026-001",
      document_date: "2026-01-15",
      effective_from: null,
      status: "signed",
      mime_type: PDF_MIME,
      file_name: "Purchase agreement.pdf",
    });
    expect(amendment).toMatchObject({
      type: "amendment",
      parent_document_id: ids.docNorthContract,
      document_date: "2026-02-20",
      effective_from: "2026-03-01",
      mime_type: DOCX_MIME,
    });
    expect(Object.keys(contract!).sort()).toEqual(
      [
        "id",
        "deal_id",
        "parent_document_id",
        "type",
        "title",
        "document_number",
        "document_date",
        "effective_from",
        "status",
        "file_name",
        "mime_type",
        "created_at",
      ].sort(),
    );
    expect(response.body).not.toContain("file_data");
  });

  it("returns the member role and an empty documents list where applicable", async () => {
    const cookie = await login(app, accounts.member);
    const rental = dealDetailSchema.parse(
      (await detail(ids.dealNorthRental, cookie)).json(),
    );
    expect(rental.role).toBe("member");
    expect(rental.documents).toEqual([]);
  });

  it("uses the role of the deal's team for a multi-team user", async () => {
    const cookie = await login(app, accounts.multi);
    expect(
      dealDetailSchema.parse((await detail(ids.dealNorthSale, cookie)).json())
        .role,
    ).toBe("member");
    expect(
      dealDetailSchema.parse((await detail(ids.dealSouthSale, cookie)).json())
        .role,
    ).toBe("admin");
  });

  it("returns identical 404 bodies for foreign and nonexistent deals", async () => {
    const cookie = await login(app, accounts.member);
    const foreign = await detail(ids.dealSouthSale, cookie);
    const missing = await detail(randomUUID(), cookie);
    expect(foreign.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(foreign.body).toBe(missing.body);
    expect(foreign.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for an invalid id only after authentication", async () => {
    expect((await detail("not-a-uuid")).statusCode).toBe(401);
    const cookie = await login(app, accounts.member);
    const response = await detail("not-a-uuid", cookie);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 401 once the session expires", async () => {
    const cookie = await login(app, accounts.member);
    expect((await detail(ids.dealNorthSale, cookie)).statusCode).toBe(200);
    clock.now = new Date(clock.now.getTime() + 8 * 60 * 60 * 1000);
    expect((await detail(ids.dealNorthSale, cookie)).statusCode).toBe(401);
  });
});

describe("document metadata repository", () => {
  it("never selects file_data", async () => {
    const queries: string[] = [];
    const logged = createDatabase(process.env.DATABASE_URL!, {
      onQuery: (sql) => queries.push(sql),
    });
    const reader = createDocumentMetadataReader({ database: logged });
    const documents = await reader
      .listDocumentMetadata(ids.dealNorthSale)
      .finally(() => logged.$disconnect());
    expect(documents).toHaveLength(2);
    for (const document of documents)
      expect(document).not.toHaveProperty("file_data");
    expect(queries.length).toBeGreaterThan(0);
    for (const sql of queries) expect(sql).not.toContain("file_data");
  });
});
