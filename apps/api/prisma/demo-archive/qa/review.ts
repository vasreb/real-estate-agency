import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { stableJson } from "../model.js";
import { textOf } from "../content/context.js";
import type { CompiledDocument } from "../registry.js";
import { evidenceRoot, ownedOutputPath } from "../policy.js";
import { compileCorpus } from "../compiler.js";
import { selectPilot } from "./pilot.js";
import { variantAudit } from "./variants.js";
import { makeProfiles } from "../profiles/agency.js";
import { compileAmendmentInstruments } from "../scenarios/amendments.js";
import { makeContentContext } from "../content/context.js";
import { repairFor } from "../content/property-management/repair.js";
import { evidenceFacts } from "../content/property-management/facts.js";

export async function prepareCurrentReview(label: string) {
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Invalid review label.");
  const corpus = compileCorpus();
  const selection = selectPilot(corpus);
  const profiles = makeProfiles();
  const amendments = compileAmendmentInstruments(
    corpus.scenario_timelines,
    profiles,
  );
  const target = path.join(evidenceRoot, label);
  await mkdir(target);
  const packs = selection.matter_keys.map((key) => {
    const matter = corpus.scenario_timelines.find((c) => c.key === key)!;
    const ctx = makeContentContext(
      profiles,
      matter,
      matter.slots[0]!,
      amendments,
    );
    const docs = selection.documents
      .filter((d) => d.metadata.deal_id === matter.deal_id)
      .sort(
        (a, b) =>
          a.content.date.localeCompare(b.content.date) ||
          a.key.localeCompare(b.key),
      );
    const lines = docs.map(
      (d) =>
        `- ${d.metadata.document_date} ${d.key.split("/").at(-1)} ${d.family} ${d.metadata.status}: ${d.purpose}`,
    );
    const changes = amendments
      .filter((a) => a.deal_key === key)
      .map(
        (a) =>
          `- ${a.clause_key} / ${a.status} / ${a.effective_from} / parent ${a.contract_key ?? "unresolved"}: ${a.old_term} -> ${a.new_term}`,
      );
    return `## ${key} / ${matter.cohort}\n${ctx.client.name} -> ${ctx.counterparty.name}; ${ctx.property.address}\n${ctx.home.category}, ${ctx.home.furnishing}, ${ctx.home.heating}; ${ctx.home.area_m2}m2; ${ctx.home.bedrooms} bed/${ctx.home.bathrooms} bath. Possession: ${stableJson(matter.possession).trim()}\nPrices/fees: ${stableJson(ctx.financial_facts).trim()}\nRepair: ${matter.slots.some((s) => s.family === "R16") ? stableJson(repairFor(ctx)).trim() : "none authorised in held pack"}\nSettlement comparison: ${matter.cohort === "ended-rental" ? stableJson(evidenceFacts(ctx)).trim() : "not an ended rental"}\n${lines.join("\n")}\nChanges:\n${changes.join("\n")}\n`;
  });
  await writeFile(path.join(target, "packs.md"), packs.join("\n"));
  const families = [
    ...new Set(selection.documents.map((d) => d.family)),
  ].sort();
  for (const prefix of ["S", "R", "C"]) {
    const bodies = families
      .filter((f) => f.startsWith(prefix))
      .map((family) => {
        const doc = selection.documents.find((d) => d.family === family)!;
        return `## ${family} / ${doc.key}\n${textOf({ ...doc.content, blocks: doc.content.blocks.slice(3) })}\n`;
      });
    await writeFile(
      path.join(target, `${prefix}-exemplars.md`),
      bodies.join("\n"),
    );
  }
  await writeFile(
    path.join(target, "variants.json"),
    stableJson(variantAudit(corpus)),
  );
  await writeFile(
    path.join(target, "identity.json"),
    stableJson({
      source_digest: createHash("sha256")
        .update(stableJson(corpus))
        .digest("hex"),
      reviewed: false,
      matters: selection.matter_keys,
      families,
    }),
  );
}

/** Review material only: never turns extracted text into a manual approval. */
export async function preparePackReview(input: string, label: string) {
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Invalid review label.");
  const root = ownedOutputPath(input);
  const docs = JSON.parse(
    await readFile(path.join(root, "canonical-documents.json"), "utf8"),
  ) as CompiledDocument[];
  const pilot = JSON.parse(
    await readFile(path.join(root, "pilot-manifest.json"), "utf8"),
  ) as { source_digest: string; selection: { matter_keys: string[] } };
  const target = path.join(evidenceRoot, label);
  await mkdir(target); // fresh review materials only
  const index = [];
  for (const key of pilot.selection.matter_keys) {
    const pack = docs.filter((d) => d.key.startsWith(`${key}/`));
    const body = pack
      .map(
        (d) =>
          `## ${d.key} / ${d.family} / ${d.metadata.document_date}\nPurpose: ${d.purpose}\nOriginal: ${d.path}\nParent: ${d.metadata.parent_document_id ?? "none"}\nState: ${d.metadata.status}\n\n${textOf(d.content)}\n`,
      )
      .join("\n");
    const name = `${key.replaceAll("/", "-")}.md`;
    await writeFile(path.join(target, name), body, { flag: "wx" });
    index.push({
      matter: key,
      documents: pack.length,
      families: [...new Set(pack.map((d) => d.family))],
      file: name,
      sha256: createHash("sha256").update(body).digest("hex"),
    });
  }
  await writeFile(
    path.join(target, "index.json"),
    stableJson({
      source_digest: pilot.source_digest,
      status: "prepared-not-reviewed",
      packs: index,
    }),
  );
}
