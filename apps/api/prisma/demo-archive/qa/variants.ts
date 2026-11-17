import { createHash } from "node:crypto";
import type { CompiledCorpus } from "../compiler.js";
import { textOf } from "../content/context.js";

/** Conservative screening: excludes names, IDs, money, dates and opening/execution.
 * Passing is evidence of different operative text, not a semantic/manual review. */
export function variantAudit(corpus: CompiledCorpus) {
  const identities = [
    ...corpus.entities.clients.map((c) => c.name),
    ...corpus.entities.properties.map((p) => p.address),
    ...corpus.actors.map((a) => a.name),
    ...corpus.staff.map((s) => s.display_name),
  ].sort((a, b) => b.length - a.length);
  const groups = new Map<string, Map<string, string[]>>();
  for (const doc of corpus.documents) {
    let text = textOf({
      ...doc.content,
      title: "",
      blocks: doc.content.blocks.slice(3).filter((b) => b.kind !== "execution"),
    });
    for (const name of identities) text = text.split(name).join("<identity>");
    text = text
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi, "<contact>")
      .replace(/(?:deal|property|actor|principal)\/[^\s;,]+/gi, "<key>")
      .replace(/DEMO-[A-Z0-9/-]+/gi, "<reference>")
      .replace(/(?:GBP|£)\d[\d,.]*/g, "<amount>")
      .replace(/\b\d+(?:[.,:/-]\d+)*\b/g, "#")
      .replace(/\s+/g, " ")
      .trim();
    const digest = createHash("sha256").update(text).digest("hex");
    const family = groups.get(doc.family) ?? new Map<string, string[]>();
    family.set(digest, [...(family.get(digest) ?? []), doc.key]);
    groups.set(doc.family, family);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([family, signatures]) => ({
      family,
      occurrences: [...signatures.values()].reduce(
        (n, keys) => n + keys.length,
        0,
      ),
      text_variants: signatures.size,
      representatives: [...signatures.values()].map((keys) => keys[0]!),
      identical_operative_groups: [...signatures.values()].filter(
        (keys) => keys.length > 1,
      ),
    }));
}
