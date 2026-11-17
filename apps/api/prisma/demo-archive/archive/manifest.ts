import type { CompiledCorpus } from "../compiler.js";
import { corpus, stableJson, type DocumentRecord } from "../model.js";
import { sources, rejectedClaims } from "../content/sources.js";
import { limits } from "../policy.js";
import { variantAudit } from "../qa/variants.js";
import { createHash } from "node:crypto";

export function checksumText(hashes: ReadonlyMap<string, string>): string {
  return [...hashes]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, digest]) => `${digest}  ${name}\n`)
    .join("");
}
export function payloadMetadata(
  compiled: CompiledCorpus,
  rows: DocumentRecord[],
  pages: number,
): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const json = (name: string, value: unknown) => {
    const bytes = Buffer.from(stableJson(value));
    if (bytes.length > limits.json_bytes)
      throw new Error(`JSON budget exceeded: ${name}`);
    files.set(name, bytes);
  };
  for (const [key, value] of Object.entries(compiled.entities))
    json(`entities/${key.replaceAll("_", "-")}.json`, value);
  json("manifest/documents.json", rows);
  json("manifest/actors.json", {
    actors: compiled.actors,
    principals: compiled.principals,
  });
  json("manifest/staff.json", compiled.staff);
  json("manifest/property-profiles.json", compiled.property_profiles);
  json("manifest/scenario-timelines.json", compiled.scenario_timelines);
  json("manifest/logical-instruments.json", compiled.logical_instruments);
  json("manifest/sources-and-licenses.json", {
    sources,
    rejected_claims: rejectedClaims,
    original_prose: true,
    licensed_forms_reproduced: false,
  });
  json("manifest/release.json", {
    ...corpus,
    source_digest: createHash("sha256")
      .update(stableJson(compiled))
      .digest("hex"),
    mapping_version: 1,
    integrity:
      "Externally pin the complete ZIP SHA-256. Checksums are not signatures or proof of receipt authenticity.",
  });
  const variants = variantAudit(compiled);
  json("reports/corpus-summary.json", {
    counts: corpus.counts,
    cohorts: Object.fromEntries(
      [...new Set(compiled.scenario_timelines.map((c) => c.cohort))].map(
        (cohort) => [
          cohort,
          {
            matters: compiled.scenario_timelines.filter(
              (c) => c.cohort === cohort,
            ).length,
            documents: compiled.documents.filter((d) =>
              compiled.scenario_timelines.some(
                (c) => c.cohort === cohort && c.deal_id === d.metadata.deal_id,
              ),
            ).length,
          },
        ],
      ),
    ),
    logical_instruments: compiled.logical_instruments.length,
    distinct_original_hashes: new Set(rows.map((r) => r.sha256)).size,
    operative_diversity_screen: variants,
  });
  json("reports/integrity.json", {
    original_records: rows.length,
    metadata_graph: "canonical-compiled",
    original_render: "deterministic",
    production_api_acceptance: "requires external task-17 receipt",
    original_pdf_raster: "requires external raster receipt",
    final_release: "requires external tasks-17-20 and F1-F4 acceptance",
  });
  json("reports/resource-budget.json", {
    policy_caps: limits,
    original_bytes: rows.reduce((n, r) => n + r.byte_length, 0),
    largest_original_bytes: Math.max(...rows.map((r) => r.byte_length)),
    pdf_pages: pages,
    runtime_measurements:
      "External evidence only; not deterministic archive content",
  });
  json("reports/limitations.json", {
    synthetic_only: true,
    not_for_execution: true,
    native_office_layout: "unverified",
    verified_real_signatures: false,
    official_forms_reproduced: false,
    statutory_service_pack: "not legally complete",
    interface_language:
      "Existing Russian interface unchanged; archive content is English",
    application_race:
      "Import requires the application offline; concurrent application writes are unsupported",
    receipt_authenticity: "out of scope",
  });
  files.set(
    "README.md",
    Buffer.from(
      `# Northbridge & Vale Residential — synthetic archive\n\n${corpus.notice}\n\n120 fictional England/London matters, 96 properties, 80 instructing principals, 2,400 originals (2,160 PDF / 240 DOCX), 240 distinct amendments. Dates are historical synthetic events, not assertions about real people, residents, titles or transactions.\n\n## Contents and mapping\n\nPublic entities are under entities/. Users contain only id/email; there are no passwords, password hashes or sessions. manifest/documents.json contains strict mapped existing API metadata separately from generator-only family, event, instrument, provenance, path, length and SHA-256. Actor and property detail remains manifest-only. No schema extension is needed. created_at is historical ingestion, not signature date. A household has separate named signatories; the imported client is the instructing seller/landlord.\n\n## Integrity and safe reconstruction\n\nchecksums.sha256 covers every other payload file, not itself. Obtain the expected SHA-256 of the entire ZIP from the separate release receipt, not from inside an untrusted ZIP. Matching hashes detect corruption under that external pin; they do not prove who issued the receipt. No cryptographic-signature claim is made.\n\nUse only the opt-in demo-archive tooling and explicitly confirmed disposable loopback database agency_demo_archive on port 55433. Never point baseline reset/seed helpers at this archive database. Import requires the application stopped, process-only passwords for missing accounts, a pinned digest and exact conflict comparison. No existing account credential is rotated. Existing databases, remote hosts and production flags are forbidden. Consult the source runbook and actual downstream acceptance receipts before executing an import; package creation alone is not API/browser/import acceptance.\n\n## Limitations\n\nEvery signature is simulated. No official TA6/TA7/EPC/EICR/CP12/Form 4A, valid credential, real bank instruction, licensed template or official seal is reproduced. Synthetic source/delivery summaries are not a legally complete statutory service pack. Native Microsoft Word/LibreOffice pagination, font rendering and layout are UNVERIFIED; OOXML package/content checks are not native layout proof. Existing Russian UI is intentionally unchanged.\n\n## Reproducibility\n\nCorpus version 1; seed ${corpus.seed}; as-of ${corpus.as_of}. Generation is offline. ZIP timestamps and entry order are fixed. Runtime resource/DB/API/browser evidence is external and does not change deterministic payload bytes. Final release acceptance requires the separate downstream gates; this README is not a substitute for their results.\n`,
      "utf8",
    ),
  );
  return files;
}
