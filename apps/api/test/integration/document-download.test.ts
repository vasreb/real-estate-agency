import { randomUUID } from "node:crypto";
import { createSamplePdf, ids, PDF_MIME } from "../fixtures/index.js";
import { accounts, createTestApp, login, openDatabase } from "./helpers.js";

const db = openDatabase();
const app = createTestApp(db);
const created: string[] = [];
afterAll(async () => {
  await db.document.deleteMany({ where: { id: { in: created } } });
  await app.close();
  await db.$disconnect();
});

const download = (documentId: string, cookie?: string) =>
  app.inject({
    url: `/api/documents/${documentId}/file`,
    headers: cookie ? { cookie } : {},
  });

describe("GET /api/documents/{documentId}/file", () => {
  it("lets a team member download the original byte-for-byte as an attachment", async () => {
    const expected = await db.document.findUniqueOrThrow({
      where: { id: ids.docNorthContract },
      select: { fileData: true },
    });
    const response = await download(
      ids.docNorthContract,
      await login(app, accounts.member),
    );
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.equals(Buffer.from(expected.fileData))).toBe(
      true,
    );
    expect(response.headers["content-type"]).toBe(PDF_MIME);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["content-disposition"]).toBe(
      `attachment; filename="${"Purchase agreement.pdf".replace(/[^ -~]/g, "_")}"; filename*=UTF-8''${encodeURIComponent("Purchase agreement.pdf")}`,
    );
  });

  it("returns 401 without a session, 400 for an invalid id, 404 for foreign or missing documents", async () => {
    expect((await download(ids.docNorthContract)).statusCode).toBe(401);
    const other = await login(app, accounts.other);
    expect((await download("not-a-uuid", other)).statusCode).toBe(400);
    const foreign = await download(ids.docNorthContract, other);
    const missing = await download(randomUUID(), other);
    expect(foreign.statusCode).toBe(404);
    expect(foreign.body).toBe(missing.body);
    expect(foreign.headers["content-disposition"]).toBeUndefined();
  });

  it("neutralizes a malicious stored file name in the header", async () => {
    const document = await db.document.create({
      data: {
        dealId: ids.dealNorthRental,
        type: "other",
        title: "Evil",
        fileName: 'a"\r\nSet-Cookie: x=1;‮/../..\\evil.pdf',
        mimeType: PDF_MIME,
        fileData: await createSamplePdf("evil"),
      },
      select: { id: true },
    });
    created.push(document.id);
    const response = await download(
      document.id,
      await login(app, accounts.member),
    );
    expect(response.statusCode).toBe(200);
    const header = String(response.headers["content-disposition"]);
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).not.toContain("‮");
    expect(header).not.toMatch(/filename="[^"]*"[^;]/);
    expect(header).toMatch(
      /^attachment; filename="[^"\\/]*"; filename\*=UTF-8''[^\s"]+$/,
    );
    expect(response.headers["set-cookie"]).toBeUndefined();
  });
});
