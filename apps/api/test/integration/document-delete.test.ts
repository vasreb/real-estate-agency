import { randomUUID } from "node:crypto";
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
const pdf = await createSamplePdf("delete test");
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
const remove = (
  id: string,
  options: { cookie?: string | null; origin?: string | null } = {},
) => {
  const cookie = options.cookie === undefined ? admin : options.cookie;
  return app.inject({
    method: "DELETE",
    url: `/api/documents/${id}`,
    headers: {
      ...(options.origin === null ? {} : { origin: options.origin ?? ORIGIN }),
      ...(cookie ? { cookie } : {}),
    },
  });
};
const download = (id: string) =>
  app.inject({ url: `/api/documents/${id}/file`, headers: { cookie: admin } });

describe("DELETE /api/documents/{documentId}", () => {
  it("protects a referenced contract (409), then deletes child and contract in order", async () => {
    const contract = await seed("contract");
    const amendment = await seed("amendment", contract);
    expect((await download(amendment)).statusCode).toBe(200);
    const conflict = await remove(contract);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ code: "DOCUMENT_REFERENCED" });
    expect((await download(contract)).statusCode).toBe(200);

    const removed = await remove(amendment);
    expect(removed.statusCode).toBe(204);
    expect(removed.body).toBe("");
    expect((await download(amendment)).statusCode).toBe(404);
    expect(await db.document.count({ where: { id: amendment } })).toBe(0);

    expect((await remove(contract)).statusCode).toBe(204);
    expect((await download(contract)).statusCode).toBe(404);
    expect((await remove(contract)).statusCode).toBe(404);
  });

  it("returns 401 without session, 403 without Origin or for a member, 404 for foreign/missing", async () => {
    const id = await seed("contract");
    expect((await remove(id, { cookie: null })).statusCode).toBe(401);
    expect((await remove(id, { origin: null })).statusCode).toBe(403);
    expect(
      (await remove(id, { cookie: await login(app, accounts.member) }))
        .statusCode,
    ).toBe(403);
    const other = await login(app, accounts.other);
    const foreign = await remove(id, { cookie: other });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.body).toBe((await remove(randomUUID())).body);
    expect((await remove("bad-id")).statusCode).toBe(400);
    expect(await db.document.count({ where: { id } })).toBe(1);
  });
});
