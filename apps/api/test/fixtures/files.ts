import { crc32, deflateRawSync } from "node:zlib";

export type ZipEntrySpec = {
  name: string;
  data: Buffer | string;
  /** Use raw DEFLATE instead of stored. */
  deflate?: boolean;
  /** General purpose bit flag (bit 0 = encrypted). */
  flags?: number;
};

/** Minimal ZIP writer for hostile-archive fixtures (test only). */
export function buildZip(entries: ZipEntrySpec[]): Uint8Array<ArrayBuffer> {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const spec of entries) {
    const nameBytes = Buffer.from(spec.name, "utf8");
    const raw = Buffer.isBuffer(spec.data)
      ? spec.data
      : Buffer.from(spec.data, "utf8");
    const body = spec.deflate ? deflateRawSync(raw) : raw;
    const method = spec.deflate ? 8 : 0;
    const flags = 0x0800 | (spec.flags ?? 0);
    const crc = crc32(raw);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(flags, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0x21, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, body);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(flags, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += header.length + nameBytes.length + body.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...local, ...central, end]));
}

export const WORD_MAIN_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
export const W_NS =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export function contentTypesXml(mainType = WORD_MAIN_TYPE): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    `<Override PartName="/word/document.xml" ContentType="${mainType}"/>` +
    "</Types>"
  );
}

export function relsXml(
  target = "word/document.xml",
  type = "officeDocument",
): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>` +
    "</Relationships>"
  );
}

export function documentXml(prefix = ""): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    prefix +
    `<w:document xmlns:w="${W_NS}"><w:body><w:p><w:r><w:t>x</w:t></w:r></w:p></w:body></w:document>`
  );
}

/** Valid DOCX parts as specs, for tests to tweak. */
export function docxParts(): ZipEntrySpec[] {
  return [
    { name: "[Content_Types].xml", data: contentTypesXml() },
    { name: "_rels/.rels", data: relsXml() },
    { name: "word/document.xml", data: documentXml() },
  ];
}
