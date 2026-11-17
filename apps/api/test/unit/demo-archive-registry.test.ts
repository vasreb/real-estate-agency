import {
  compileCorpus,
  validateCompiledCorpus,
} from "../../prisma/demo-archive/compiler.js";
import { runCli } from "../../prisma/demo-archive/cli.js";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { stableJson } from "../../prisma/demo-archive/model.js";
import { ownedOutputPath } from "../../prisma/demo-archive/policy.js";
import { recordScenario } from "../../prisma/demo-archive/qa/evidence.js";
describe("full corpus inventory compiler", () => {
  it("freezes exact files/formats/graph and writes inventories offline without originals", async () => {
    const corpus = compileCorpus();
    validateCompiledCorpus(corpus);
    expect(corpus.documents).toHaveLength(2400);
    expect(corpus.documents.filter((d) => d.format === "pdf")).toHaveLength(
      2160,
    );
    expect(corpus.documents.filter((d) => d.format === "docx")).toHaveLength(
      240,
    );
    expect(
      corpus.documents.filter((d) => d.metadata.type === "amendment"),
    ).toHaveLength(240);
    expect(
      corpus.documents.filter(
        (d) => d.metadata.type === "amendment" && d.metadata.parent_document_id,
      ),
    ).toHaveLength(238);
    const outputPath = `out/agency-demo-archive/qa/plan-${createHash("sha256").update(stableJson(corpus)).digest("hex")}.json`;
    await runCli(["plan", "--output", outputPath], {
      env: {},
      print: () => undefined,
    });
    const output = JSON.parse(
      readFileSync(ownedOutputPath(outputPath), "utf8"),
    ) as { documents: unknown[] };
    expect(output.documents).toHaveLength(2400);
    recordScenario(11, "happy", {
      documents: 2400,
      pdf: 2160,
      docx: 240,
      logical_instruments: corpus.logical_instruments.length,
      offline: true,
    });
  }, 30_000);
  it("rejects duplicate amendments, non-contract/cross-deal parents, filler and leaked rich columns", () => {
    for (const mutate of [
      (c: ReturnType<typeof compileCorpus>) => {
        const docs = c.documents.filter((d) => d.metadata.type === "amendment");
        docs[1]!.instrument_key = docs[0]!.instrument_key;
      },
      (c: ReturnType<typeof compileCorpus>) => {
        const docs = c.documents.filter(
          (d) =>
            d.metadata.type === "amendment" && d.metadata.parent_document_id,
        );
        docs[1]!.metadata.parent_document_id = docs[0]!.metadata.id;
      },
      (c: ReturnType<typeof compileCorpus>) => {
        const doc = c.documents.find((d) => d.metadata.type === "amendment")!;
        doc.metadata.parent_document_id = c.documents.find(
          (d) =>
            d.metadata.type === "contract" &&
            d.metadata.deal_id !== doc.metadata.deal_id,
        )!.metadata.id;
      },
      (c: ReturnType<typeof compileCorpus>) => {
        c.documents[0]!.event_key = "missing/event";
      },
      (c: ReturnType<typeof compileCorpus>) => {
        Object.assign(c.entities.properties[0]!, { bedrooms: 2 });
      },
    ]) {
      const corpus = compileCorpus();
      mutate(corpus);
      expect(() => validateCompiledCorpus(corpus)).toThrow();
    }
    recordScenario(11, "failure", { rejected_graph_mutations: 5 });
  }, 30_000);
});
