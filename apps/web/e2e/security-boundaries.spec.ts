/**
 * Upload size/content boundaries and Next → Fastify proxy behavior through
 * the single external origin. Every test name contains "boundary" or "proxy".
 */
import http from "node:http";
import { expect, test, type Page } from "@playwright/test";
import {
  accounts,
  ids,
  loginViaUi,
  minimalPdf,
  originHeader,
  sha256,
} from "./support";

test.describe.configure({ mode: "serial" });

const MAX_FILE_BYTES = 25_000_000;
const PDF = "application/pdf";

/** Logs in as admin; the PDF is generated, independent of seeded rows. */
async function adminWithPdf(page: Page) {
  await loginViaUi(page, accounts.admin);
  return minimalPdf();
}
/** Valid PDF padded with trailing whitespace; the structure stays intact. */
function padded(pdf: Buffer, size: number) {
  const bytes = Buffer.alloc(size, 0x20);
  pdf.copy(bytes);
  return bytes;
}
async function documentCount(page: Page) {
  const detail = (await (
    await page.request.get(`/api/deals/${ids.dealNorthRental}`)
  ).json()) as { documents: unknown[] };
  return detail.documents.length;
}
function upload(page: Page, bytes: Buffer, name = "boundary.pdf") {
  return page.request.post(`/api/deals/${ids.dealNorthRental}/documents`, {
    headers: originHeader(),
    multipart: {
      title: `Граница ${bytes.length}`,
      type: "other",
      file: { name, mimeType: PDF, buffer: bytes },
    },
    timeout: 120_000,
  });
}

for (const size of [MAX_FILE_BYTES - 1, MAX_FILE_BYTES]) {
  test(`boundary: a valid ${size}-byte PDF uploads through the proxy and downloads byte-for-byte`, async ({
    page,
  }) => {
    const bytes = padded(await adminWithPdf(page), size);
    const response = await upload(page, bytes);
    expect(response.status()).toBe(201);
    const { id } = (await response.json()) as { id: string };
    const download = await page.request.get(`/api/documents/${id}/file`, {
      timeout: 120_000,
    });
    expect(download.status()).toBe(200);
    expect(sha256(await download.body())).toBe(sha256(bytes));
  });
}

test("boundary: one byte over the limit is 413 through the proxy with no partial row", async ({
  page,
}) => {
  const pdf = await adminWithPdf(page);
  const before = await documentCount(page);
  const response = await upload(page, padded(pdf, MAX_FILE_BYTES + 1));
  expect(response.status()).toBe(413);
  expect(await response.json()).toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  expect(await documentCount(page)).toBe(before);
});

test("boundary: a chunked oversized upload without Content-Length is 413 through the proxy", async ({
  page,
}) => {
  const pdf = await adminWithPdf(page);
  const before = await documentCount(page);
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === "agency_session")!;
  const boundary = "----boundaryChunked";
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nChunked\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\nother\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="c.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const file = padded(pdf, MAX_FILE_BYTES + 4096);
  const base = new URL(process.env.E2E_BASE_URL!);
  const status = await new Promise<number>((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port: base.port,
        method: "POST",
        path: `/api/deals/${ids.dealNorthRental}/documents`,
        headers: {
          origin: base.origin,
          cookie: `agency_session=${session.value}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
          "transfer-encoding": "chunked",
        },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      },
    );
    request.on("error", reject);
    request.write(head);
    for (let offset = 0; offset < file.length; offset += 1 << 20)
      request.write(file.subarray(offset, offset + (1 << 20)));
    request.end(tail);
  });
  expect(status).toBe(413);
  expect(await documentCount(page)).toBe(before);
});

test("boundary: content that is not a real PDF/DOCX is 415 through the proxy", async ({
  page,
}) => {
  await loginViaUi(page, accounts.admin);
  const before = await documentCount(page);
  const response = await upload(page, Buffer.from("%PDF-1.7 fake"), "fake.pdf");
  expect(response.status()).toBe(415);
  expect(await documentCount(page)).toBe(before);
});

test("proxy: login keeps Set-Cookie attributes and logout clears them", async ({
  request,
}) => {
  const login = await request.post("/api/auth/login", {
    headers: originHeader(),
    data: accounts.member,
  });
  expect(login.status()).toBe(204);
  const setCookie = login.headers()["set-cookie"] ?? "";
  expect(setCookie).toMatch(/^agency_session=[A-Za-z0-9_-]{43};/);
  for (const attribute of [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=28800",
  ])
    expect(setCookie).toContain(attribute);
  expect(setCookie).not.toContain("Domain=");
  expect(login.headers()["cache-control"]).toBe("private, no-store");
  const logout = await request.post("/api/auth/logout", {
    headers: originHeader(),
  });
  expect(logout.status()).toBe(204);
  expect(logout.headers()["set-cookie"]).toMatch(/^agency_session=;/);
});

test("proxy: missing or foreign Origin is 403 and no session is 401", async ({
  page,
  request,
}) => {
  const anonymous = await request.get("/api/deals");
  expect(anonymous.status()).toBe(401);
  expect(await anonymous.json()).toMatchObject({ code: "UNAUTHENTICATED" });
  await loginViaUi(page, accounts.admin);
  const variants: Record<string, string>[] = [
    {},
    { origin: "https://evil.example" },
  ];
  for (const headers of variants) {
    const response = await page.request.patch(
      `/api/documents/${ids.docNorthContract}`,
      { headers, data: { title: "x" } },
    );
    expect(response.status()).toBe(403);
  }
});

test("proxy: download keeps attachment, MIME, nosniff and no-store headers", async ({
  page,
}) => {
  await loginViaUi(page, accounts.other);
  const response = await page.request.get(
    `/api/documents/${ids.docSouthContract}/file`,
  );
  const headers = response.headers();
  expect(headers["content-type"]).toBe(PDF);
  expect(headers["content-disposition"]).toMatch(
    /^attachment; filename="[^"]+"; filename\*=UTF-8''/,
  );
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["cache-control"]).toBe("private, no-store");
});

test("proxy: a foreign deal page is a real 404 before any streamed 200", async ({
  page,
}) => {
  await loginViaUi(page, accounts.member);
  const response = await page.request.get(`/deals/${ids.dealSouthSale}`, {
    headers: { accept: "text/html" },
  });
  expect(response.status()).toBe(404);
  expect(await response.text()).toContain("Запись не найдена");
});

// Keep last: it exhausts the per-IP login budget of the loopback client.
test("proxy: forged X-Forwarded-For through Next cannot create new rate-limit buckets", async ({
  request,
}) => {
  let limitedAfter = 0;
  for (let attempt = 1; attempt <= 101; attempt += 1) {
    const response = await request.post("/api/auth/login", {
      headers: {
        ...originHeader(),
        "x-forwarded-for": `203.0.113.${attempt % 250}, 198.51.100.${attempt % 250}`,
      },
      data: { email: `spoof${attempt}@agency.test` },
    });
    if (response.status() === 429) {
      limitedAfter = attempt;
      break;
    }
    expect(response.status()).toBe(400);
  }
  // The per-IP budget (100) is shared by every forged value: the web server
  // replaces client-supplied X-Forwarded-For with the real peer address.
  expect(limitedAfter).toBeGreaterThan(0);
  expect(limitedAfter).toBeLessThanOrEqual(101);
  const another = await request.post("/api/auth/login", {
    headers: { ...originHeader(), "x-forwarded-for": "192.0.2.123" },
    data: accounts.member,
  });
  expect(another.status()).toBe(429);
  expect(Number(another.headers()["retry-after"])).toBeGreaterThan(0);
});
