import { MAX_FILE_BYTES } from "@agency/contracts";
import {
  DOCX_MIME,
  PDF_MIME,
  createSampleDocx,
  createSamplePdf,
} from "../fixtures/index.js";
import {
  buildZip,
  contentTypesXml,
  docxParts,
  documentXml,
  relsXml,
} from "../fixtures/files.js";
import {
  FileValidationError,
  detectDocumentFile,
  normalizeFileName,
} from "../../src/modules/documents/infrastructure/files/index.js";

async function expectReason(
  bytes: Uint8Array,
  reason: "unsupported" | "too_large",
  name = "f.pdf",
  options?: { timeoutMs?: number },
) {
  const before = Buffer.from(bytes);
  const error = await detectDocumentFile(bytes, name, options).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(FileValidationError);
  expect((error as FileValidationError).reason).toBe(reason);
  expect(Buffer.from(bytes).equals(before)).toBe(true); // bytes retained
}

function withPart(name: string, data: string) {
  return docxParts().map((p) => (p.name === name ? { ...p, data } : p));
}

describe("detectDocumentFile: valid files", () => {
  it("detects a PDF by content regardless of extension", async () => {
    const bytes = await createSamplePdf("hello");
    const before = Buffer.from(bytes);
    const result = await detectDocumentFile(bytes, "x.docx");
    expect(result).toEqual({ mimeType: PDF_MIME, fileName: "x.docx" });
    expect(Buffer.from(bytes).equals(before)).toBe(true);
  });

  it("detects a DOCX by content regardless of extension", async () => {
    const bytes = createSampleDocx("hello");
    const before = Buffer.from(bytes);
    const result = await detectDocumentFile(bytes, "dir\\x.pdf");
    expect(result).toEqual({ mimeType: DOCX_MIME, fileName: "x.pdf" });
    expect(Buffer.from(bytes).equals(before)).toBe(true);
  });

  it("accepts a deflated DOCX", async () => {
    const bytes = buildZip(docxParts().map((p) => ({ ...p, deflate: true })));
    expect((await detectDocumentFile(bytes, "a.docx")).mimeType).toBe(
      DOCX_MIME,
    );
  });
});

describe("detectDocumentFile: rejects malformed input", () => {
  it("rejects plain text renamed .pdf", async () => {
    await expectReason(Buffer.from("just some text"), "unsupported");
  });

  it("rejects empty input", async () => {
    await expectReason(new Uint8Array(0), "unsupported");
  });

  it("rejects a truncated PDF", async () => {
    const pdf = await createSamplePdf("hello");
    await expectReason(pdf.slice(0, Math.floor(pdf.length / 2)), "unsupported");
  });

  it("rejects a %PDF- header followed by garbage", async () => {
    await expectReason(
      Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(200, 0x41)]),
      "unsupported",
    );
  });

  it("rejects an arbitrary ZIP without Word parts", async () => {
    await expectReason(
      buildZip([{ name: "a.txt", data: "hi" }]),
      "unsupported",
      "a.docx",
    );
  });

  it("rejects a corrupt ZIP", async () => {
    const zip = createSampleDocx("x");
    await expectReason(zip.slice(0, zip.length - 30), "unsupported", "a.docx");
  });

  it("rejects DOCX missing [Content_Types].xml", async () => {
    await expectReason(
      buildZip(docxParts().filter((p) => p.name !== "[Content_Types].xml")),
      "unsupported",
    );
  });

  it("rejects DOCX missing the package relationship part", async () => {
    await expectReason(
      buildZip(docxParts().filter((p) => p.name !== "_rels/.rels")),
      "unsupported",
    );
  });

  it("rejects a non-officeDocument relationship", async () => {
    await expectReason(
      buildZip(withPart("_rels/.rels", relsXml("word/document.xml", "image"))),
      "unsupported",
    );
  });

  it("rejects a relationship target that does not exist", async () => {
    await expectReason(
      buildZip(withPart("_rels/.rels", relsXml("word/missing.xml"))),
      "unsupported",
    );
  });

  it("rejects a macro-enabled main content type", async () => {
    const macro = "application/vnd.ms-word.document.macroEnabled.main+xml";
    await expectReason(
      buildZip(withPart("[Content_Types].xml", contentTypesXml(macro))),
      "unsupported",
    );
  });

  it("rejects a content type that is not WordprocessingML", async () => {
    await expectReason(
      buildZip(withPart("[Content_Types].xml", contentTypesXml("text/plain"))),
      "unsupported",
    );
  });

  it("rejects a main part with the wrong root element", async () => {
    await expectReason(
      buildZip(withPart("word/document.xml", '<?xml version="1.0"?><root/>')),
      "unsupported",
    );
  });

  it("rejects a main part with a wrong namespace", async () => {
    await expectReason(
      buildZip(
        withPart(
          "word/document.xml",
          '<w:document xmlns:w="urn:other"><w:body/></w:document>',
        ),
      ),
      "unsupported",
    );
  });

  it("rejects XML with a DOCTYPE", async () => {
    await expectReason(
      buildZip(withPart("word/document.xml", documentXml("<!DOCTYPE d>"))),
      "unsupported",
    );
  });

  it("rejects XML with an entity declaration", async () => {
    const prefix = '<!DOCTYPE d [<!ENTITY e "boom">]>';
    await expectReason(
      buildZip(withPart("word/document.xml", documentXml(prefix))),
      "unsupported",
    );
  });
});

describe("detectDocumentFile: archive abuse", () => {
  it("rejects a ZIP with more than 2048 entries", async () => {
    const extra = Array.from({ length: 2049 }, (_, i) => ({
      name: `f/${i}.txt`,
      data: "",
    }));
    await expectReason(buildZip([...docxParts(), ...extra]), "unsupported");
  });

  it("rejects when inflated size exceeds the bound (zip bomb)", async () => {
    // ~110 MB of zeros deflates to ~110 KB; the bound check must stop early.
    const bomb = buildZip([
      ...docxParts(),
      {
        name: "word/bomb.bin",
        data: Buffer.alloc(110 * 1024 * 1024),
        deflate: true,
      },
    ]);
    expect(bomb.length).toBeLessThan(1_000_000);
    await expectReason(bomb, "unsupported");
  });

  it("does not trust headers: a lying declared size is bounded by real inflation", async () => {
    const zip = buildZip([
      ...docxParts(),
      {
        name: "word/bomb.bin",
        data: Buffer.alloc(110 * 1024 * 1024),
        deflate: true,
      },
    ]);
    // Rewrite declared uncompressed sizes to 1 in local and central headers.
    const buf = Buffer.from(zip);
    for (let i = 0; i < buf.length - 30; i++) {
      const sig = buf.readUInt32LE(i);
      if (sig === 0x04034b50) buf.writeUInt32LE(1, i + 22);
      if (sig === 0x02014b50) buf.writeUInt32LE(1, i + 24);
    }
    await expectReason(new Uint8Array(buf), "unsupported");
  });

  it("rejects encrypted entries", async () => {
    const parts = docxParts();
    parts[2] = { ...parts[2]!, flags: 0x1 };
    await expectReason(buildZip(parts), "unsupported");
  });

  it.each([
    "../evil.xml",
    "word/../../evil.xml",
    "/abs.xml",
    "C:\\x.xml",
    "a\\..\\b.xml",
  ])("rejects entry name %s", async (name) => {
    await expectReason(
      buildZip([...docxParts(), { name, data: "x" }]),
      "unsupported",
    );
  });

  it("rejects duplicate entry names", async () => {
    await expectReason(
      buildZip([...docxParts(), { name: "word/document.xml", data: "x" }]),
      "unsupported",
    );
  });
});

describe("detectDocumentFile: size gate and timeout", () => {
  it("rejects MAX_FILE_BYTES + 1 as too_large", async () => {
    await expectReason(new Uint8Array(MAX_FILE_BYTES + 1), "too_large");
  });

  it("does not report too_large for exactly MAX_FILE_BYTES", async () => {
    const error = await detectDocumentFile(
      new Uint8Array(MAX_FILE_BYTES),
      "a.pdf",
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FileValidationError);
    expect((error as FileValidationError).reason).toBe("unsupported");
  });

  it("maps a PDF worker timeout to unsupported", async () => {
    const pdf = await createSamplePdf("slow");
    await expectReason(pdf, "unsupported", "a.pdf", { timeoutMs: 1 });
  });

  it("maps a DOCX timeout to unsupported", async () => {
    await expectReason(createSampleDocx("slow"), "unsupported", "a.docx", {
      timeoutMs: 0,
    });
  });
});

describe("normalizeFileName", () => {
  it.each([
    ["../../etc/passwd", "passwd"],
    ["C:\\Users\\a\\report.pdf", "report.pdf"],
    ["a/b\\c.docx", "c.docx"],
    ["re\r\nport.pdf", "report.pdf"],
    ["a\u0000b\u007f.pdf", "ab.pdf"],
    ["\u202Egnp.pdf\u202C", "gnp.pdf"],
    ["a\u2066b\u2069.pdf", "ab.pdf"],
    ["  spaced.pdf  ", "spaced.pdf"],
    ["e\u0301.pdf", "\u00e9.pdf"],
    ["", "document"],
    [".", "document"],
    ["..", "document"],
    ["dir/", "document"],
    ["\u0000\r\n", "document"],
  ])("normalizes %j to %j", (raw, expected) => {
    expect(normalizeFileName(raw)).toBe(expected);
  });

  it("truncates very long names to 255 chars keeping the extension", () => {
    const result = normalizeFileName(`${"a".repeat(400)}.pdf`);
    expect(result).toHaveLength(255);
    expect(result.endsWith(".pdf")).toBe(true);
  });

  it("truncates very long names without extension", () => {
    expect(normalizeFileName("b".repeat(400))).toHaveLength(255);
  });
});
