import { randomUUID } from "node:crypto";
import pg from "pg";
import { createDatabase } from "../../src/infrastructure/database/index.js";
import { ids } from "../fixtures/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !databaseUrl.includes("/agency_test"))
  throw new Error(
    "Integration tests require the isolated agency_test database.",
  );

/** Every test runs inside a transaction that is rolled back. */
let client: pg.Client;
beforeAll(async () => {
  client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
});
afterAll(async () => {
  await client.end();
});
beforeEach(async () => {
  await client.query("BEGIN");
});
afterEach(async () => {
  await client.query("ROLLBACK");
});

async function expectViolation(
  sql: string,
  params: unknown[],
  expected: { code: string; constraint: string },
) {
  await client.query("SAVEPOINT attempt");
  try {
    await client.query(sql, params);
    throw new Error(`Expected ${expected.constraint} violation`);
  } catch (error) {
    const dbError = error as { code?: string; constraint?: string };
    expect({ code: dbError.code, constraint: dbError.constraint }).toEqual(
      expected,
    );
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT attempt");
  }
}

const insertDocument = `INSERT INTO documents
  (id, deal_id, parent_document_id, type, title, file_name, mime_type, file_data)
  VALUES ($1, $2, $3, $4, 'Test', 'test.pdf', 'application/pdf', '\\x25504446')`;

describe("PostgreSQL constraints from the initial migration", () => {
  it("allows a valid amendment linked to a contract of the same deal", async () => {
    const amendment = randomUUID();
    await client.query(insertDocument, [
      amendment,
      ids.dealNorthSale,
      ids.docNorthContract,
      "amendment",
    ]);
    const { rows } = await client.query<{ status: string; created_at: Date }>(
      "SELECT status, created_at FROM documents WHERE id = $1",
      [amendment],
    );
    expect(rows[0]?.status).toBe("unknown");
    expect(rows[0]?.created_at).toBeInstanceOf(Date);
  });

  it("rejects a parent from another deal via the composite foreign key", async () => {
    await expectViolation(
      insertDocument,
      [randomUUID(), ids.dealNorthSale, ids.docSouthContract, "amendment"],
      { code: "23503", constraint: "documents_parent_same_deal_fk" },
    );
  });

  it("rejects a self-referencing document", async () => {
    const id = randomUUID();
    await expectViolation(
      insertDocument,
      [id, ids.dealNorthSale, id, "amendment"],
      { code: "23514", constraint: "documents_not_self_parent" },
    );
  });

  it("rejects a parent on a non-amendment document", async () => {
    await expectViolation(
      insertDocument,
      [randomUUID(), ids.dealNorthSale, ids.docNorthContract, "contract"],
      { code: "23514", constraint: "documents_only_amendment_parent" },
    );
  });

  it("restricts deleting a contract referenced by an amendment", async () => {
    await expectViolation(
      "DELETE FROM documents WHERE id = $1",
      [ids.docNorthContract],
      { code: "23001", constraint: "documents_parent_same_deal_fk" },
    );
    await client.query("DELETE FROM documents WHERE id = $1", [
      ids.docNorthAmendment,
    ]);
    const deleted = await client.query("DELETE FROM documents WHERE id = $1", [
      ids.docNorthContract,
    ]);
    expect(deleted.rowCount).toBe(1);
  });

  it("rejects duplicate memberships and duplicate deal numbers within a team", async () => {
    await expectViolation(
      "INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'admin')",
      [ids.teamNorth, ids.userMember],
      { code: "23505", constraint: "team_members_pkey" },
    );
    await expectViolation(
      `INSERT INTO deals (id, number, type, client_id, property_id, team_id)
       VALUES ($1, '2026-001', 'sale', $2, $3, $4)`,
      [randomUUID(), ids.clientCompany, ids.propertyCentral, ids.teamNorth],
      { code: "23505", constraint: "deals_team_id_number_key" },
    );
  });

  it("allows the same deal number in a different team", async () => {
    const result = await client.query(
      `INSERT INTO deals (id, number, type, client_id, property_id, team_id)
       VALUES ($1, '2026-002', 'rental', $2, $3, $4)`,
      [randomUUID(), ids.clientPerson, ids.propertyRiver, ids.teamSouth],
    );
    expect(result.rowCount).toBe(1);
  });

  it("rejects enum values outside the specification and duplicate emails", async () => {
    await client.query("SAVEPOINT enum_check");
    await expect(
      client.query(insertDocument, [
        randomUUID(),
        ids.dealNorthSale,
        null,
        "invoice",
      ]),
    ).rejects.toMatchObject({ code: "22P02" });
    await client.query("ROLLBACK TO SAVEPOINT enum_check");
    await expectViolation(
      "INSERT INTO users (id, email, password_hash) VALUES ($1, 'member@agency.test', 'x')",
      [randomUUID()],
      { code: "23505", constraint: "users_email_key" },
    );
  });

  it("uses date/timestamptz/bytea column types and the required indexes", async () => {
    const { rows } = await client.query<{
      column_name: string;
      data_type: string;
    }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name IN ('documents', 'sessions')
         AND column_name IN ('document_date', 'effective_from', 'created_at', 'file_data', 'expires_at')
       ORDER BY column_name`,
    );
    expect(
      Object.fromEntries(rows.map((r) => [r.column_name, r.data_type])),
    ).toEqual({
      created_at: "timestamp with time zone",
      document_date: "date",
      effective_from: "date",
      expires_at: "timestamp with time zone",
      file_data: "bytea",
    });
    const indexes = await client.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE tablename IN ('team_members', 'documents')",
    );
    expect(indexes.rows.map((r) => r.indexname)).toEqual(
      expect.arrayContaining([
        "team_members_user_id_idx",
        "documents_deal_id_parent_document_id_idx",
        "documents_deal_id_id_key",
      ]),
    );
  });
});

describe("Prisma adapter runtime", () => {
  const db = createDatabase(databaseUrl);
  const originalTz = process.env.TZ;
  afterAll(async () => {
    process.env.TZ = originalTz;
    await db.$disconnect();
  });

  it.each(["UTC", "Pacific/Kiritimati", "America/Adak"])(
    "round-trips document dates unchanged with process TZ=%s",
    async (timeZone) => {
      process.env.TZ = timeZone;
      const document = await db.document.findUniqueOrThrow({
        where: { id: ids.docNorthAmendment },
        select: { documentDate: true, effectiveFrom: true },
      });
      expect(document.documentDate?.toISOString().slice(0, 10)).toBe(
        "2026-02-20",
      );
      expect(document.effectiveFrom?.toISOString().slice(0, 10)).toBe(
        "2026-03-01",
      );
    },
  );

  it("never selects file_data in metadata projections", async () => {
    const rows = await db.document.findMany({
      where: { dealId: ids.dealNorthSale },
      select: { id: true, title: true, mimeType: true },
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row).not.toHaveProperty("fileData");
  });
});
