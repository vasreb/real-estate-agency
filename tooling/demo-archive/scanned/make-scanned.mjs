// Converts selected archive originals into image-only PDFs (scanned look).
// Usage: node make-scanned.mjs <targets.tsv> <workdir> <apiDir>
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const [, , targetsPath, work, apiDir] = process.argv;
const req = createRequire(path.join(apiDir, "package.json"));
const { PDFDocument, StandardFonts } = req("pdf-lib");

const script = path.join(work, "render-batch.ps1");
const origDir = path.join(work, "orig");
const textDir = path.join(work, "text");
const pageDir = path.join(work, "pages");
for (const dir of [origDir, textDir, pageDir]) mkdirSync(dir, { recursive: true });

const rows = readFileSync(targetsPath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [id, dealNumber, title, fileName, mime, type, hex] = line.split("\t");
    return { id, dealNumber, title, fileName, mime, type, bytes: Buffer.from(hex, "hex") };
  });

// Minimal ZIP reader (stored or deflated entries).
function zipEntries(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const dataStart = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.subarray(dataStart, dataStart + size);
    out.set(name, method === 0 ? raw : inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const decode = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function docxParagraphs(bytes) {
  const xml = zipEntries(bytes).get("word/document.xml").toString("utf8");
  const paragraphs = [];
  for (const m of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const body = m[0];
    const text = [...body.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => decode(m[1])).join("");
    paragraphs.push(text);
  }
  return paragraphs;
}

const safe = (s) => s.replace(/[^\x09\x0a\x20-\x7e -ÿ–—‘’“”•€]/g, "?");

async function textPdf(paragraphs, outFile) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 10.5, lineHeight = 15, maxWidth = 595 - 120;
  let page = doc.addPage([595, 842]);
  let y = 842 - 70;
  const newLine = () => {
    if (y < 70) { page = doc.addPage([595, 842]); y = 842 - 70; }
  };
  for (const raw of paragraphs) {
    const words = safe(raw).split(/\s+/);
    let line = "";
    const flush = () => { newLine(); page.drawText(line, { x: 60, y, size, font }); y -= lineHeight; line = ""; };
    if (!raw.trim()) { y -= lineHeight; continue; }
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) flush();
      line = line ? `${line} ${w}` : w;
    }
    if (line) flush();
    y -= 4;
  }
  writeFileSync(outFile, await doc.save({ useObjectStreams: false }));
}

// 1) Stage originals; DOCX gets a text-layout PDF first (then rasterized).
const list = [];
const staged = new Map();
for (const row of rows) {
  const origPath = path.join(origDir, `${row.id}${row.mime === "application/pdf" ? ".pdf" : ".docx"}`);
  writeFileSync(origPath, row.bytes);
  let source = origPath;
  if (row.mime !== "application/pdf") {
    source = path.join(textDir, `${row.id}.pdf`);
    const heading = [];
    await textPdf([...heading, ...docxParagraphs(row.bytes)], source);
  }
  const prefix = path.join(pageDir, row.id);
  staged.set(row.id, prefix);
  list.push(`${source}\t${prefix}`);
}
writeFileSync(path.join(work, "render-list.txt"), list.join("\n") + "\n");

// 2) Rasterize every page via the Windows PDF renderer.
const ps = execFileSync(
  "powershell",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-List", path.join(work, "render-list.txt")],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
console.error(ps.trim());

// 3) Compose image-only PDFs.
const manifest = [];
const sql = ["BEGIN;"];
for (const row of rows) {
  const prefix = staged.get(row.id);
  const base = path.basename(prefix);
  const pages = readdirSync(pageDir)
    .filter((f) => f.startsWith(`${base}-`) && f.endsWith(".jpg"))
    .sort((a, b) => Number(a.slice(base.length + 1, -4)) - Number(b.slice(base.length + 1, -4)));
  if (pages.length === 0) throw new Error(`no pages rendered for ${row.id}`);
  const doc = await PDFDocument.create({ updateMetadata: false });
  for (const file of pages) {
    const jpg = readFileSync(path.join(pageDir, file));
    const img = await doc.embedJpg(jpg);
    const width = 595;
    const height = (595 * img.height) / img.width;
    const page = doc.addPage([width, height]);
    page.drawImage(img, { x: 0, y: 0, width, height });
  }
  const bytes = Buffer.from(await doc.save({ useObjectStreams: false }));
  const newName = row.fileName.replace(/\.docx$/i, ".pdf");
  manifest.push({
    id: row.id,
    deal_number: row.dealNumber,
    type: row.type,
    title: row.title,
    original_file_name: row.fileName,
    original_mime_type: row.mime,
    file_name: newName,
    pages: pages.length,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  const q = (s) => `'${s.replace(/'/g, "''")}'`;
  sql.push(
    `UPDATE documents SET file_data = decode('${bytes.toString("hex")}', 'hex'), mime_type = 'application/pdf', file_name = ${q(newName)} WHERE id = '${row.id}';`,
  );
}
sql.push("COMMIT;");
writeFileSync(path.join(work, "update.sql"), sql.join("\n") + "\n");
writeFileSync(path.join(work, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
const totalPages = manifest.reduce((n, m) => n + m.pages, 0);
const totalBytes = manifest.reduce((n, m) => n + m.bytes, 0);
console.log(JSON.stringify({ documents: manifest.length, pages: totalPages, bytes: totalBytes }));
