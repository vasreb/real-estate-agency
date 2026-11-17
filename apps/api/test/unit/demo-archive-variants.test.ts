import { compileCorpus } from "../../prisma/demo-archive/compiler.js";
import { variantAudit } from "../../prisma/demo-archive/qa/variants.js";
describe("operative diversity screening", () => {
  it("has at least three non-identity textual variants for every frequent family", () => {
    const report = variantAudit(compileCorpus());
    expect(
      report.filter((r) => r.occurrences >= 6 && r.text_variants < 3),
    ).toEqual([]);
  }, 30_000);
  it("does not count names, dates, amounts or identifiers as diversity", () => {
    const corpus = compileCorpus();
    const doc = corpus.documents[0]!;
    const examples = Array.from({ length: 6 }, (_, i) => ({
      ...doc,
      key: `deal/00${i + 1}/document-1`,
      content: {
        ...doc.content,
        blocks: [
          ...doc.content.blocks.slice(0, 3),
          {
            kind: "paragraph" as const,
            text: `${corpus.actors[i]!.name} paid GBP${100 + i}.00 on 2025-01-0${i + 1} for deal/00${i + 1}/document-1.`,
          },
        ],
      },
    }));
    const report = variantAudit({ ...corpus, documents: examples });
    expect(report[0]!.text_variants).toBe(1);
  }, 30_000);
});
