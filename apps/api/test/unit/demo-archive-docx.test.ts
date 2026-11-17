import {
  renderDocx,
  docxParts,
  validateDocx,
} from "../../prisma/demo-archive/render/docx.js";
import { writeZip } from "../../prisma/demo-archive/render/zip-writer.js";
import {
  corpus,
  type AuthoredDocument,
} from "../../prisma/demo-archive/model.js";
import { recordScenario } from "../../prisma/demo-archive/qa/evidence.js";
const content: AuthoredDocument = {
  key: "fixture/docx",
  title: "Draft property schedule & permission",
  issuer: "agency",
  blocks: [
    { kind: "paragraph", text: corpus.notice },
    { kind: "heading", level: 2, text: "Room and payment schedule" },
    {
      kind: "table",
      columns: ["Item", "Term"],
      rows: [["Kitchen & oven", "GBP2,000.00; existing <control> noted"]],
    },
    {
      kind: "execution",
      state: "draft",
      signatories: [
        { actor_key: "actor/one", name: "Mara Example", capacity: "Principal" },
      ],
    },
  ],
};
describe("real deterministic styled DOCX", () => {
  it("rejects duplicate relationship IDs, wrong types, missing required roles and dangling references", async () => {
    const parts = docxParts(content);
    const relName = "word/_rels/document.xml.rels";
    const rels = parts.find((p) => p.name === relName)!.data.toString();
    const main = parts
      .find((p) => p.name === "word/document.xml")!
      .data.toString();
    const zip = (name: string, text: string) =>
      writeZip(
        parts.map((p) =>
          p.name === name ? { name, data: Buffer.from(text) } : p,
        ),
      );
    for (const changed of [
      rels.replace('Id="rId2"', 'Id="rId1"'),
      rels.replace('/styles"', '/image"'),
      rels.replace(/<Relationship Id="rId2"[^>]*\/>/, ""),
      rels.replace('Target="footer1.xml"', 'Target="styles.xml"'),
      rels.replace(
        'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"',
        'xmlns="urn:wrong"',
      ),
    ])
      await expect(validateDocx(zip(relName, changed))).rejects.toThrow();
    await expect(
      validateDocx(
        zip("word/document.xml", main.replace('r:id="rId3"', 'r:id="missing"')),
      ),
    ).rejects.toThrow();
    await expect(
      validateDocx(
        zip("word/document.xml", main.replace('r:id="rId3"', 'r:id="rId4"')),
      ),
    ).rejects.toThrow();
  });
  it("independently reads XML parts, CRCs, styles, tables, footer and canonical text", async () => {
    const bytes = renderDocx(content);
    expect(bytes).toEqual(renderDocx(content));
    const result = await validateDocx(bytes, content);
    expect(result.parts).toHaveLength(8);
    expect(result.canonical_text_matches).toBe(true);
    expect(result.footer_notice).toBe(true);
    expect(result.tables).toBe(1);
    recordScenario(10, "happy", {
      package_parts: result.parts.length,
      canonical_text_matches: true,
      native_office_layout: "unverified",
    });
  });
  it("rejects broken XML, missing main part, external relations, unsafe paths and non-DOCX ZIPs", async () => {
    const parts = docxParts(content);
    const replace = (name: string, data: string) =>
      writeZip(
        parts.map((p) =>
          p.name === name ? { name, data: Buffer.from(data) } : p,
        ),
      );
    await expect(
      validateDocx(replace("word/document.xml", "<w:document><broken>")),
    ).rejects.toThrow();
    await expect(
      validateDocx(
        writeZip(parts.filter((p) => p.name !== "word/document.xml")),
      ),
    ).rejects.toThrow();
    const rel = parts
      .find((p) => p.name === "word/_rels/document.xml.rels")!
      .data.toString();
    await expect(
      validateDocx(
        replace(
          "word/_rels/document.xml.rels",
          rel.replace(
            'Target="styles.xml"',
            'Target="https://external.example/form" TargetMode="External"',
          ),
        ),
      ),
    ).rejects.toThrow();
    expect(() =>
      writeZip([...parts, { name: "../escape.xml", data: Buffer.from("x") }]),
    ).toThrow();
    await expect(
      validateDocx(
        writeZip([
          { name: "notes.txt", data: Buffer.from("Not a Word package") },
        ]),
      ),
    ).rejects.toThrow();
    const broken = Buffer.from(renderDocx(content));
    broken[100] = broken[100]! ^ 1;
    await expect(validateDocx(broken)).rejects.toThrow();
    recordScenario(10, "failure", { rejected_packages: 6 });
  });
});
