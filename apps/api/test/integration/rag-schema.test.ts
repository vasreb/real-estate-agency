import { randomUUID } from "node:crypto";
import pg from "pg";
import { ids } from "../fixtures/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !databaseUrl.includes("/agency_test"))
  throw new Error(
    "Integration tests require the isolated agency_test database.",
  );

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
  (id, deal_id, team_id, parent_document_id, type, title, file_name, mime_type, file_data)
  VALUES ($1, $2, $3, $4, $5, 'Test', 'test.pdf', 'application/pdf', '\x25504446')`;

const vector = (value: number) =>
  `[${Array.from({ length: 1024 }, () => value).join(",")}]`;
const insertChunk = `INSERT INTO document_chunks
  (id, document_id, ordinal, page_start, page_end, content, embedding, embedding_model)
  VALUES ($1, $2, $3, $4, $5, 'Monthly rent is 1200 EUR', $6::vector, 'voyage-test')`;

describe("RAG schema (ADR-0006, ADR-0007, ADR-0008)", () => {
  it("accepts a team collection document and a deal document", async () => {
    const teamId = ids.teamNorth;
    await client.query(insertDocument, [
      randomUUID(),
      null,
      teamId,
      null,
      "other",
    ]);
    const { rows } = await client.query<{ processing_status: string }>(
      "SELECT processing_status FROM documents WHERE team_id = $1",
      [teamId],
    );
    expect(rows[0]?.processing_status).toBe("pending");
  });

  it("requires exactly one owner", async () => {
    const teamId = ids.teamNorth;
    const expected = { code: "23514", constraint: "documents_single_owner" };
    await expectViolation(
      insertDocument,
      [randomUUID(), ids.dealNorthSale, teamId, null, "other"],
      expected,
    );
    await expectViolation(
      insertDocument,
      [randomUUID(), null, null, null, "other"],
      expected,
    );
  });

  it("forbids contracts and amendments in the team collection", async () => {
    const teamId = ids.teamNorth;
    for (const type of ["contract", "amendment"])
      await expectViolation(
        insertDocument,
        [randomUUID(), null, teamId, null, type],
        { code: "23514", constraint: "documents_team_collection_shape" },
      );
  });

  it("stores chunks, supports vector and full-text search, and cascades on delete", async () => {
    const chunk = randomUUID();
    await client.query(insertChunk, [
      chunk,
      ids.docNorthContract,
      1,
      2,
      3,
      vector(0.5),
    ]);
    const nearest = await client.query<{ id: string }>(
      "SELECT id FROM document_chunks ORDER BY embedding <=> $1::vector LIMIT 1",
      [vector(0.5)],
    );
    expect(nearest.rows[0]?.id).toBe(chunk);
    const text = await client.query(
      "SELECT 1 FROM document_chunks WHERE content_tsv @@ plainto_tsquery('simple', 'rent')",
    );
    expect(text.rowCount).toBe(1);
    // A document without amendments can be deleted; its chunks go with it.
    const loose = randomUUID();
    await client.query(insertDocument, [
      loose,
      ids.dealNorthSale,
      null,
      null,
      "other",
    ]);
    const looseChunk = randomUUID();
    await client.query(insertChunk, [looseChunk, loose, 1, 1, 1, vector(0.2)]);
    await client.query("DELETE FROM documents WHERE id = $1", [loose]);
    const after = await client.query(
      "SELECT 1 FROM document_chunks WHERE id = $1",
      [looseChunk],
    );
    expect(after.rowCount).toBe(0);
  });

  it("rejects invalid page ranges and duplicate chunk ordinals", async () => {
    await expectViolation(
      insertChunk,
      [randomUUID(), ids.docNorthContract, 1, 3, 2, vector(0.1)],
      { code: "23514", constraint: "document_chunks_pages_valid" },
    );
    await client.query(insertChunk, [
      randomUUID(),
      ids.docNorthContract,
      1,
      1,
      1,
      vector(0.1),
    ]);
    await expectViolation(
      insertChunk,
      [randomUUID(), ids.docNorthContract, 1, 1, 1, vector(0.1)],
      { code: "23505", constraint: "document_chunks_document_id_ordinal_key" },
    );
  });

  it("allows only one active index job per document", async () => {
    const insertJob = `INSERT INTO index_jobs (id, document_id, status) VALUES ($1, $2, $3::index_job_status)`;
    await client.query(insertJob, [
      randomUUID(),
      ids.docNorthContract,
      "queued",
    ]);
    await expectViolation(
      insertJob,
      [randomUUID(), ids.docNorthContract, "running"],
      { code: "23505", constraint: "index_jobs_one_active_per_document" },
    );
    await client.query(insertJob, [
      randomUUID(),
      ids.docNorthContract,
      "failed",
    ]);
  });
});
