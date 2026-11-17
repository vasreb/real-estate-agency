import { PDFDocument } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { renderPdf } from "../../prisma/demo-archive/render/pdf.js";
import { wrapText } from "../../prisma/demo-archive/render/layout.js";
import {
  corpus,
  type AuthoredDocument,
} from "../../prisma/demo-archive/model.js";
import { workspaceRoot } from "../../prisma/demo-archive/policy.js";
import { recordScenario } from "../../prisma/demo-archive/qa/evidence.js";

const fixture: AuthoredDocument = {
  key: "fixture/long-table",
  title: "Original long-table layout fixture",
  issuer: "agency",
  blocks: [
    { kind: "paragraph", text: corpus.notice },
    { kind: "heading", level: 1, text: "Inventory GBP1,234.56 / £99.00" },
    {
      kind: "table",
      columns: ["Item", "Condition", "Follow-up"],
      rows: Array.from({ length: 130 }, (_, i) => [
        `Room item ${i + 1}`,
        "Existing local marks retained in the condition baseline; not a claim of new condition.",
        "Compare the named item at check-out and allow ordinary wear.",
      ]),
    },
    {
      kind: "execution",
      state: "simulated-signed",
      signatories: [
        {
          actor_key: "actor/one",
          name: "Mara Example",
          capacity: "Fictional principal",
        },
      ],
    },
  ],
};
describe("deterministic original PDF renderer", () => {
  it("renders a long table with repeated notices and independently rasterises original bytes", async () => {
    const result = await renderPdf(fixture);
    expect(Buffer.from((await renderPdf(fixture)).bytes)).toEqual(
      Buffer.from(result.bytes),
    );
    expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(
      result.pages,
    );
    expect(result.pages).toBeGreaterThan(3);
    expect(result.bounds.every((b) => b.y >= 68 && b.y + b.height <= 730)).toBe(
      true,
    );
    const root = path.join(
      workspaceRoot,
      "out/agency-demo-archive/render-fixtures",
    );
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, "long-table.pdf"), result.bytes);
    execFileSync(
      "python",
      [
        path.join(workspaceRoot, "tooling/demo-archive/render_pdf.py"),
        "--input",
        root,
        "--evidence",
        path.join(
          workspaceRoot,
          ".omo/evidence/realistic-agency-archive/pilot-contact-sheets",
        ),
      ],
      { cwd: workspaceRoot, stdio: "pipe" },
    );
    recordScenario(9, "happy", {
      pages: result.pages,
      canonical_bounds: result.bounds.length,
      independent_original_byte_render: true,
    });
  });
  it("refuses unsupported glyphs, unresolved fields, impossible margins and unsplittable rows", async () => {
    for (const text of [
      "Unsupported 😀 glyph",
      "Unresolved {{tenant}}",
      "x".repeat(500),
    ])
      await expect(
        renderPdf({
          ...fixture,
          blocks: [
            { kind: "paragraph", text: corpus.notice },
            { kind: "paragraph", text },
          ],
        }),
      ).rejects.toThrow();
    await expect(renderPdf(fixture, { margin: 400 })).rejects.toThrow();
    await expect(
      renderPdf({
        ...fixture,
        blocks: [
          { kind: "paragraph", text: corpus.notice },
          {
            kind: "table",
            columns: ["One", "Two"],
            rows: [["word ".repeat(2000), "short"]],
          },
        ],
      }),
    ).rejects.toThrow();
    expect(() => wrapText("text", -1, (v) => v.length)).toThrow();
    execFileSync(
      "python",
      [
        path.join(workspaceRoot, "tooling/demo-archive/render_pdf.py"),
        "--self-test",
      ],
      { cwd: workspaceRoot },
    );
    recordScenario(9, "failure", {
      rejected_layout_cases: 6,
      independent_renderer_self_test: true,
    });
  });
});
