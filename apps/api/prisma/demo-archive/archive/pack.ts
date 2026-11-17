import { createReadStream } from "node:fs";
import { lstat, mkdir, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { crc32, deflateRawSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import {
  assertPortablePath,
  limits,
  ownedEvidencePath,
  ownedOutputPath,
} from "../policy.js";
import { stableJson } from "../model.js";
import { boundedRead, listPayload, validateCorpus } from "../validate.js";
import { digestBytes } from "../build.js";

export type OuterPart = { name: string } & (
  { data: Buffer } | { load: () => Promise<Buffer> }
);
export async function fileDigest(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const data of createReadStream(file)) {
    if (!Buffer.isBuffer(data))
      throw new Error("Unexpected archive hash stream chunk.");
    hash.update(data);
  }
  return hash.digest("hex");
}
/** Sequential bounded entry loading; never creates a whole-release Buffer. */
export async function writeOuterZip(
  output: string,
  input: readonly OuterPart[],
): Promise<void> {
  ownedOutputPath(output);
  if (!input.length || input.length > limits.outer_entries)
    throw new Error("Outer ZIP entry count exceeded.");
  const parts = [...input].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  const seen = new Set<string>();
  for (const part of parts) {
    assertPortablePath(part.name);
    const key = part.name.normalize("NFC").toLowerCase();
    if (seen.has(key)) throw new Error("Duplicate/colliding outer ZIP entry.");
    seen.add(key);
  }
  const handle = await open(output, "wx");
  const central: Buffer[] = [];
  let offset = 0;
  let expanded = 0;
  try {
    for (const part of parts) {
      const data = "data" in part ? part.data : await part.load();
      expanded += data.length;
      if (
        data.length > limits.json_bytes ||
        expanded > limits.expanded_bytes ||
        process.memoryUsage().rss > limits.rss_bytes
      )
        throw new Error("Outer ZIP writer budget exceeded.");
      let compressed: Buffer = deflateRawSync(data, { level: 6 });
      let method = 8;
      if (
        compressed.length >= data.length ||
        data.length > Math.max(1, compressed.length) * limits.compression_ratio
      ) {
        compressed = data;
        method = 0;
      }
      const name = Buffer.from(part.name, "utf8");
      const crc = crc32(data);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0x800, 6);
      local.writeUInt16LE(method, 8);
      local.writeUInt16LE(33, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(compressed.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(name.length, 26);
      await handle.writeFile(local);
      await handle.writeFile(name);
      await handle.writeFile(compressed);
      const entry = Buffer.alloc(46);
      entry.writeUInt32LE(0x02014b50);
      entry.writeUInt16LE(0x0314, 4);
      entry.writeUInt16LE(20, 6);
      entry.writeUInt16LE(0x800, 8);
      entry.writeUInt16LE(method, 10);
      entry.writeUInt16LE(33, 14);
      entry.writeUInt32LE(crc, 16);
      entry.writeUInt32LE(compressed.length, 20);
      entry.writeUInt32LE(data.length, 24);
      entry.writeUInt16LE(name.length, 28);
      entry.writeUInt32LE((0o100644 << 16) >>> 0, 38);
      entry.writeUInt32LE(offset, 42);
      central.push(entry, name);
      offset += local.length + name.length + compressed.length;
    }
    const directory = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50);
    end.writeUInt16LE(parts.length, 8);
    end.writeUInt16LE(parts.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    await handle.writeFile(directory);
    await handle.writeFile(end);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
export async function packCorpus(
  input: string,
  output: string,
  receipt: string,
) {
  const started = performance.now();
  const root = ownedOutputPath(input);
  const target = ownedOutputPath(output);
  const evidence = ownedEvidencePath(receipt);
  if (!path.relative(root, target).startsWith(".."))
    throw new Error("ZIP cannot be placed inside its payload.");
  for (const file of [target, evidence]) {
    try {
      await lstat(file);
      throw new Error("Pack refuses an existing ZIP/receipt.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const validation = await validateCorpus(input);
  const checksums = await boundedRead(
    root,
    "checksums.sha256",
    limits.json_bytes,
  );
  const expected = new Map(
    checksums
      .toString("utf8")
      .trimEnd()
      .split("\n")
      .map((line) => [line.slice(66), line.slice(0, 64)]),
  );
  expected.set("checksums.sha256", digestBytes(checksums));
  const names = await listPayload(root);
  await mkdir(path.dirname(target), { recursive: true });
  await writeOuterZip(
    target,
    names.map((name) => ({
      name,
      load: async () => {
        const bytes = await boundedRead(root, name, limits.json_bytes);
        if (digestBytes(bytes) !== expected.get(name))
          throw new Error(`Payload changed while packing: ${name}`);
        return bytes;
      },
    })),
  );
  if (process.resourceUsage().maxRSS * 1024 > limits.rss_bytes)
    throw new Error("ZIP peak RSS budget exceeded.");
  const result = {
    zip_sha256: await fileDigest(target),
    zip_byte_length: (await lstat(target)).size,
    entries: names.length,
    source_digest: validation.source_digest,
    elapsed_ms: Math.round(performance.now() - started),
    process_max_rss_bytes: process.resourceUsage().maxRSS * 1024,
    trust:
      "External digest pin, not a cryptographic signature or receipt-authenticity proof",
    licensed_forms_reproduced: false,
    native_office_layout: "unverified",
    final_release_accepted: false,
  };
  await mkdir(path.dirname(evidence), { recursive: true });
  await writeFile(evidence, stableJson(result), { flag: "wx" });
  // Re-read the just-created public receipt, not a guessed digest.
  return JSON.parse(await readFile(evidence, "utf8")) as typeof result;
}
