import { Buffer } from "node:buffer";
import type { Readable } from "node:stream";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import yauzl from "yauzl";

export const MAX_ENTRIES = 2048;
export const MAX_UNCOMPRESSED_BYTES = 100_000_000;
const MAX_PART_BYTES = 20_000_000;

const WORD_MAIN_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const OFFICE_DOCUMENT_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
const CONTENT_TYPES = "[Content_Types].xml";
const RELS = "_rels/.rels";

class Reject extends Error {}

const parser = new XMLParser({
  processEntities: false,
  ignoreAttributes: false,
  isArray: (name) => name === "Override" || name === "Relationship",
});

function parseXml(bytes: Buffer): Record<string, unknown> {
  const text = bytes.toString("utf8");
  if (/<!DOCTYPE/iu.test(text) || /<!ENTITY/iu.test(text)) {
    throw new Reject("dtd");
  }
  if (XMLValidator.validate(text) !== true) throw new Reject("xml");
  return parser.parse(text) as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new Reject("shape");
  return value as Record<string, unknown>;
}

function safeName(name: string): boolean {
  if (name === "" || name.includes("\\") || name.includes("\0")) return false;
  if (name.startsWith("/") || /^[A-Za-z]:/u.test(name)) return false;
  return !name.split("/").some((part) => part === "..");
}

/**
 * Reads an entry, counting actually inflated bytes against the shared budget
 * (headers are not trusted). Keeps the content only when `keep` is set.
 */
function readEntry(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry,
  budget: { left: number },
  keep: boolean,
): Promise<Buffer | undefined> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream: Readable) => {
      if (err) return reject(new Reject("zip"));
      const chunks: Buffer[] = [];
      let kept = 0;
      stream.on("data", (chunk: Buffer) => {
        budget.left -= chunk.length;
        if (budget.left < 0) {
          stream.destroy();
          return reject(new Reject("too_big"));
        }
        if (keep) {
          kept += chunk.length;
          if (kept > MAX_PART_BYTES) {
            stream.destroy();
            return reject(new Reject("part_too_big"));
          }
          chunks.push(chunk);
        }
      });
      stream.once("error", () => reject(new Reject("zip")));
      stream.once("end", () =>
        resolve(keep ? Buffer.concat(chunks) : undefined),
      );
    });
  });
}

function openZip(bytes: Uint8Array): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (err, zip) => (err ? reject(new Reject("zip")) : resolve(zip)),
    );
  });
}

function listEntries(zip: yauzl.ZipFile): Promise<Map<string, yauzl.Entry>> {
  return new Promise((resolve, reject) => {
    if (zip.entryCount > MAX_ENTRIES) return reject(new Reject("entries"));
    const entries = new Map<string, yauzl.Entry>();
    const lower = new Set<string>();
    let declared = 0;
    zip.on("error", () => reject(new Reject("zip")));
    zip.on("end", () => resolve(entries));
    zip.on("entry", (entry: yauzl.Entry) => {
      const name = entry.fileName;
      if (!safeName(name)) return reject(new Reject("name"));
      if (lower.has(name.toLowerCase())) return reject(new Reject("dup"));
      if (entry.isEncrypted()) return reject(new Reject("encrypted"));
      declared += entry.uncompressedSize;
      if (declared > MAX_UNCOMPRESSED_BYTES) return reject(new Reject("big"));
      lower.add(name.toLowerCase());
      entries.set(name, entry);
      zip.readEntry();
    });
    zip.readEntry();
  });
}

function checkContentTypes(xml: Buffer, mainPart: string) {
  const root = asRecord(asRecord(parseXml(xml))["Types"]);
  const overrides = (root["Override"] ?? []) as Record<string, string>[];
  let mainOk = false;
  for (const o of overrides) {
    const type = String(o["@_ContentType"] ?? "");
    if (/macroEnabled/iu.test(type)) throw new Reject("macro");
    if (
      type === WORD_MAIN_TYPE &&
      String(o["@_PartName"] ?? "").toLowerCase() ===
        `/${mainPart}`.toLowerCase()
    ) {
      mainOk = true;
    }
  }
  if (!mainOk) throw new Reject("content_type");
}

function findMainPart(rels: Buffer): string {
  const root = asRecord(asRecord(parseXml(rels))["Relationships"]);
  const list = (root["Relationship"] ?? []) as Record<string, string>[];
  const rel = list.find((r) => r["@_Type"] === OFFICE_DOCUMENT_REL);
  if (!rel || rel["@_TargetMode"] === "External") throw new Reject("rel");
  const target = String(rel["@_Target"] ?? "").replace(/^\//u, "");
  if (!safeName(target)) throw new Reject("rel");
  return target;
}

function checkMainPart(xml: Buffer) {
  const parsed = parseXml(xml);
  const keys = Object.keys(parsed).filter((k) => !k.startsWith("?"));
  const key = keys[0];
  if (keys.length !== 1 || key === undefined) throw new Reject("root");
  const [prefix, local] = key.includes(":")
    ? (key.split(":") as [string, string])
    : ["", key];
  if (local !== "document") throw new Reject("root");
  const root = asRecord(parsed[key]);
  const ns = root[prefix ? `@_xmlns:${prefix}` : "@_xmlns"];
  if (ns !== W_NS) throw new Reject("ns");
}

async function inspect(bytes: Uint8Array, deadline: number) {
  const zip = await openZip(bytes);
  try {
    const entries = await listEntries(zip);
    if (!entries.has(CONTENT_TYPES) || !entries.has(RELS)) {
      throw new Reject("missing");
    }
    const budget = { left: MAX_UNCOMPRESSED_BYTES };
    let contentTypes: Buffer | undefined;
    let rels: Buffer | undefined;
    for (const [name, entry] of entries) {
      if (Date.now() >= deadline) throw new Reject("timeout");
      if (name.endsWith("/")) continue;
      const keep = name === CONTENT_TYPES || name === RELS;
      const data = await readEntry(zip, entry, budget, keep);
      if (name === CONTENT_TYPES) contentTypes = data;
      if (name === RELS) rels = data;
    }
    if (!contentTypes || !rels) throw new Reject("missing");
    const mainPart = findMainPart(rels);
    const mainEntry = entries.get(mainPart);
    if (!mainEntry) throw new Reject("target");
    checkContentTypes(contentTypes, mainPart);
    if (Date.now() >= deadline) throw new Reject("timeout");
    const main = await readEntry(
      zip,
      mainEntry,
      { left: MAX_PART_BYTES },
      true,
    );
    checkMainPart(main ?? Buffer.alloc(0));
    if (Date.now() >= deadline) throw new Reject("timeout");
  } finally {
    zip.close();
  }
}

/** Bounded in-memory OOXML WordprocessingML check. Never throws. */
export async function isStructurallyValidDocx(
  bytes: Uint8Array,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Reject("timeout")), timeoutMs);
  });
  try {
    await Promise.race([inspect(bytes, deadline), timeout]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
