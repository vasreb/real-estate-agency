import { crc32, deflateRawSync } from "node:zlib";
import { assertPortablePath } from "../policy.js";

export type ZipPart = { name: string; data: Buffer };
/** Bounded in-memory writer for small OOXML packages, NOT the outer release ZIP. */
export function writeZip(parts: readonly ZipPart[]): Buffer {
  if (!parts.length || parts.length > 128)
    throw new Error("DOCX writer part-count budget exceeded.");
  const names = new Set<string>();
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  let expanded = 0;
  for (const part of [...parts].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    assertPortablePath(part.name);
    const collision = part.name.normalize("NFC").toLowerCase();
    if (names.has(collision)) throw new Error("Duplicate/colliding DOCX part.");
    names.add(collision);
    expanded += part.data.length;
    if (expanded > 16 * 1024 ** 2)
      throw new Error("DOCX expanded-byte budget exceeded.");
    const name = Buffer.from(part.name);
    const compressed = deflateRawSync(part.data, { level: 6 });
    const checksum = crc32(part.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(33, 12);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(part.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, compressed);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x800, 8);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt16LE(33, 14);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(part.data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
