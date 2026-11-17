import { PassThrough } from "node:stream";
import { MAX_FILE_BYTES, MAX_REQUEST_BYTES } from "@agency/contracts";
import { createApp } from "../../src/app.js";
import { createSamplePdf, ids } from "../fixtures/index.js";
import {
  accounts,
  login,
  openDatabase,
  ORIGIN,
  testConfig,
} from "./helpers.js";
import { multipart } from "./multipart.js";

const SENTINEL = "boundary-sentinel-91c2";
const db = openDatabase();
let logs = "";
const app = createApp(testConfig({ LOG_LEVEL: "trace" }), {
  database: db,
  logDestination: {
    write: (chunk: string) => {
      logs += chunk;
    },
  },
});
let admin: string;
const created: string[] = [];
const pdf = await createSamplePdf("boundary");

beforeAll(async () => {
  admin = await login(app, accounts.admin);
});
afterAll(async () => {
  await db.document.deleteMany({ where: { id: { in: created } } });
  await app.close();
  await db.$disconnect();
});

/** A structurally valid PDF padded with trailing whitespace to an exact size. */
function paddedPdf(size: number) {
  const bytes = Buffer.alloc(size, 0x20);
  Buffer.from(pdf).copy(bytes);
  return bytes;
}
const fields = [
  { name: "title", value: `Boundary ${SENTINEL}` },
  { name: "type", value: "other" },
];
const count = () =>
  db.document.count({ where: { dealId: ids.dealNorthRental } });
function send(payload: Buffer | PassThrough, headers: Record<string, string>) {
  return app.inject({
    method: "POST",
    url: `/api/deals/${ids.dealNorthRental}/documents`,
    headers: { ...headers, origin: ORIGIN, cookie: admin },
    payload,
  });
}

describe("upload boundaries", () => {
  it.each([MAX_FILE_BYTES - 1, MAX_FILE_BYTES])(
    "boundary: accepts a valid %i-byte PDF and stores it byte-for-byte",
    async (size) => {
      const bytes = paddedPdf(size);
      const body = multipart([
        ...fields,
        { name: "file", fileName: `${SENTINEL}.pdf`, bytes },
      ]);
      const response = await send(body.payload, body.headers);
      expect(response.statusCode).toBe(201);
      const { id } = response.json<{ id: string }>();
      created.push(id);
      const stored = await db.document.findUniqueOrThrow({
        where: { id },
        select: { fileData: true },
      });
      expect(Buffer.from(stored.fileData).equals(bytes)).toBe(true);
    },
    60_000,
  );

  it("boundary: rejects MAX+1 bytes with 413 and writes nothing", async () => {
    const before = await count();
    const body = multipart([
      ...fields,
      {
        name: "file",
        fileName: "big.pdf",
        bytes: paddedPdf(MAX_FILE_BYTES + 1),
      },
    ]);
    const response = await send(body.payload, body.headers);
    expect(response.statusCode).toBe(413);
    expect(await count()).toBe(before);
  }, 60_000);

  it("boundary: rejects a chunked oversized body without Content-Length", async () => {
    const before = await count();
    const body = multipart([
      ...fields,
      {
        name: "file",
        fileName: "big.pdf",
        bytes: paddedPdf(MAX_FILE_BYTES + 1024),
      },
    ]);
    const stream = new PassThrough();
    const pending = send(stream, {
      ...body.headers,
      "transfer-encoding": "chunked",
    });
    for (let offset = 0; offset < body.payload.length; offset += 1 << 20)
      stream.write(body.payload.subarray(offset, offset + (1 << 20)));
    stream.end();
    const response = await pending;
    expect(response.statusCode).toBe(413);
    expect(await count()).toBe(before);
  }, 60_000);

  it("boundary: enforces the total request limit even when every part is within its own limit", async () => {
    const before = await count();
    const body = multipart([
      ...fields,
      { name: "file", fileName: "ok.pdf", bytes: paddedPdf(MAX_FILE_BYTES) },
    ]);
    // Multipart preamble before the first boundary is ignored by the parser
    // but still counts toward the request size.
    const preamble = Buffer.alloc(MAX_REQUEST_BYTES - MAX_FILE_BYTES + 1, 0x41);
    const stream = new PassThrough();
    const pending = send(stream, {
      ...body.headers,
      "transfer-encoding": "chunked",
    });
    stream.write(Buffer.concat([preamble, Buffer.from("\r\n")]));
    for (let offset = 0; offset < body.payload.length; offset += 1 << 20)
      stream.write(body.payload.subarray(offset, offset + (1 << 20)));
    stream.end();
    const response = await pending;
    expect(response.statusCode).toBe(413);
    expect(await count()).toBe(before);
  }, 60_000);

  it("boundary: rejects a declared Content-Length above the request limit before reading", async () => {
    const response = await send(Buffer.from("x"), {
      "content-type": "multipart/form-data; boundary=x",
      "content-length": String(MAX_REQUEST_BYTES + 1),
    });
    expect(response.statusCode).toBe(413);
  });

  it("boundary: rejects unsupported content with 415", async () => {
    const before = await count();
    const body = multipart([
      ...fields,
      {
        name: "file",
        fileName: "fake.pdf",
        bytes: Buffer.from("%PDF-1.7 not really"),
      },
    ]);
    const response = await send(body.payload, body.headers);
    expect(response.statusCode).toBe(415);
    expect(await count()).toBe(before);
  });

  it("boundary: never writes titles, file names, cookies or bytes into logs", () => {
    expect(logs).toContain("Request completed");
    expect(logs).not.toContain(SENTINEL);
    expect(logs).not.toContain(admin.split("=")[1]!);
    expect(logs).not.toContain("%PDF");
  });
});
