import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { documentMetadataSchema } from "@agency/contracts";
import { corpus, entitiesSchema, stableId, stableJson } from "./model.js";
import { ownedOutputPath, assertPortablePath } from "./policy.js";
import { makeProfiles } from "./profiles/agency.js";
import { teamKeys } from "./profiles/staff.js";
import { compileCases } from "./scenarios/events.js";
import { compileAmendmentInstruments } from "./scenarios/amendments.js";
import { makeContentContext, validateAuthored } from "./content/context.js";
import { validateManagementDocument } from "./content/property-management/index.js";
import {
  authorDocument,
  classification,
  DOCX_MIME,
  PDF_MIME,
  type CompiledDocument,
} from "./registry.js";

const hashKey = (key: string) =>
  createHash("sha256").update(`${corpus.seed}/format/${key}`).digest("hex");
export function compileCorpus() {
  const profiles = makeProfiles();
  const cases = compileCases(profiles);
  const amendments = compileAmendmentInstruments(cases, profiles);
  const nonAmendments = cases
    .flatMap((c) => c.slots.filter((s) => !s.amendment))
    .sort((a, b) => (hashKey(a.key) < hashKey(b.key) ? -1 : 1));
  const docxKeys = new Set(nonAmendments.slice(0, 220).map((s) => s.key));
  for (const amendment of amendments.filter((a) => a.status === "draft"))
    docxKeys.add(amendment.key);
  const documents: CompiledDocument[] = [];
  for (const matter of cases)
    for (const slot of matter.slots) {
      const ctx = makeContentContext(profiles, matter, slot, amendments);
      const content = authorDocument(ctx);
      validateAuthored(content, ctx);
      if (content.evidence_facts) validateManagementDocument(content, ctx);
      const format = docxKeys.has(slot.key) ? "docx" : "pdf";
      const teamKey =
        teamKeys[
          profiles.entities.teams.findIndex((t) => t.id === ctx.deal.team_id)
        ];
      if (!teamKey) throw new Error("Unresolved owning team.");
      const fileName = `${slot.key.replaceAll("/", "-")}.${format}`;
      const execution = content.blocks.find((b) => b.kind === "execution");
      const status =
        ctx.amendment?.status ??
        (execution?.kind === "execution"
          ? execution.state === "simulated-signed"
            ? "signed"
            : execution.state
          : "unknown");
      const revision =
        slot.family === "S08" &&
        (slot.purpose.includes("revised") || slot.purpose.includes("revision"));
      const earlier = revision
        ? documents.find(
            (d) => d.metadata.deal_id === matter.deal_id && d.family === "S08",
          )
        : undefined;
      documents.push({
        key: slot.key,
        family: slot.family,
        instrument_key: slot.key,
        event_key: slot.event_key,
        purpose: slot.purpose,
        author_role: slot.author_role,
        recipient_actor_keys: [...slot.recipient_actor_keys],
        format,
        path: `documents/${teamKey}/${matter.key.replaceAll("/", "-")}/${fileName}`,
        metadata: documentMetadataSchema.parse({
          id: stableId(`document/${slot.key}`),
          deal_id: matter.deal_id,
          parent_document_id: ctx.amendment?.contract_key
            ? stableId(`document/${ctx.amendment.contract_key}`)
            : null,
          type: classification(slot.family),
          title: content.title,
          document_number: `DEMO-${slot.key.replaceAll("/", "-").toUpperCase()}`,
          document_date: ctx.event.date,
          effective_from: ctx.amendment?.effective_from ?? null,
          status,
          file_name: fileName,
          mime_type: format === "pdf" ? PDF_MIME : DOCX_MIME,
          created_at: matter.ingest_at,
        }),
        unresolved_parent_reason: ctx.amendment?.unresolved_reason ?? null,
        revises_instrument_key: earlier?.instrument_key ?? null,
        provenance: {
          classification: "original-synthetic",
          source_keys: content.source_keys,
        },
        content,
      });
    }
  const compiled = {
    corpus: { ...corpus },
    entities: profiles.entities,
    actors: profiles.actors,
    principals: profiles.principals,
    staff: profiles.staff,
    property_profiles: profiles.properties,
    scenario_timelines: cases,
    logical_instruments: documents.map((d) => ({
      key: d.instrument_key,
      document_keys: [d.key],
      revises_instrument_key: d.revises_instrument_key,
    })),
    documents,
  };
  validateCompiledCorpus(compiled);
  return compiled;
}
export type CompiledCorpus = ReturnType<typeof compileCorpus>;

export function validateCompiledCorpus(compiled: CompiledCorpus): void {
  entitiesSchema.parse(compiled.entities);
  if (
    compiled.documents.length !== 2400 ||
    compiled.entities.deals.length !== 120
  )
    throw new Error("Compiled corpus cardinality mismatch.");
  const ids = new Map(compiled.documents.map((d) => [d.metadata.id, d]));
  const keys = new Set(compiled.documents.map((d) => d.key));
  const paths = new Set(compiled.documents.map((d) => d.path.toLowerCase()));
  if (ids.size !== 2400 || keys.size !== 2400 || paths.size !== 2400)
    throw new Error("Duplicate compiled document identity/path.");
  const amendments = compiled.documents.filter(
    (d) => d.metadata.type === "amendment",
  );
  if (
    amendments.length !== 240 ||
    new Set(amendments.map((d) => d.instrument_key)).size !== 240 ||
    amendments.filter((d) => d.metadata.parent_document_id).length !== 238
  )
    throw new Error("Amendment logical/parent counts mismatch.");
  if (
    compiled.documents.filter((d) => d.format === "pdf").length !== 2160 ||
    compiled.documents.filter((d) => d.format === "docx").length !== 240
  )
    throw new Error("Format allocation mismatch.");
  if (new Set(compiled.documents.map((d) => d.family)).size !== 48)
    throw new Error("Missing family.");
  for (const doc of compiled.documents) {
    documentMetadataSchema.parse(doc.metadata);
    assertPortablePath(doc.path);
    const matter = compiled.scenario_timelines.find(
      (c) => c.deal_id === doc.metadata.deal_id,
    );
    if (
      !matter ||
      !matter.events.some((e) => e.key === doc.event_key) ||
      !matter.slots.some(
        (s) =>
          s.key === doc.key &&
          s.family === doc.family &&
          s.purpose === doc.purpose,
      )
    )
      throw new Error("Filler or unresolved inventory record.");
    if (doc.metadata.type === "amendment") {
      const parent = doc.metadata.parent_document_id
        ? ids.get(doc.metadata.parent_document_id)
        : null;
      if (
        doc.metadata.parent_document_id &&
        (!parent ||
          parent.metadata.type !== "contract" ||
          parent.metadata.deal_id !== doc.metadata.deal_id ||
          parent.metadata.id === doc.metadata.id)
      )
        throw new Error("Invalid same-deal contract parent.");
      if (!parent && !doc.unresolved_parent_reason)
        throw new Error(
          "Unresolved amendment lacks textual base identification.",
        );
      if (
        (doc.metadata.status === "draft" && doc.format !== "docx") ||
        (doc.metadata.status !== "draft" && doc.format !== "pdf")
      )
        throw new Error("Amendment execution/format allocation mismatch.");
    } else if (doc.metadata.parent_document_id)
      throw new Error("Non-amendment has parent.");
    if (
      doc.revises_instrument_key &&
      !compiled.logical_instruments.some(
        (i) => i.key === doc.revises_instrument_key,
      )
    )
      throw new Error("Dangling revision relation.");
  }
}

export async function writeCorpusPlan(output: string): Promise<void> {
  const target = ownedOutputPath(output);
  const bytes = stableJson(compileCorpus());
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await writeFile(target, bytes, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if ((await readFile(target, "utf8")) !== bytes)
      throw new Error("Existing plan differs; no overwrite performed.", {
        cause: error,
      });
  }
}
