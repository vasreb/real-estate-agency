import { lstat, readFile, readdir, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { PDFDocument } from "pdf-lib";
import { compileCorpus } from "./compiler.js";
import {
  documentRecordSchema,
  stableJson,
  type DocumentRecord,
} from "./model.js";
import type { CompiledDocument } from "./registry.js";
import { recordFor, digestBytes, corpusDigest } from "./build.js";
import {
  assertNoLinkedAncestors,
  assertPortablePath,
  evidenceRoot,
  limits,
  ownedOutputPath,
  ownedEvidencePath,
  workspaceRoot,
} from "./policy.js";
import { renderPdf } from "./render/pdf.js";
import { renderDocx, validateDocx } from "./render/docx.js";
import { checksumText, payloadMetadata } from "./archive/manifest.js";

export async function validateOriginal(
  row: DocumentRecord,
  expected: CompiledDocument,
  bytes: Uint8Array,
): Promise<number> {
  const fail = (detail: string): never => {
    throw new Error(`${expected.key}: ${detail}`);
  };
  try {
    documentRecordSchema.parse(row);
  } catch {
    fail("invalid document metadata");
  }
  if (stableJson(row) !== stableJson(recordFor(expected, bytes)))
    fail("metadata, hash, date or length differs from expected record");
  if (expected.format === "pdf") {
    const reference = await renderPdf(expected.content);
    if (!Buffer.from(bytes).equals(Buffer.from(reference.bytes)))
      fail("original content differs from canonical PDF");
    const actualPages = (await PDFDocument.load(bytes)).getPageCount();
    if (actualPages !== reference.pages) fail("PDF page count differs");
    return actualPages;
  }
  await validateDocx(bytes, expected.content);
  if (!Buffer.from(bytes).equals(renderDocx(expected.content)))
    fail("original content differs from canonical DOCX");
  return 0;
}
export async function listPayload(root: string): Promise<string[]> {
  const names: string[] = [];
  async function visit(relative: string) {
    for (const entry of await readdir(path.join(root, relative), {
      withFileTypes: true,
    })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      assertPortablePath(name);
      if (entry.isSymbolicLink())
        throw new Error("Linked release entry refused.");
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile()) {
        names.push(name);
        if (names.length > limits.outer_entries)
          throw new Error("Release entry budget exceeded.");
      } else throw new Error("Nonregular release entry refused.");
    }
  }
  assertNoLinkedAncestors(root);
  await visit("");
  return names.sort();
}
export async function boundedRead(
  root: string,
  name: string,
  cap: number,
): Promise<Buffer> {
  assertPortablePath(name);
  const file = path.join(root, name);
  assertNoLinkedAncestors(file);
  const stat = await lstat(file);
  if (!stat.isFile() || stat.size > cap)
    throw new Error(`Invalid/oversize release entry: ${name}`);
  const bytes = await readFile(file);
  if (bytes.length !== stat.size || bytes.length > cap)
    throw new Error(`Changed release entry: ${name}`);
  return bytes;
}
export async function validateCorpus(input: string, evidence?: string) {
  const started = performance.now();
  const root = ownedOutputPath(input);
  const disk = await statfs(workspaceRoot, { bigint: true });
  if (disk.bavail * disk.bsize < BigInt(limits.free_disk_bytes))
    throw new Error("Insufficient validation disk headroom.");
  const corpus = compileCorpus();
  const data: unknown = JSON.parse(
    (
      await boundedRead(root, "manifest/documents.json", limits.json_bytes)
    ).toString("utf8"),
  );
  if (!Array.isArray(data) || data.length !== corpus.documents.length)
    throw new Error("Wrong original inventory size.");
  const rows = data.map((row) => documentRecordSchema.parse(row));
  let pages = 0;
  let originalBytes = 0;
  const hashes = new Map<string, string>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const doc = corpus.documents[i]!;
    if (row.path !== doc.path || hashes.has(row.path))
      throw new Error(`Wrong/duplicate inventory path: ${doc.key}`);
    const bytes = await boundedRead(
      root,
      row.path,
      limits.original_bytes_exclusive - 1,
    );
    pages += await validateOriginal(row, doc, bytes);
    originalBytes += bytes.length;
    hashes.set(row.path, digestBytes(bytes));
    if (
      pages > limits.pdf_pages ||
      originalBytes > limits.originals_bytes ||
      process.memoryUsage().rss > limits.rss_bytes
    )
      throw new Error("Validation resource budget exceeded.");
  }
  const expectedPayload = payloadMetadata(corpus, rows, pages);
  let expanded = originalBytes;
  for (const [name, expected] of expectedPayload) {
    const bytes = await boundedRead(root, name, limits.json_bytes);
    if (!bytes.equals(expected))
      throw new Error(`Canonical public payload mismatch: ${name}`);
    expanded += bytes.length;
    hashes.set(name, digestBytes(bytes));
  }
  const checksums = await boundedRead(
    root,
    "checksums.sha256",
    limits.json_bytes,
  );
  expanded += checksums.length;
  if (checksums.toString("utf8") !== checksumText(hashes))
    throw new Error("Checksum manifest mismatch.");
  const expectedSet = [...hashes.keys(), "checksums.sha256"].sort();
  if (stableJson(await listPayload(root)) !== stableJson(expectedSet))
    throw new Error("Release has missing/extra files.");
  if (
    expanded > limits.expanded_bytes ||
    process.resourceUsage().maxRSS * 1024 > limits.rss_bytes
  )
    throw new Error("Expanded/peak validation budget exceeded.");
  const result = {
    source_digest: corpusDigest(corpus),
    documents: rows.length,
    pdf: 2160,
    docx: 240,
    pages,
    original_bytes: originalBytes,
    expanded_bytes: expanded,
    structural_and_canonical_originals: true,
    exact_payload_and_checksums: true,
    elapsed_ms: Math.round(performance.now() - started),
    process_max_rss_bytes: process.resourceUsage().maxRSS * 1024,
    native_office_layout: "unverified",
    release_accepted: false,
  };
  await writeFile(
    evidence
      ? ownedEvidencePath(evidence)
      : path.join(evidenceRoot, "task-13-validation.json"),
    stableJson(result),
  );
  return result;
}
