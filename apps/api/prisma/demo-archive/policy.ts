import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Derived from this module, never cwd, root .env, or the original worktree.
export const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
export const evidenceRoot = path.join(
  workspaceRoot,
  ".omo/evidence/realistic-agency-archive",
);

export const limits = Object.freeze({
  outer_entries: 4096,
  expanded_bytes: 640 * 1024 ** 2,
  originals_bytes: 512 * 1024 ** 2,
  original_bytes_exclusive: 25_000_000,
  json_bytes: 32 * 1024 ** 2,
  compression_ratio: 100,
  pdf_pages: 12_000,
  rss_bytes: 1024 ** 3,
  render_workers: 2,
  free_disk_bytes: 8 * 1024 ** 3,
  transaction_ms: 300_000,
  lock_wait_ms: 10_000,
});

/** Windows-safe portable relative path; outer-ZIP alias detection is separate. */
export function assertPortablePath(value: string): void {
  if (
    !value ||
    value !== value.normalize("NFC") ||
    /[\\:<>"|?*]/.test(value) ||
    [...value].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    ) ||
    value.startsWith("/") ||
    value
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          /[. ]$/.test(part) ||
          /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part),
      )
  )
    throw new Error("Unsafe portable path.");
}

/** Refuse pre-existing symlink/junction ancestors, including a linked out/. */
export function assertNoLinkedAncestors(target: string): void {
  const relative = path.relative(workspaceRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("Path leaves the execution worktree.");
  let current = workspaceRoot;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink())
        throw new Error("Linked output path refused.");
      const real = realpathSync(current);
      if (path.relative(workspaceRoot, real).startsWith(".."))
        throw new Error("Resolved output leaves the execution worktree.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
}

export function ownedOutputPath(value: string): string {
  const absolute = path.isAbsolute(value)
    ? path.normalize(value)
    : path.resolve(workspaceRoot, value);
  const relative = path
    .relative(workspaceRoot, absolute)
    .split(path.sep)
    .join("/");
  // Reject traversal in the submitted spelling too, not merely its normalized result.
  const spelling = path.isAbsolute(value)
    ? path.relative(workspaceRoot, value)
    : value;
  assertPortablePath(spelling.split(path.sep).join("/"));
  assertPortablePath(relative);
  if (
    !relative.startsWith("out/agency-demo-archive/") &&
    relative !== "out/agency-demo-archive-v1.zip"
  )
    throw new Error("Output must use the task-owned archive out/ path.");
  assertNoLinkedAncestors(absolute);
  return absolute;
}

export function assertOfflineEnvironment(env: NodeJS.ProcessEnv): void {
  if (
    [env.NODE_ENV, env.APP_ENV].some((v) => v?.toLowerCase() === "production")
  )
    throw new Error("Archive commands are forbidden in production.");
}

export function ownedEvidencePath(value: string): string {
  const absolute = path.isAbsolute(value)
    ? path.normalize(value)
    : path.resolve(workspaceRoot, value);
  const relative = path
    .relative(evidenceRoot, absolute)
    .split(path.sep)
    .join("/");
  assertPortablePath(relative);
  if (!relative.endsWith(".json"))
    throw new Error("Evidence must be an owned JSON path.");
  assertNoLinkedAncestors(absolute);
  return absolute;
}

/** Seed tooling is outside the application's architecture scanner. */
export function assertGeneratorImport(
  importer: string,
  specifier: string,
): void {
  if (
    specifier.startsWith("node:") ||
    [
      "@agency/contracts",
      "zod",
      "pdf-lib",
      "yauzl",
      "fast-xml-parser",
    ].includes(specifier)
  )
    return;
  if (specifier.startsWith(".")) {
    const target = path.resolve(path.dirname(importer), specifier);
    const archive = path.join(workspaceRoot, "apps/api/prisma/demo-archive");
    const relative = path.relative(archive, target);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) return;
    const approved = [
      "apps/api/src/modules/auth/index.js",
      "apps/api/src/app.js",
      "apps/api/src/infrastructure/database/index.js",
    ].map((p) => path.join(workspaceRoot, p));
    if (approved.includes(target)) return;
  }
  throw new Error("Generator import violates the approved boundary.");
}
