import { performance } from "node:perf_hooks";
import { compileCorpus } from "../compiler.js";
import { corpusDigest, digestBytes, recordFor } from "../build.js";
import { validateOriginal } from "../validate.js";
import { checksumText, payloadMetadata } from "./manifest.js";
import { scanArchive } from "./read.js";
import { stableJson, type DocumentRecord } from "../model.js";
import { limits } from "../policy.js";

/** All verification is sequential/read-only; no extraction and no DB import. */
export async function verifyArchive(input: string, expectedSha256: string) {
  const start = performance.now();
  const corpus = compileCorpus();
  const byPath = new Map(corpus.documents.map((doc) => [doc.path, doc]));
  const rows = new Map<string, DocumentRecord>();
  const other = new Map<string, Buffer>();
  const hashes = new Map<string, string>();
  let pages = 0;
  const scan = await scanArchive(input, expectedSha256, async (name, bytes) => {
    const expected = byPath.get(name);
    if (expected) {
      const row = recordFor(expected, bytes);
      pages += await validateOriginal(row, expected, bytes);
      rows.set(expected.key, row);
    } else {
      if (
        name.startsWith("documents/") ||
        !/^(?:README\.md|checksums\.sha256|(?:entities|manifest|reports)\/[a-z-]+\.json)$/.test(
          name,
        )
      )
        throw new Error("Unexpected archive payload entry.");
      other.set(name, bytes);
    }
    if (name !== "checksums.sha256") hashes.set(name, digestBytes(bytes));
    if (pages > limits.pdf_pages)
      throw new Error("Archive PDF page budget exceeded.");
  });
  if (rows.size !== corpus.documents.length)
    throw new Error("Archive has missing originals.");
  const ordered = corpus.documents.map((doc) => rows.get(doc.key)!);
  const payload = payloadMetadata(corpus, ordered, pages);
  if (other.size !== payload.size + 1)
    throw new Error("Archive has missing/extra public metadata.");
  for (const [name, bytes] of payload)
    if (!other.get(name)?.equals(bytes))
      throw new Error(
        `Archive canonical metadata/secret-field mismatch: ${name}`,
      );
  if (other.get("checksums.sha256")?.toString("utf8") !== checksumText(hashes))
    throw new Error("Archive checksum manifest mismatch.");
  const rss = process.resourceUsage().maxRSS * 1024;
  if (rss > limits.rss_bytes)
    throw new Error("Archive validation peak RSS budget exceeded.");
  return {
    corpus,
    documents: ordered,
    receipt: {
      ...scan,
      zip_sha256: expectedSha256,
      source_digest: corpusDigest(corpus),
      documents: ordered.length,
      pages,
      original_bytes: ordered.reduce((n, row) => n + row.byte_length, 0),
      elapsed_ms: Math.round(performance.now() - start),
      process_max_rss_bytes: rss,
      database_calls: 0,
      phase: "offline-archive-preflight",
      database_target_and_conflicts: "not checked by offline preflight",
      native_office_layout: "unverified",
      verified_public_payload_digest: digestBytes(
        stableJson([...hashes].sort()),
      ),
    },
  };
}
