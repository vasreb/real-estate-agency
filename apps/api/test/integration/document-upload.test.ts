import { PassThrough } from "node:stream";
import { documentMetadataSchema, MAX_FILE_BYTES } from "@agency/contracts";
import {
  createSampleDocx,
  createSamplePdf,
  DOCX_MIME,
  ids,
  PDF_MIME,
} from "../fixtures/index.js";
import {
  accounts,
  createTestApp,
  login,
  openDatabase,
  ORIGIN,
} from "./helpers.js";
import { multipart, type Part } from "./multipart.js";

const db = openDatabase();
const app = createTestApp(db);
let admin: string;
const pdf = await createSamplePdf("upload test");
const docx = createSampleDocx("Тестовое допсоглашение");
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

const url = (dealId: string = ids.dealNorthRental) =>
  `/api/deals/${dealId}/documents`;
const count = () => db.document.count();
const filePart = (
  bytes: Uint8Array = pdf,
  fileName = "Договор.pdf",
  contentType = "application/pdf",
): Part => ({ name: "file", fileName, contentType, bytes });

function upload(
  parts: Part[],
  options: {
    cookie?: string | null;
    origin?: string | null;
    dealId?: string;
    terminate?: boolean;
  } = {},
) {
  const body = multipart(parts, { terminate: options.terminate });
  const cookie = options.cookie === undefined ? admin : options.cookie;
  return app.inject({
    method: "POST",
    url: url(options.dealId),
    headers: {
      ...body.headers,
      ...(options.origin === null ? {} : { origin: options.origin ?? ORIGIN }),
      ...(cookie ? { cookie } : {}),
    },
    payload: body.payload,
  });
}
function track(response: Awaited<ReturnType<typeof upload>>) {
  if (response.statusCode === 201)
    created.push(documentMetadataSchema.parse(response.json()).id);
  return response;
}

describe("POST /api/deals/{dealId}/documents — success", () => {
  it.each([
    ["file last", (f: Part, m: Part[]) => [...m, f]],
    ["file first", (f: Part, m: Part[]) => [f, ...m]],
  ])(
    "accepts a PDF with fields and %s, defaulting status",
    async (_label, order) => {
      const response = track(
        await upload(
          order(filePart(), [
            { name: "title", value: "  Договор аренды  " },
            { name: "type", value: "contract" },
            { name: "document_date", value: "2026-05-01" },
          ]),
        ),
      );
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        deal_id: ids.dealNorthRental,
        title: "Договор аренды",
        type: "contract",
        status: "unknown",
        document_date: "2026-05-01",
        effective_from: null,
        parent_document_id: null,
        mime_type: PDF_MIME,
        file_name: "Договор.pdf",
      });
      expect(response.body).not.toContain("file_data");
    },
  );

  it("detects DOCX by content regardless of declared MIME/extension and links it to a same-deal contract", async () => {
    const contract = track(
      await upload([
        { name: "title", value: "Договор" },
        { name: "type", value: "contract" },
        filePart(),
      ]),
    ).json<{ id: string }>();
    const response = track(
      await upload([
        { name: "type", value: "amendment" },
        { name: "title", value: "ДС" },
        { name: "parent_document_id", value: contract.id },
        { name: "status", value: "signed" },
        filePart(docx, "../../etc/ДС.pdf", "application/pdf"),
      ]),
    );
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      mime_type: DOCX_MIME,
      parent_document_id: contract.id,
      status: "signed",
      file_name: "ДС.pdf",
    });
    const stored = await db.document.findUniqueOrThrow({
      where: { id: response.json<{ id: string }>().id },
      select: { fileData: true },
    });
    expect(Buffer.from(stored.fileData).equals(Buffer.from(docx))).toBe(true);
  });

  it("accepts exactly 25 000 000 bytes and rejects one more byte with 413", async () => {
    const padded = Buffer.alloc(MAX_FILE_BYTES, 0x20);
    Buffer.from(pdf).copy(padded);
    const fields: Part[] = [
      { name: "title", value: "Граница" },
      { name: "type", value: "other" },
    ];
    const ok = track(await upload([...fields, filePart(padded)]));
    expect(ok.statusCode).toBe(201);
    const before = await count();
    const tooLarge = await upload([
      ...fields,
      filePart(Buffer.concat([padded, Buffer.from(" ")])),
    ]);
    expect(tooLarge.statusCode).toBe(413);
    expect(tooLarge.json()).toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    expect(await count()).toBe(before);
  }, 60_000);
});

describe("POST /api/deals/{dealId}/documents — rejections leave no row", () => {
  const valid: Part[] = [
    { name: "title", value: "Документ" },
    { name: "type", value: "other" },
  ];
  let before: number;
  beforeEach(async () => {
    before = await count();
  });
  afterEach(async () => {
    expect(await count()).toBe(before);
  });

  it("401 without a session, 403 with a foreign Origin, 403 for a member, 404 for a foreign deal", async () => {
    expect(
      (await upload([...valid, filePart()], { cookie: null })).statusCode,
    ).toBe(401);
    expect(
      (await upload([...valid, filePart()], { origin: "https://evil.test" }))
        .statusCode,
    ).toBe(403);
    const member = await login(app, accounts.member);
    expect(
      (await upload([...valid, filePart()], { cookie: member })).statusCode,
    ).toBe(403);
    expect(
      (await upload([...valid, filePart()], { dealId: ids.dealSouthSale }))
        .statusCode,
    ).toBe(404);
    expect(
      (await upload([...valid, filePart()], { dealId: "not-a-uuid" }))
        .statusCode,
    ).toBe(400);
  });

  it.each<[string, Part[], number]>([
    ["missing file", valid, 400],
    ["missing title", [{ name: "type", value: "other" }, filePart()], 400],
    [
      "bad type",
      [
        { name: "title", value: "x" },
        { name: "type", value: "invoice" },
        filePart(),
      ],
      400,
    ],
    [
      "empty optional date",
      [...valid, { name: "document_date", value: "" }, filePart()],
      400,
    ],
    [
      "unknown field",
      [...valid, { name: "deal_id", value: ids.dealNorthSale }, filePart()],
      400,
    ],
    [
      "duplicate field",
      [...valid, { name: "title", value: "again" }, filePart()],
      400,
    ],
    [
      "file under another name",
      [...valid, { name: "attachment", fileName: "a.pdf", bytes: pdf }],
      400,
    ],
    ["two files", [...valid, filePart(), filePart()], 413],
    [
      "too many fields",
      [
        ...valid,
        { name: "document_number", value: "1" },
        { name: "document_date", value: "2026-01-01" },
        { name: "effective_from", value: "2026-01-01" },
        { name: "status", value: "draft" },
        { name: "parent_document_id", value: ids.docNorthContract },
        { name: "extra", value: "x" },
        filePart(),
      ],
      413,
    ],
    [
      "oversized field",
      [
        { name: "title", value: "я".repeat(5000) },
        { name: "type", value: "other" },
        filePart(),
      ],
      413,
    ],
    [
      "text renamed .pdf",
      [...valid, filePart(Buffer.from("plain text"), "fake.pdf")],
      415,
    ],
    [
      "foreign-deal parent",
      [
        { name: "title", value: "ДС" },
        { name: "type", value: "amendment" },
        { name: "parent_document_id", value: ids.docSouthContract },
        filePart(),
      ],
      400,
    ],
  ])("%s → %i", async (_label, parts, status) => {
    const response = await upload(parts);
    expect(response.statusCode).toBe(status);
    expect(response.json()).toHaveProperty("code");
  });

  it("rejects a truncated multipart body with 400", async () => {
    const response = await upload([...valid, filePart()], { terminate: false });
    expect(response.statusCode).toBe(400);
  });

  it("rejects a non-multipart body", async () => {
    const response = await app.inject({
      method: "POST",
      url: url(),
      headers: { origin: ORIGIN, cookie: admin },
      payload: { title: "x", type: "other" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("limits concurrent uploads to two per instance and releases slots afterwards", async () => {
    const streams = [new PassThrough(), new PassThrough()];
    const body = multipart([...valid, filePart(Buffer.from("not a document"))]);
    const pending = streams.map((stream) =>
      app.inject({
        method: "POST",
        url: url(),
        headers: { ...body.headers, origin: ORIGIN, cookie: admin },
        payload: stream,
      }),
    );
    // Feed the first bytes so both handlers acquire their slots.
    for (const stream of streams) stream.write(body.payload.subarray(0, 10));
    await new Promise((resolve) => setTimeout(resolve, 200));
    const third = await upload([...valid, filePart()]);
    expect(third.statusCode).toBe(429);
    expect(third.headers["retry-after"]).toBeDefined();
    for (const stream of streams) stream.end(body.payload.subarray(10));
    const results = await Promise.all(pending);
    expect(results.map((r) => r.statusCode)).toEqual([415, 415]);
    const after = await upload([...valid, filePart(Buffer.from("x"))]);
    expect(after.statusCode).toBe(415);
  });
});
