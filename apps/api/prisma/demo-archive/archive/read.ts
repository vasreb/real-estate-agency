import {
  createReadStream,
  closeSync,
  fstatSync,
  openSync,
  readSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";
import { fromFd, type Entry } from "yauzl";
import { ownedOutputPath, limits } from "../policy.js";
import { assertArchiveEntry } from "./path-policy.js";

export async function scanArchive(
  input: string,
  expectedSha256: string,
  onEntry: (name: string, bytes: Buffer) => Promise<void>,
) {
  const file = ownedOutputPath(input);
  if (!/^[a-f0-9]{64}$/.test(expectedSha256))
    throw new Error("Expected external archive digest required.");
  const fd = openSync(file, "r");
  let closeZip: (() => void) | undefined;
  const hashDescriptor = async () => {
    const hash = createHash("sha256");
    for await (const data of createReadStream(file, {
      fd,
      autoClose: false,
      start: 0,
    })) {
      if (!Buffer.isBuffer(data))
        throw new Error("Unexpected archive hash stream chunk.");
      hash.update(data);
    }
    return hash.digest("hex");
  };
  try {
    const initial = fstatSync(fd);
    if (
      !initial.isFile() ||
      initial.size > limits.expanded_bytes + 2 * 1024 ** 2 ||
      (await hashDescriptor()) !== expectedSha256
    )
      throw new Error("Archive external digest/size mismatch.");
    const result = await new Promise<{
      entries: number;
      expanded_bytes: number;
    }>((resolve, reject) => {
      fromFd(
        fd,
        {
          lazyEntries: true,
          autoClose: false,
          validateEntrySizes: true,
          strictFileNames: true,
        },
        (error, zip) => {
          if (error || !zip) {
            reject(new Error("Invalid outer ZIP."));
            return;
          }
          closeZip = () => zip.close();
          let settled = false;
          const seen = new Set<string>();
          let expanded = 0;
          let originals = 0;
          const fail = (reason: unknown) => {
            if (!settled) {
              settled = true;
              reject(
                reason instanceof Error
                  ? reason
                  : new Error("Invalid outer ZIP."),
              );
            }
          };
          if (!zip.entryCount || zip.entryCount > limits.outer_entries) {
            fail(new Error("Outer entry budget exceeded."));
            return;
          }
          zip.on("error", fail);
          zip.on("end", () => {
            if (!settled) {
              settled = true;
              if (seen.size !== zip.entryCount)
                reject(new Error("Outer ZIP count mismatch."));
              else resolve({ entries: seen.size, expanded_bytes: expanded });
            }
          });
          const processEntry = async (entry: Entry) => {
            assertArchiveEntry(
              {
                name: entry.fileName,
                flags: entry.generalPurposeBitFlag,
                mode: entry.externalFileAttributes >>> 16,
                compressed: entry.compressedSize,
                expanded: entry.uncompressedSize,
              },
              seen,
            );
            if (![0, 8].includes(entry.compressionMethod))
              throw new Error("Unsupported outer ZIP compression.");
            // The release format has no descriptors/ZIP64. Do not trust a different
            // local-header spelling/size/CRC beneath a harmless central directory.
            const header = Buffer.alloc(30);
            if (
              readSync(fd, header, 0, 30, entry.relativeOffsetOfLocalHeader) !==
                30 ||
              header.readUInt32LE() !== 0x04034b50 ||
              header.readUInt16LE(6) !== entry.generalPurposeBitFlag ||
              header.readUInt16LE(8) !== entry.compressionMethod ||
              header.readUInt32LE(14) !== entry.crc32 ||
              header.readUInt32LE(18) !== entry.compressedSize ||
              header.readUInt32LE(22) !== entry.uncompressedSize
            )
              throw new Error("Outer ZIP local/central header mismatch.");
            const name = Buffer.alloc(header.readUInt16LE(26));
            readSync(
              fd,
              name,
              0,
              name.length,
              entry.relativeOffsetOfLocalHeader + 30,
            );
            if (!name.equals(Buffer.from(entry.fileName)))
              throw new Error("Outer ZIP local name mismatch.");
            const dataEnd =
              entry.relativeOffsetOfLocalHeader +
              30 +
              name.length +
              header.readUInt16LE(28) +
              entry.compressedSize;
            if (dataEnd > initial.size)
              throw new Error("Outer ZIP entry exceeds original bytes.");
            const stream = await new Promise<NodeJS.ReadableStream>(
              (res, rej) =>
                zip.openReadStream(entry, (err, value) =>
                  err || !value
                    ? rej(new Error("Unreadable outer ZIP entry."))
                    : res(value),
                ),
            );
            const chunks: Buffer[] = [];
            let actual = 0;
            for await (const chunk of stream) {
              const bytes = Buffer.from(chunk);
              actual += bytes.length;
              expanded += bytes.length;
              if (
                actual > entry.uncompressedSize ||
                actual > limits.json_bytes ||
                expanded > limits.expanded_bytes ||
                process.memoryUsage().rss > limits.rss_bytes
              )
                throw new Error("Streamed outer expansion budget exceeded.");
              chunks.push(bytes);
            }
            const bytes = Buffer.concat(chunks);
            if (
              actual !== entry.uncompressedSize ||
              crc32(bytes) !== entry.crc32
            )
              throw new Error("Outer ZIP actual size/CRC mismatch.");
            if (entry.fileName.startsWith("documents/")) {
              originals += actual;
              if (
                actual >= limits.original_bytes_exclusive ||
                originals > limits.originals_bytes
              )
                throw new Error("Outer originals budget exceeded.");
            }
            await onEntry(entry.fileName, bytes);
            if (!settled) zip.readEntry();
          };
          zip.on("entry", (entry: Entry) => {
            void processEntry(entry).catch(fail);
          });
          zip.readEntry();
        },
      );
    });
    if (
      (await hashDescriptor()) !== expectedSha256 ||
      fstatSync(fd).size !== initial.size
    )
      throw new Error("Archive changed during verification.");
    return result;
  } finally {
    if (closeZip) closeZip();
    else closeSync(fd);
  }
}
