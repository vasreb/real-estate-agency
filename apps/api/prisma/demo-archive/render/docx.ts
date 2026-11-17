import { crc32 } from "node:zlib";
import { fromBuffer, type Entry } from "yauzl";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { corpus, type AuthoredDocument } from "../model.js";
import { assertPortablePath } from "../policy.js";
import { assertEnglishSynthetic } from "../content/language-policy.js";
import { textOf } from "../content/context.js";
import { writeZip, type ZipPart } from "./zip-writer.js";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const MAIN =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const PREFIX = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const escapeXml = (text: string) => {
  if (
    [...text].some(
      (c) => c.charCodeAt(0) < 32 && ![9, 10, 13].includes(c.charCodeAt(0)),
    )
  )
    throw new Error("Invalid XML control character.");
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
};
const paragraph = (text: string, style = "Normal") =>
  `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
const relation = (id: string, type: string, target: string) =>
  `<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"/>`;
const part = (name: string, data: string): ZipPart => ({
  name,
  data: Buffer.from(PREFIX + data, "utf8"),
});

export function docxParts(content: AuthoredDocument): ZipPart[] {
  assertEnglishSynthetic(textOf(content));
  const body = content.blocks
    .map((block) => {
      if (block.kind === "page-break")
        return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      if (block.kind === "paragraph" || block.kind === "heading")
        return paragraph(
          block.text,
          block.kind === "heading" ? `Heading${block.level}` : "Normal",
        );
      if (block.kind === "execution")
        return (
          paragraph(
            block.state === "simulated-signed"
              ? "Simulated signature"
              : block.state,
            "Heading2",
          ) +
          block.signatories
            .map((s) => paragraph(s.name) + paragraph(s.capacity))
            .join("")
        );
      if (
        !block.columns.length ||
        block.rows.some((row) => row.length !== block.columns.length)
      )
        throw new Error("Malformed DOCX table.");
      const rows = [block.columns, ...block.rows]
        .map(
          (cells, i) =>
            `<w:tr><w:trPr>${i === 0 ? "<w:tblHeader/>" : ""}<w:cantSplit/></w:trPr>${cells.map((cell) => `<w:tc><w:tcPr><w:tcW w:w="${Math.floor(9600 / cells.length)}" w:type="dxa"/>${i === 0 ? '<w:shd w:fill="EAF2F2"/>' : ""}</w:tcPr>${paragraph(cell, i === 0 ? "TableHeader" : "TableText")}</w:tc>`).join("")}</w:tr>`,
        )
        .join("");
      return `<w:tbl><w:tblPr><w:tblW w:w="9600" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((edge) => `<w:${edge} w:val="single" w:sz="4" w:color="ABB8BA"/>`).join("")}</w:tblBorders></w:tblPr><w:tblGrid>${block.columns.map(() => `<w:gridCol w:w="${Math.floor(9600 / block.columns.length)}"/>`).join("")}</w:tblGrid>${rows}</w:tbl>`;
    })
    .join("");
  const styles = `<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="280" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>${[
    ["Normal", "Normal", ""],
    [
      "Title",
      "Title",
      '<w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="155657"/></w:rPr>',
    ],
    [
      "Heading1",
      "Heading 1",
      '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr>',
    ],
    [
      "Heading2",
      "Heading 2",
      '<w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr>',
    ],
    ["TableText", "Table text", '<w:rPr><w:sz w:val="19"/></w:rPr>'],
    ["TableHeader", "Table header", '<w:rPr><w:b/><w:sz w:val="19"/></w:rPr>'],
    ["Footer", "Footer", '<w:rPr><w:sz w:val="16"/></w:rPr>'],
  ]
    .map(
      ([id, name, properties]) =>
        `<w:style w:type="paragraph" w:styleId="${id}"${id === "Normal" ? ' w:default="1"' : ""}><w:name w:val="${name}"/>${id === "Normal" ? "" : '<w:basedOn w:val="Normal"/>'}${properties}</w:style>`,
    )
    .join("")}</w:styles>`;
  return [
    part(
      "[Content_Types].xml",
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[
        ["document", MAIN],
        [
          "styles",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml",
        ],
        [
          "numbering",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml",
        ],
        [
          "header1",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml",
        ],
        [
          "footer1",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml",
        ],
      ]
        .map(
          ([name, type]) =>
            `<Override PartName="/word/${name}.xml" ContentType="${type}"/>`,
        )
        .join("")}</Types>`,
    ),
    part(
      "_rels/.rels",
      `<Relationships xmlns="${PKG}">${relation("rId1", "officeDocument", "word/document.xml")}</Relationships>`,
    ),
    part(
      "word/document.xml",
      `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${paragraph(content.title, "Title")}${body}<w:sectPr><w:headerReference w:type="default" r:id="rId3"/><w:footerReference w:type="default" r:id="rId4"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1134" w:bottom="1440" w:left="1134" w:header="708" w:footer="708"/></w:sectPr></w:body></w:document>`,
    ),
    part(
      "word/_rels/document.xml.rels",
      `<Relationships xmlns="${PKG}">${relation("rId1", "styles", "styles.xml")}${relation("rId2", "numbering", "numbering.xml")}${relation("rId3", "header", "header1.xml")}${relation("rId4", "footer", "footer1.xml")}</Relationships>`,
    ),
    part("word/styles.xml", styles),
    part(
      "word/numbering.xml",
      `<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
    ),
    part(
      "word/header1.xml",
      `<w:hdr xmlns:w="${W}">${paragraph(content.issuer === "agency" ? corpus.agency : `Fictional ${content.issuer} | synthetic copy`, "Footer")}</w:hdr>`,
    ),
    part(
      "word/footer1.xml",
      `<w:ftr xmlns:w="${W}">${paragraph(corpus.notice, "Footer")}<w:p><w:r><w:t>Page </w:t></w:r><w:fldSimple w:instr="PAGE"/><w:r><w:t> of </w:t></w:r><w:fldSimple w:instr="NUMPAGES"/></w:p></w:ftr>`,
    ),
  ];
}
export function renderDocx(content: AuthoredDocument): Buffer {
  return writeZip(docxParts(content));
}

const allowedParts = [
  "[Content_Types].xml",
  "_rels/.rels",
  "word/document.xml",
  "word/_rels/document.xml.rels",
  "word/styles.xml",
  "word/numbering.xml",
  "word/header1.xml",
  "word/footer1.xml",
].sort();
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function texts(value: unknown, insideText = false): string[] {
  if (Array.isArray(value)) return value.flatMap((v) => texts(v, insideText));
  if (!record(value)) return [];
  return Object.entries(value).flatMap(([key, item]) =>
    key === "#text" && insideText
      ? [String(item)]
      : key === "w:t"
        ? texts(item, true)
        : texts(item, insideText),
  );
}
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
export async function validateDocx(
  bytes: Uint8Array,
  expected?: AuthoredDocument,
) {
  if (bytes.length >= 25_000_000)
    throw new Error("DOCX original-byte budget exceeded.");
  const parts = await new Promise<Map<string, Buffer>>((resolve, reject) => {
    fromBuffer(
      Buffer.from(bytes),
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => {
        if (error || !zip) {
          reject(new Error("Invalid DOCX ZIP."));
          return;
        }
        const result = new Map<string, Buffer>();
        let expanded = 0;
        const fail = (reason: unknown) => {
          zip.close();
          reject(
            reason instanceof Error
              ? reason
              : new Error("Invalid DOCX package."),
          );
        };
        zip.on("error", fail);
        zip.on("end", () => resolve(result));
        zip.on("entry", (entry: Entry) => {
          try {
            assertPortablePath(entry.fileName);
            if (
              result.size >= 128 ||
              !allowedParts.includes(entry.fileName) ||
              result.has(entry.fileName) ||
              entry.generalPurposeBitFlag & 1 ||
              entry.uncompressedSize > 8 * 1024 ** 2 ||
              ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000
            )
              throw new Error("Unsafe DOCX entry.");
          } catch (e) {
            fail(e);
            return;
          }
          zip.openReadStream(entry, (err, stream) => {
            if (err || !stream) {
              fail(new Error("Unreadable DOCX part."));
              return;
            }
            const chunks: Buffer[] = [];
            let actual = 0;
            stream.on("error", fail);
            stream.on("data", (data: Buffer) => {
              actual += data.length;
              expanded += data.length;
              if (actual > 8 * 1024 ** 2 || expanded > 16 * 1024 ** 2) {
                stream.destroy(new Error("DOCX expansion budget exceeded."));
                return;
              }
              chunks.push(data);
            });
            stream.on("end", () => {
              const data = Buffer.concat(chunks);
              if (
                actual !== entry.uncompressedSize ||
                crc32(data) !== entry.crc32
              ) {
                fail(new Error("DOCX size/CRC mismatch."));
                return;
              }
              result.set(entry.fileName, data);
              zip.readEntry();
            });
          });
        });
        zip.readEntry();
      },
    );
  });
  if (JSON.stringify([...parts.keys()].sort()) !== JSON.stringify(allowedParts))
    throw new Error("Incomplete or unexpected DOCX part set.");
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: false,
  });
  const textParts = new Map<string, string>();
  const documentRoles = new Map<string, string>();
  for (const [name, data] of parts) {
    const xml = data.toString("utf8");
    if (
      !Buffer.from(xml).equals(data) ||
      /<!DOCTYPE|<!ENTITY/i.test(xml) ||
      XMLValidator.validate(xml) !== true
    )
      throw new Error("Unsafe or malformed OOXML.");
    textParts.set(name, xml);
    if (name.endsWith(".rels")) {
      const parsed: unknown = new XMLParser({ ignoreAttributes: false }).parse(
        xml,
      );
      const root = record(parsed) ? parsed.Relationships : null;
      if (
        !record(root) ||
        root["@_xmlns"] !== PKG ||
        Object.keys(root).some(
          (key) => !["@_xmlns", "Relationship"].includes(key),
        )
      )
        throw new Error("Invalid relationships namespace or structure.");
      const rows: unknown[] = Array.isArray(root.Relationship)
        ? root.Relationship
        : [root.Relationship];
      const required =
        name === "_rels/.rels"
          ? { officeDocument: "word/document.xml" }
          : {
              styles: "styles.xml",
              numbering: "numbering.xml",
              header: "header1.xml",
              footer: "footer1.xml",
            };
      const ids = new Set<string>();
      const roles = new Set<string>();
      for (const row of rows) {
        if (
          !record(row) ||
          Object.keys(row).some(
            (key) =>
              !["@_Id", "@_Type", "@_Target", "@_TargetMode"].includes(key),
          )
        )
          throw new Error("Malformed DOCX relationship.");
        const id = row["@_Id"];
        const type = row["@_Type"];
        const target = row["@_Target"];
        if (
          typeof id !== "string" ||
          !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(id) ||
          ids.has(id) ||
          typeof type !== "string" ||
          typeof target !== "string"
        )
          throw new Error("Invalid or duplicate relationship ID.");
        assertPortablePath(target);
        const role = type.startsWith(`${R}/`) ? type.slice(R.length + 1) : "";
        if (
          !(role in required) ||
          target !== required[role as keyof typeof required] ||
          roles.has(role) ||
          (row["@_TargetMode"] !== undefined &&
            row["@_TargetMode"] !== "Internal") ||
          !parts.has(name === "_rels/.rels" ? target : `word/${target}`)
        )
          throw new Error(
            "External, mistyped or unresolved DOCX relationship.",
          );
        ids.add(id);
        roles.add(role);
        if (name !== "_rels/.rels") documentRoles.set(id, role);
      }
      if (roles.size !== Object.keys(required).length)
        throw new Error("Missing required DOCX relationship role.");
    }
  }
  const main = textParts.get("word/document.xml")!;
  if (
    !main.includes(`<w:document xmlns:w="${W}"`) ||
    !textParts.get("[Content_Types].xml")!.includes(MAIN) ||
    /macroEnabled|vbaProject/i.test([...textParts.values()].join(""))
  )
    throw new Error("Not an approved WordprocessingML package.");
  const parsed: unknown = parser.parse(main);
  const references = new Set<string>();
  const inspectReferences = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(inspectReferences);
      return;
    }
    if (!record(node)) return;
    for (const [tag, children] of Object.entries(node)) {
      if (tag === "w:headerReference" || tag === "w:footerReference") {
        const attrs = node[":@"];
        const id = record(attrs) ? attrs["@_r:id"] : null;
        const role = tag === "w:headerReference" ? "header" : "footer";
        if (
          typeof id !== "string" ||
          documentRoles.get(id) !== role ||
          references.has(role)
        )
          throw new Error("Dangling or mistyped DOCX section reference.");
        references.add(role);
      }
      inspectReferences(children);
    }
  };
  inspectReferences(parsed);
  if (references.size !== 2)
    throw new Error("Missing DOCX header/footer section reference.");
  const canonicalText = texts(parsed).join("\n");
  const footer: unknown = parser.parse(textParts.get("word/footer1.xml")!);
  if (!texts(footer).join("\n").includes(corpus.notice))
    throw new Error("Missing standalone DOCX notice.");
  if (expected && normalize(canonicalText) !== normalize(textOf(expected)))
    throw new Error("DOCX authored text/table mismatch.");
  return {
    parts: [...parts.keys()].sort(),
    canonical_text_matches: expected ? true : null,
    footer_notice: true,
    tables: (main.match(/<w:tbl>/g) ?? []).length,
    native_layout: "unverified",
  };
}
