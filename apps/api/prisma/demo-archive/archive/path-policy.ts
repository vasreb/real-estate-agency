import { assertPortablePath, limits } from "../policy.js";

export function assertArchiveEntry(
  entry: {
    name: string;
    flags: number;
    mode: number;
    compressed: number;
    expanded: number;
  },
  seen: Set<string>,
): void {
  assertPortablePath(entry.name);
  const normalized = entry.name.normalize("NFC").toLowerCase();
  const kind = entry.mode & 0xf000;
  if (
    seen.has(normalized) ||
    (entry.flags & ~0x800) !== 0 ||
    (kind !== 0 && kind !== 0x8000) ||
    !Number.isSafeInteger(entry.expanded) ||
    !Number.isSafeInteger(entry.compressed) ||
    entry.expanded < 0 ||
    entry.compressed < 0 ||
    entry.expanded > limits.json_bytes ||
    entry.expanded > Math.max(1, entry.compressed) * limits.compression_ratio ||
    (entry.name.startsWith("documents/") &&
      entry.expanded >= limits.original_bytes_exclusive)
  )
    throw new Error(
      "Unsafe, colliding, encrypted, linked or oversized outer ZIP entry.",
    );
  seen.add(normalized);
}
