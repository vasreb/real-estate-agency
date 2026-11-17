/**
 * Deterministic interleavings of delete vs. link on a real PostgreSQL.
 * A second connection ("blocker") performs one side and holds its locks;
 * the application request performs the other side and is observed waiting
 * in pg_stat_activity before the blocker commits. No sleeps decide ordering
 * and no production delay hooks exist.
 */
import pg from "pg";
import { createSamplePdf, ids, PDF_MIME } from "../fixtures/index.js";
import {
  accounts,
  createTestApp,
  login,
  openDatabase,
  ORIGIN,
} from "./helpers.js";
import { multipart } from "./multipart.js";

const db = openDatabase();
const app = createTestApp(db);
const blocker = new pg.Client({ connectionString: process.env.DATABASE_URL });
const observer = new pg.Client({ connectionString: process.env.DATABASE_URL });
let admin: string;
const pdf = await createSamplePdf("race test");
const created: string[] = [];

beforeAll(async () => {
  await Promise.all([blocker.connect(), observer.connect()]);
  admin = await login(app, accounts.admin);
});
afterAll(async () => {
  await db.document.deleteMany({
    where: { id: { in: created }, parentDocumentId: { not: null } },
  });
  await db.document.deleteMany({ where: { id: { in: created } } });
  await Promise.all([blocker.end(), observer.end()]);
  await app.close();
  await db.$disconnect();
});
afterEach(async () => {
  await blocker.query("ROLLBACK");
});

async function seed(type: "contract" | "amendment", parentDocumentId?: string) {
  const { id } = await db.document.create({
    data: {
      dealId: ids.dealNorthRental,
      type,
      title: type,
      fileName: `${type}.pdf`,
      mimeType: PDF_MIME,
      fileData: pdf,
      ...(parentDocumentId ? { parentDocumentId } : {}),
    },
    select: { id: true },
  });
  created.push(id);
  return id;
}

/** Resolves once another backend of this database waits on a row lock (bounded). */
async function waitForLockWait(timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await observer.query<{ waiting: number }>(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (rows[0]!.waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Request never blocked on the expected lock");
}

const patchParent = (amendment: string, parent: string) =>
  app.inject({
    method: "PATCH",
    url: `/api/documents/${amendment}`,
    headers: { origin: ORIGIN, cookie: admin },
    payload: { parent_document_id: parent },
  });
const uploadLinked = (parent: string) => {
  const body = multipart([
    { name: "title", value: "Amendment" },
    { name: "type", value: "amendment" },
    { name: "parent_document_id", value: parent },
    { name: "file", fileName: "ds.pdf", contentType: PDF_MIME, bytes: pdf },
  ]);
  return app.inject({
    method: "POST",
    url: `/api/deals/${ids.dealNorthRental}/documents`,
    headers: { ...body.headers, origin: ORIGIN, cookie: admin },
    payload: body.payload,
  });
};
const deleteDocument = (id: string) =>
  app.inject({
    method: "DELETE",
    url: `/api/documents/${id}`,
    headers: { origin: ORIGIN, cookie: admin },
  });

describe("link first, then delete", () => {
  it("a delete waiting behind an uncommitted link fails with 409 after the link commits", async () => {
    const contract = await seed("contract");
    const amendment = await seed("amendment");
    await blocker.query("BEGIN");
    await blocker.query(
      "SELECT id FROM documents WHERE id = $1 AND deal_id = $2 FOR KEY SHARE",
      [contract, ids.dealNorthRental],
    );
    await blocker.query(
      "UPDATE documents SET parent_document_id = $1 WHERE id = $2",
      [contract, amendment],
    );
    const pending = deleteDocument(contract);
    await waitForLockWait();
    await blocker.query("COMMIT");
    const response = await pending;
    expect(response.statusCode).toBe(409);
    expect(await db.document.count({ where: { id: contract } })).toBe(1);
  });
});

describe("delete first, then link", () => {
  it.each([
    ["PATCH relink", "patch"],
    ["upload with parent", "upload"],
  ] as const)(
    "%s waiting behind an uncommitted delete gets 400 after the delete commits",
    async (_label, mode) => {
      const contract = await seed("contract");
      const previous = await seed("contract");
      const amendment = await seed("amendment", previous);
      const before = await db.document.count();
      await blocker.query("BEGIN");
      await blocker.query("DELETE FROM documents WHERE id = $1", [contract]);
      const pending =
        mode === "patch"
          ? patchParent(amendment, contract)
          : uploadLinked(contract);
      await waitForLockWait();
      await blocker.query("COMMIT");
      const response = await pending;
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
      // No orphan row, no dangling FK, and the previous parent is preserved.
      expect(await db.document.count()).toBe(before - 1);
      expect(
        (
          await db.document.findUniqueOrThrow({
            where: { id: amendment },
            select: { parentDocumentId: true },
          })
        ).parentDocumentId,
      ).toBe(previous);
    },
  );

  it.each([
    ["PATCH relink", "patch"],
    ["upload with parent", "upload"],
  ] as const)(
    "%s succeeds when the concurrent delete rolls back",
    async (_label, mode) => {
      const contract = await seed("contract");
      const amendment = await seed("amendment");
      await blocker.query("BEGIN");
      await blocker.query("DELETE FROM documents WHERE id = $1", [contract]);
      const pending =
        mode === "patch"
          ? patchParent(amendment, contract)
          : uploadLinked(contract);
      await waitForLockWait();
      await blocker.query("ROLLBACK");
      const response = await pending;
      expect([200, 201]).toContain(response.statusCode);
      const body = response.json<{ id: string; parent_document_id: string }>();
      if (response.statusCode === 201) created.push(body.id);
      expect(body.parent_document_id).toBe(contract);
      expect((await deleteDocument(contract)).statusCode).toBe(409);
    },
  );
});
