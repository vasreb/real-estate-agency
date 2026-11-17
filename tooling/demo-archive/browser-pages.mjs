import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const require = createRequire(path.join(root, "apps/web/package.json"));
const { chromium } = require("@playwright/test");
const origin = "http://127.0.0.1:35534";
const token = process.env.DEMO_ARCHIVE_QA_COOKIE;
if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
  throw new Error("Process-only approved QA cookie required.");
const releaseRoot = path.join(root, "out/agency-demo-archive/v1");
const evidence = path.join(root, ".omo/evidence/realistic-agency-archive");
const rows = JSON.parse(
  await readFile(path.join(releaseRoot, "manifest/documents.json"), "utf8"),
);
const deals = JSON.parse(
  await readFile(path.join(releaseRoot, "entities/deals.json"), "utf8"),
);
const clients = JSON.parse(
  await readFile(path.join(releaseRoot, "entities/clients.json"), "utf8"),
);
const properties = JSON.parse(
  await readFile(path.join(releaseRoot, "entities/properties.json"), "utf8"),
);
const timelines = JSON.parse(
  await readFile(
    path.join(releaseRoot, "manifest/scenario-timelines.json"),
    "utf8",
  ),
);
const release = JSON.parse(
  await readFile(path.join(evidence, "release-receipt.json"), "utf8"),
);
const screenshots = path.join(evidence, "main-browser");
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const date = (s) => (s ? s.split("-").reverse().join(".") : "—");
const status = { signed: "Подписан", draft: "Черновик", unknown: "Не указан" };
const reviewed = [];
const families = new Set();
const cohorts = new Set();
let downloads = 0;
try {
  await context.addCookies([
    {
      name: "agency_session",
      value: token,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(`${origin}/deals`);
  await page.getByRole("heading", { name: "Сделки", exact: true }).waitFor();
  await page
    .getByText("Обновление…", { exact: true })
    .waitFor({ state: "hidden" });
  await page.screenshot({
    path: path.join(screenshots, "deal-list.png"),
    fullPage: false,
  });
  for (const deal of deals) {
    await page.goto(`${origin}/deals/${deal.id}`);
    await page
      .getByRole("heading", { name: `Сделка № ${deal.number}`, exact: false })
      .waitFor();
    const text = await page.locator("main").innerText();
    if (
      !text.includes(clients.find((c) => c.id === deal.client_id).name) ||
      !text.includes(properties.find((p) => p.id === deal.property_id).address)
    )
      throw new Error(`Displayed property/principal mismatch: ${deal.id}`);
    const table = page.getByRole("table", { name: "Документы сделки" });
    await table.waitFor();
    const documents = rows.filter((r) => r.mapped.deal_id === deal.id);
    if ((await table.locator("tbody tr").count()) !== documents.length)
      throw new Error(`Displayed document count mismatch: ${deal.id}`);
    if (
      !(await page
        .getByRole("button", { name: "Загрузить", exact: true })
        .isVisible())
    )
      throw new Error("Actual operations-admin controls missing.");
    for (const row of documents) {
      const tr = table.locator("tbody tr").filter({
        has: page.getByRole("cell", {
          name: row.mapped.document_number,
          exact: true,
        }),
      });
      if ((await tr.count()) !== 1)
        throw new Error(`Document row identity mismatch: ${row.key}`);
      const cells = await tr.getByRole("cell").allTextContents();
      const parent = rows.find(
        (r) => r.mapped.id === row.mapped.parent_document_id,
      );
      const parentLabel = parent
        ? `${parent.mapped.title} (№ ${parent.mapped.document_number})`
        : "—";
      if (
        cells[0] !== row.mapped.title ||
        cells[3] !== date(row.mapped.document_date) ||
        cells[4] !== status[row.mapped.status] ||
        cells[5] !== date(row.mapped.effective_from) ||
        cells[6] !== parentLabel
      )
        throw new Error(`Displayed metadata/parent mismatch: ${row.key}`);
      if (!families.has(row.family)) {
        const waiting = page.waitForEvent("download");
        await tr
          .getByRole("link", {
            name: `Скачать: ${row.mapped.title}`,
            exact: true,
          })
          .click();
        const download = await waiting;
        const file = await download.path();
        if (!file || digest(await readFile(file)) !== row.sha256)
          throw new Error(`Browser-downloaded bytes mismatch: ${row.key}`);
        await download.delete();
        downloads++;
        families.add(row.family);
      }
    }
    const matter = timelines.find((t) => t.deal_id === deal.id);
    if (!cohorts.has(matter.cohort)) {
      await page.evaluate(() => globalThis.scrollTo(0, 0));
      await page.screenshot({
        path: path.join(screenshots, `${matter.cohort}.png`),
        fullPage: false,
      });
      await table.locator("tbody tr").last().scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(screenshots, `${matter.cohort}-last-rows.png`),
        fullPage: false,
      });
      cohorts.add(matter.cohort);
    }
    reviewed.push({
      deal_id: deal.id,
      key: matter.key,
      cohort: matter.cohort,
      documents: documents.length,
      actual_role: "admin",
      parents_dates_statuses_checked: true,
    });
  }
  const row = rows[0];
  const fileUrl = `${origin}/api/documents/${row.mapped.id}/file`;
  await page.route(fileUrl, (route) =>
    route.fulfill({ status: 404, body: "fixture missing original" }),
  );
  const missing = await page.evaluate(async (url) => {
    const response = await fetch(url);
    return response.status;
  }, fileUrl);
  await page.unroute(fileUrl);
  if (missing !== 404)
    throw new Error("Missing-original browser fixture was not detected.");
  await page.route(fileUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: "tampered original fixture",
    }),
  );
  const tampered = await page.evaluate(
    async (url) =>
      Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())),
    fileUrl,
  );
  await page.unroute(fileUrl);
  if (digest(Buffer.from(tampered)) === row.sha256)
    throw new Error("Tampered-original fixture was not detected.");
  if (
    errors.length ||
    reviewed.length !== 120 ||
    families.size !== 48 ||
    cohorts.size !== 9
  )
    throw new Error("Browser coverage or page-error gate failed.");
  const cdp = await browser.newBrowserCDPSession();
  const processes = (await cdp.send("SystemInfo.getProcessInfo")).processInfo;
  const ids = processes.map((p) => p.id);
  if (
    process.platform !== "win32" ||
    ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
  )
    throw new Error(
      "Explicit supported Chromium peak-RSS measurement required.",
    );
  const measured = JSON.parse(
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Get-Process -Id ${ids.join(",")} | Select-Object Id,PeakWorkingSet64 | ConvertTo-Json -Compress`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
  const peaks = Array.isArray(measured) ? measured : [measured];
  if (
    peaks.length !== ids.length ||
    peaks.some((p) => !ids.includes(p.Id) || p.PeakWorkingSet64 > 1024 ** 3)
  )
    throw new Error("Chromium process coverage or peak RSS budget exceeded.");
  if (process.resourceUsage().maxRSS * 1024 > 1024 ** 3)
    throw new Error("Browser driver peak RSS budget exceeded.");
  await writeFile(
    path.join(evidence, "task-18-browser.json"),
    JSON.stringify(
      {
        zip_sha256: release.zip_sha256,
        source_digest: release.source_digest,
        origin,
        main_database: "agency_demo_archive:55433",
        real_main_deals_browsed: reviewed.length,
        metadata_rows_checked: rows.length,
        families_downloaded: families.size,
        byte_exact_browser_downloads: downloads,
        cohorts: [...cohorts],
        reviewed,
        page_errors: errors,
        missing_original_fixture: missing,
        tampered_original_fixture_rejected: true,
        negative_fixture_method:
          "Browser-only network interception; no main document byte/metadata mutation",
        authentication:
          "Explicitly approved temporary QA session; prior ten actual password logins are proved separately",
        cookie_or_state_exported: false,
        native_office_layout: "unverified",
        browser_driver_peak_rss_bytes: process.resourceUsage().maxRSS * 1024,
        chromium_process_peak_rss: peaks,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await context.close();
  await browser.close();
}
