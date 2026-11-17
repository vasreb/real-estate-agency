import { compileCorpus } from "../../prisma/demo-archive/compiler.js";
import {
  assertPilotApproval,
  corpusDigest,
  recordFor,
} from "../../prisma/demo-archive/build.js";
import { validateOriginal } from "../../prisma/demo-archive/validate.js";
import { renderPdf } from "../../prisma/demo-archive/render/pdf.js";
import { recordScenario } from "../../prisma/demo-archive/qa/evidence.js";

describe("bounded full-corpus validation", () => {
  const corpus = compileCorpus();
  const doc = corpus.documents.find((d) => d.format === "pdf")!;
  it("accepts canonical original bytes and a matching, explicit pilot approval", async () => {
    const rendered = await renderPdf(doc.content);
    const row = recordFor(doc, rendered.bytes);
    expect(await validateOriginal(row, doc, rendered.bytes)).toBe(
      rendered.pages,
    );
    expect(() =>
      assertPilotApproval(corpus, {
        source_digest: corpusDigest(corpus),
        scale_out_allowed: true,
        families_reviewed: 48,
        amendment_reasons_reviewed: 12,
        matters_reviewed: 27,
      }),
    ).not.toThrow();
    recordScenario(13, "happy", {
      stage: "validator fixtures; full corpus receipt separate",
      canonical_original_verified: true,
    });
  });
  it("rejects byte/metadata/amount/placeholder/notice/body substitutions and stale approval", async () => {
    const rendered = await renderPdf(doc.content);
    const row = recordFor(doc, rendered.bytes);
    const broken = Uint8Array.from(rendered.bytes);
    broken[100] = broken[100]! ^ 1;
    await expect(validateOriginal(row, doc, broken)).rejects.toThrow(doc.key);
    await expect(
      validateOriginal(
        { ...row, mapped: { ...row.mapped, document_date: "2026-11-12" } },
        doc,
        rendered.bytes,
      ),
    ).rejects.toThrow(doc.key);
    for (const text of [
      "GBP0.01 instead of the agreed rent",
      "{{unresolved_tenant}}",
      "No standalone synthetic notice",
      "The parties agree unspecified changes",
    ]) {
      const substitute = await renderPdf({
        ...doc.content,
        blocks: [
          ...doc.content.blocks,
          {
            kind: "paragraph",
            text: text.replace("{{unresolved_tenant}}", "UNRESOLVED-TENANT"),
          },
        ],
      });
      await expect(
        validateOriginal(
          recordFor(doc, substitute.bytes),
          doc,
          substitute.bytes,
        ),
      ).rejects.toThrow(doc.key);
    }
    expect(() =>
      assertPilotApproval(corpus, {
        source_digest: "0".repeat(64),
        scale_out_allowed: true,
      }),
    ).toThrow();
    expect(() =>
      assertPilotApproval(corpus, {
        source_digest: corpusDigest(corpus),
        scale_out_allowed: false,
      }),
    ).toThrow();
    recordScenario(13, "failure", {
      substitutions_rejected: 6,
      stale_or_closed_approvals_rejected: 2,
    });
  });
});
