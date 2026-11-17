import { createHash } from "node:crypto";
import { mkdir, readFile, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { PDFDocument } from "pdf-lib";
import { compileCorpus, type CompiledCorpus } from "./compiler.js";
import {
  documentRecordSchema,
  stableJson,
  type DocumentRecord,
} from "./model.js";
import {
  evidenceRoot,
  limits,
  ownedOutputPath,
  workspaceRoot,
} from "./policy.js";
import type { CompiledDocument } from "./registry.js";
import { renderPdf } from "./render/pdf.js";
import { renderDocx, validateDocx } from "./render/docx.js";
import { variantAudit } from "./qa/variants.js";
import { payloadMetadata, checksumText } from "./archive/manifest.js";

export const digestBytes = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export const corpusDigest = (corpus: CompiledCorpus) =>
  digestBytes(stableJson(corpus));
export function assertPilotApproval(
  corpus: CompiledCorpus,
  value: unknown,
): void {
  const approval = value as Record<string, unknown> | null;
  if (
    !approval ||
    approval.source_digest !== corpusDigest(corpus) ||
    approval.scale_out_allowed !== true ||
    approval.families_reviewed !== 48 ||
    approval.amendment_reasons_reviewed !== 12 ||
    typeof approval.matters_reviewed !== "number" ||
    approval.matters_reviewed < 18
  )
    throw new Error(
      "Current source lacks an accepted representative pilot gate.",
    );
}
export function recordFor(
  doc: CompiledDocument,
  bytes: Uint8Array,
): DocumentRecord {
  return documentRecordSchema.parse({
    mapped: doc.metadata,
    key: doc.key,
    family: doc.family,
    instrument_key: doc.instrument_key,
    event_key: doc.event_key,
    purpose: doc.purpose,
    author_role: doc.author_role,
    recipient_actor_keys: doc.recipient_actor_keys,
    path: doc.path,
    byte_length: bytes.length,
    sha256: digestBytes(bytes),
    unresolved_parent_reason: doc.unresolved_parent_reason,
    revises_instrument_key: doc.revises_instrument_key,
    provenance: doc.provenance,
  });
}
export async function buildCorpus(output: string): Promise<void> {
  const started = performance.now();
  const target = ownedOutputPath(output);
  const disk = await statfs(workspaceRoot, { bigint: true });
  if (disk.bavail * disk.bsize < BigInt(limits.free_disk_bytes))
    throw new Error("Insufficient disk for corpus build.");
  const corpus = compileCorpus();
  assertPilotApproval(
    corpus,
    JSON.parse(
      await readFile(path.join(evidenceRoot, "task-12-approval.json"), "utf8"),
    ),
  );
  const variants = variantAudit(corpus);
  if (variants.some((r) => r.occurrences >= 6 && r.text_variants < 3))
    throw new Error("Insufficient operative diversity.");
  await mkdir(path.dirname(target), { recursive: true });
  await mkdir(target);
  const rows: DocumentRecord[] = [];
  let total = 0;
  let pages = 0;
  for (const doc of corpus.documents) {
    let bytes: Uint8Array;
    if (doc.format === "pdf") {
      const rendered = await renderPdf(doc.content);
      bytes = rendered.bytes;
      if ((await PDFDocument.load(bytes)).getPageCount() !== rendered.pages)
        throw new Error(`PDF structure mismatch: ${doc.key}`);
      pages += rendered.pages;
    } else {
      bytes = renderDocx(doc.content);
      await validateDocx(bytes, doc.content);
    }
    total += bytes.length;
    if (
      bytes.length >= limits.original_bytes_exclusive ||
      total > limits.originals_bytes ||
      pages > limits.pdf_pages ||
      process.memoryUsage().rss > limits.rss_bytes
    )
      throw new Error(`Build budget exceeded: ${doc.key}`);
    const file = path.join(target, doc.path);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes, { flag: "wx" });
    rows.push(recordFor(doc, bytes));
  }
  const payload = payloadMetadata(corpus, rows, pages);
  const hashes = new Map(rows.map((r) => [r.path, r.sha256]));
  let expanded = total;
  for (const [name, bytes] of payload) {
    expanded += bytes.length;
    hashes.set(name, digestBytes(bytes));
    const file = path.join(target, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes, { flag: "wx" });
  }
  const checksums = checksumText(hashes);
  expanded += Buffer.byteLength(checksums);
  if (
    expanded > limits.expanded_bytes ||
    hashes.size + 1 > limits.outer_entries ||
    process.resourceUsage().maxRSS * 1024 > limits.rss_bytes
  )
    throw new Error("Full payload/peak memory budget exceeded.");
  await writeFile(path.join(target, "checksums.sha256"), checksums, {
    flag: "wx",
  });
  await writeFile(
    path.join(evidenceRoot, "task-13-build.json"),
    stableJson({
      source_digest: corpusDigest(corpus),
      output_relative: path
        .relative(workspaceRoot, target)
        .split(path.sep)
        .join("/"),
      documents: rows.length,
      pdf: rows.filter((r) => r.mapped.mime_type === "application/pdf").length,
      docx: rows.filter((r) => r.mapped.mime_type !== "application/pdf").length,
      original_bytes: total,
      expanded_bytes: expanded,
      pdf_pages: pages,
      elapsed_ms: Math.round(performance.now() - started),
      process_max_rss_bytes: process.resourceUsage().maxRSS * 1024,
      free_disk_bytes_at_start: Number(disk.bavail * disk.bsize),
      native_office_layout: "unverified",
      release_accepted: false,
    }),
  );
}
