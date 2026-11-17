import { createHash } from "node:crypto";
import { mkdir, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { PDFDocument } from "pdf-lib";
import { compileCorpus, type CompiledCorpus } from "../compiler.js";
import { stableJson } from "../model.js";
import {
  evidenceRoot,
  limits,
  ownedOutputPath,
  workspaceRoot,
} from "../policy.js";
import { makeProfiles } from "../profiles/agency.js";
import { compileAmendmentInstruments } from "../scenarios/amendments.js";
import { cohorts } from "../scenarios/cohorts.js";
import { authorDocument } from "../registry.js";
import {
  makeContentContext,
  textOf,
  validateAuthored,
  type CaseDocument,
  type ContentContext,
} from "../content/context.js";
import { validateManagementDocument } from "../content/property-management/index.js";
import { renderPdf } from "../render/pdf.js";
import { renderDocx, validateDocx } from "../render/docx.js";
import { recordScenario } from "./evidence.js";

export function selectPilot(corpus: CompiledCorpus) {
  const profiles = makeProfiles();
  const instruments = compileAmendmentInstruments(
    corpus.scenario_timelines,
    profiles,
  );
  const keys = new Set<string>();
  for (const cohort of cohorts)
    corpus.scenario_timelines
      .filter((c) => c.cohort === cohort.key)
      .slice(0, 2)
      .forEach((c) => keys.add(c.key));
  const addDoc = (key: string) => {
    const doc = corpus.documents.find((d) => d.key === key)!;
    keys.add(
      corpus.scenario_timelines.find((c) => c.deal_id === doc.metadata.deal_id)!
        .key,
    );
  };
  for (const family of new Set(corpus.documents.map((d) => d.family)))
    addDoc(corpus.documents.find((d) => d.family === family)!.key);
  for (const reason of new Set(instruments.map((a) => a.clause_key)))
    addDoc(instruments.find((a) => a.clause_key === reason)!.key);
  for (const state of ["signed", "draft", "unknown"] as const)
    addDoc(instruments.find((a) => a.status === state)!.key);
  instruments.filter((a) => !a.contract_key).forEach((a) => addDoc(a.key));
  const inventory = corpus.documents
    .filter((d) => d.family === "R11")
    .sort((a, b) => textOf(b.content).length - textOf(a.content).length)[0];
  if (inventory) addDoc(inventory.key);
  for (const issuer of new Set(corpus.documents.map((d) => d.content.issuer)))
    addDoc(corpus.documents.find((d) => d.content.issuer === issuer)!.key);
  // Review the actual handoff too, not merely two unrelated examples per cohort.
  for (const type of ["rental", "sale"]) {
    const later = corpus.scenario_timelines.find(
      (c) =>
        c.sequence === 2 &&
        corpus.entities.deals.some(
          (d) => d.id === c.deal_id && d.type === type,
        ),
    );
    if (later) {
      keys.add(later.key);
      keys.add(
        corpus.scenario_timelines.find(
          (c) => c.property_id === later.property_id && c.sequence === 1,
        )!.key,
      );
    }
  }
  const selectedMatters = corpus.scenario_timelines.filter((c) =>
    keys.has(c.key),
  );
  const documents = corpus.documents.filter((d) =>
    selectedMatters.some((c) => c.deal_id === d.metadata.deal_id),
  );
  const selectedInstruments = instruments.filter((a) => keys.has(a.deal_key));
  return {
    matter_keys: [...keys].sort(),
    documents,
    families: [...new Set(documents.map((d) => d.family))].sort(),
    amendment_reasons: [
      ...new Set(selectedInstruments.map((a) => a.clause_key)),
    ].sort(),
    states: [
      ...new Set([
        ...selectedInstruments.map((a) => a.status),
        ...(selectedInstruments.some((a) => !a.contract_key)
          ? ["unresolved"]
          : []),
      ]),
    ].sort(),
    cohorts: Object.fromEntries(
      cohorts.map((cohort) => [
        cohort.key,
        selectedMatters.filter((c) => c.cohort === cohort.key).length,
      ]),
    ),
  };
}
export function validatePilotDocument(
  doc: CaseDocument,
  ctx: ContentContext,
): void {
  validateAuthored(doc, ctx);
  if (doc.evidence_facts) validateManagementDocument(doc, ctx);
  if (ctx.amendment) {
    const text = textOf(doc);
    for (const term of [
      ctx.amendment.old_term,
      ctx.amendment.new_term,
      ctx.amendment.reason,
      ctx.amendment.base_agreement.number,
      ctx.amendment.effective_from,
    ])
      if (!text.includes(term))
        throw new Error(
          "Generic addendum without complete operative term/base/reason/date.",
        );
  }
  if (stableJson(doc) !== stableJson(authorDocument(ctx)))
    throw new Error(
      "Contradictory or non-canonical authored condition/amount/party content.",
    );
}

export async function buildPilot(output: string): Promise<void> {
  const start = performance.now();
  const target = ownedOutputPath(output);
  const disk = await statfs(workspaceRoot, { bigint: true });
  if (disk.bavail * disk.bsize < BigInt(limits.free_disk_bytes))
    throw new Error("Insufficient worktree disk for pilot.");
  const corpus = compileCorpus();
  const selection = selectPilot(corpus);
  const profiles = makeProfiles();
  const amendments = compileAmendmentInstruments(
    corpus.scenario_timelines,
    profiles,
  );
  const sourceDigest = createHash("sha256")
    .update(stableJson(corpus))
    .digest("hex");
  await mkdir(path.dirname(target), { recursive: true });
  await mkdir(target); // refuse pre-existing output, never overwrite unknown files
  const originals = [];
  let totalBytes = 0;
  let pages = 0;
  let sampledRss = process.memoryUsage().rss;
  for (const doc of selection.documents) {
    try {
      const matter = corpus.scenario_timelines.find(
        (c) => c.deal_id === doc.metadata.deal_id,
      )!;
      const ctx = makeContentContext(
        profiles,
        matter,
        matter.slots.find((s) => s.key === doc.key)!,
        amendments,
      );
      validatePilotDocument(doc.content, ctx);
      let bytes: Uint8Array;
      let pageCount: number | null = null;
      if (doc.format === "pdf") {
        const result = await renderPdf(doc.content);
        bytes = result.bytes;
        pageCount = result.pages;
        if ((await PDFDocument.load(bytes)).getPageCount() !== pageCount)
          throw new Error("Pilot PDF parser mismatch.");
        pages += pageCount;
      } else {
        bytes = renderDocx(doc.content);
        await validateDocx(bytes, doc.content);
      }
      totalBytes += bytes.length;
      sampledRss = Math.max(sampledRss, process.memoryUsage().rss);
      if (
        bytes.length >= limits.original_bytes_exclusive ||
        totalBytes > 64 * 1024 ** 2 ||
        sampledRss > limits.rss_bytes
      )
        throw new Error("Pilot size/memory policy exceeded.");
      const file = path.join(target, doc.path);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes, { flag: "wx" });
      originals.push({
        key: doc.key,
        path: doc.path,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        byte_length: bytes.length,
        pdf_pages: pageCount,
      });
    } catch (error) {
      recordScenario(12, "failure", {
        phase: "pilot-build",
        document_key: doc.key,
        diagnostic:
          error instanceof Error ? error.message : "Unknown render failure",
        source_digest: sourceDigest,
        scale_out_allowed: false,
      });
      throw error;
    }
  }
  const report = {
    source_digest: sourceDigest,
    selection: {
      ...selection,
      documents: selection.documents.map((d) => d.key),
    },
    originals,
    total_original_bytes: totalBytes,
    pdf_pages: pages,
    quality_gate: {
      canonical_checks: true,
      independent_all_page_raster: "pending",
      complete_pack_agent_review: "pending",
      scale_out_allowed: false,
    },
    native_office_layout: "unverified",
  };
  await writeFile(
    path.join(target, "pilot-manifest.json"),
    stableJson(report),
    { flag: "wx" },
  );
  await writeFile(
    path.join(target, "canonical-documents.json"),
    stableJson(selection.documents),
    { flag: "wx" },
  );
  const receipt = {
    output_relative: path
      .relative(workspaceRoot, target)
      .split(path.sep)
      .join("/"),
    stage: "pilot rendered; not yet approved for full build",
    source_digest: sourceDigest,
    matters: selection.matter_keys.length,
    documents: originals.length,
    elapsed_ms: Math.round(performance.now() - start),
    sampled_peak_rss_bytes: sampledRss,
    process_max_rss_bytes: process.resourceUsage().maxRSS * 1024,
    free_disk_bytes_at_start: Number(disk.bavail * disk.bsize),
    total_original_bytes: totalBytes,
    pdf_pages: pages,
    scale_out_allowed: false,
  };
  if (receipt.process_max_rss_bytes > limits.rss_bytes)
    throw new Error("Measured pilot peak RSS exceeds the release policy.");
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(
    path.join(evidenceRoot, "task-12-build.json"),
    stableJson(receipt),
  );
}
