import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, statfs, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const evidence = path.join(root, ".omo/evidence/realistic-agency-archive");
const load = async (name) =>
  JSON.parse(await readFile(path.join(evidence, name), "utf8"));
const requireFact = (ok, name) => {
  if (!ok) throw new Error(`Release gate failed: ${name}`);
};
function budgets(facts, caps) {
  requireFact(facts.originals <= caps.originals, "original byte budget");
  requireFact(facts.expanded <= caps.expanded, "expanded byte budget");
  requireFact(facts.peak <= caps.peak, "peak process RSS");
  requireFact(facts.free >= caps.free, "free working disk");
  requireFact(
    facts.dbFree >= facts.originals * 4 + 512 * 1024 ** 2,
    "DB/WAL headroom",
  );
  requireFact(
    facts.sourceA === facts.sourceB,
    "source identity between builds",
  );
}
const caps = {
  originals: 512 * 1024 ** 2,
  expanded: 640 * 1024 ** 2,
  peak: 1024 ** 3,
  free: 8 * 1024 ** 3,
};
if (process.argv.slice(2).join(" ") === "--self-test") {
  const good = {
    originals: 1,
    expanded: 2,
    peak: 3,
    free: caps.free,
    dbFree: 1024 ** 3,
    sourceA: "same",
    sourceB: "same",
  };
  let rejected = 0;
  for (const mutation of [
    { originals: caps.originals + 1 },
    { expanded: caps.expanded + 1 },
    { peak: caps.peak + 1 },
    { free: 0 },
    { dbFree: 0 },
    { sourceB: "changed" },
  ]) {
    try {
      budgets({ ...good, ...mutation }, caps);
    } catch {
      rejected++;
    }
  }
  requireFact(rejected === 6, "negative resource/source fixtures");
  await writeFile(
    path.join(evidence, "task-19-failure.json"),
    JSON.stringify(
      { fixture_cases: 6, rejected, real_source_or_databases_modified: false },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Six resource/source mutations rejected; no real artifact or DB changed.",
  );
} else {
  requireFact(
    process.argv[2] === "--verify-two-builds" &&
      process.argv[3] === "--evidence" &&
      process.argv.length === 5,
    "explicit release invocation",
  );
  const output = path.resolve(root, process.argv[4]);
  const relative = path.relative(evidence, output);
  requireFact(
    !relative.startsWith("..") &&
      !path.isAbsolute(relative) &&
      relative.endsWith(".json"),
    "owned evidence path",
  );
  const first = await load("release-receipt.json"),
    second = await load("reproduction-receipt.json");
  const fileHash = async (file) => {
    const hash = createHash("sha256");
    for await (const part of createReadStream(file)) {
      if (!Buffer.isBuffer(part))
        throw new Error("Unexpected hash stream chunk.");
      hash.update(part);
    }
    return hash.digest("hex");
  };
  requireFact(
    (await fileHash(path.join(root, "out/agency-demo-archive-v1.zip"))) ===
      first.zip_sha256 &&
      (await fileHash(
        path.join(root, "out/agency-demo-archive/qa/reproduction-v1.zip"),
      )) === first.zip_sha256 &&
      second.zip_sha256 === first.zip_sha256,
    "independently built ZIP identity",
  );
  const list = async (base, prefix = "") => {
    const result = [];
    for (const entry of await readdir(path.join(base, prefix), {
      withFileTypes: true,
    })) {
      requireFact(!entry.isSymbolicLink(), "linked payload entry");
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) result.push(...(await list(base, name)));
      else {
        requireFact(entry.isFile(), "nonregular payload");
        result.push(name);
      }
    }
    return result.sort();
  };
  const a = path.join(root, "out/agency-demo-archive/v1"),
    b = path.join(root, "out/agency-demo-archive/reproduction-v1");
  const names = await list(a);
  requireFact(
    JSON.stringify(names) === JSON.stringify(await list(b)) &&
      names.length === 2420,
    "two-build exact path set",
  );
  for (const name of names)
    requireFact(
      (await fileHash(path.join(a, name))) ===
        (await fileHash(path.join(b, name))),
      `two-build payload ${name}`,
    );
  const build = await load("task-13-build-v1.json"),
    rebuilt = await load("task-13-build.json"),
    imported = await load("task-16-import.json"),
    uploads = await load("task-17-upload-parity.json"),
    raster = await load("full-v1-pdf/render-report.json"),
    browser = await load("task-18-browser.json"),
    runtime = await load("task-18-runtime.json");
  requireFact(
    uploads.actual_production_uploads === 2400 &&
      browser.real_main_deals_browsed === 120 &&
      browser.families_downloaded === 48 &&
      browser.missing_original_fixture === 404 &&
      browser.tampered_original_fixture_rejected,
    "real API/browser coverage",
  );
  const target = await load("task-17-target.json");
  requireFact(/^[a-f0-9]{64}$/.test(target.container_id), "owned DB identity");
  const df = execFileSync(
    "docker",
    ["exec", target.container_id, "df", "-Pk", "/var/lib/postgresql"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  )
    .trim()
    .split(/\r?\n/)
    .at(-1)
    .trim()
    .split(/\s+/);
  const disk = await statfs(root, { bigint: true });
  const peaks = [
    build.process_max_rss_bytes,
    rebuilt.process_max_rss_bytes,
    first.process_max_rss_bytes,
    second.process_max_rss_bytes,
    imported.process_max_rss_bytes,
    uploads.process_max_rss_bytes,
    raster.process_max_rss_bytes,
    runtime.process_max_rss_bytes,
    browser.browser_driver_peak_rss_bytes,
    ...browser.chromium_process_peak_rss.map((p) => p.PeakWorkingSet64),
  ];
  requireFact(
    peaks.every((n) => Number.isSafeInteger(n) && n > 0),
    "measured process peaks",
  );
  const facts = {
    originals: build.original_bytes,
    expanded: build.expanded_bytes,
    peak: Math.max(...peaks),
    free: Number(disk.bavail * disk.bsize),
    dbFree: Number(df[3]) * 1024,
    sourceA: first.source_digest,
    sourceB: second.source_digest,
  };
  budgets(facts, caps);
  requireFact(
    build.documents === 2400 &&
      rebuilt.documents === 2400 &&
      build.pdf_pages === 3856 &&
      raster.pages === 3856 &&
      imported.transaction_elapsed_ms <= 300000,
    "counts/pages/transaction budget",
  );
  requireFact(
    (await load("task-18-access-cleanup.json")).dropped &&
      (await load("task-18-session-cleanup.json"))
        .existing_session_rows_preserved,
    "approved QA access cleanup",
  );
  const result = {
    approved: true,
    method:
      "Byte/hash verification of two independently executed full CLI builds and their actual measured receipts; this invocation does not pretend to rebuild cached files",
    zip_sha256: first.zip_sha256,
    source_digest: first.source_digest,
    compared_payload_files: names.length,
    identical_zip_digests: true,
    measured_resource_facts: facts,
    policy_caps: caps,
    pdf_pages: raster.pages,
    import_transaction_ms: imported.transaction_elapsed_ms,
    native_office_layout: "unverified",
    final_human_acceptance: "not implied",
  };
  await writeFile(output, JSON.stringify(result, null, 2) + "\n");
  console.log(
    "Two independent builds match; measured resource, import, API and browser gates pass.",
  );
}
