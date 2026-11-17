// Explicitly authorised CRLF -> LF only. Never regenerates or reformats baseline code.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
if (process.argv.length !== 3 || process.argv[2] !== "--confirm-lf-only")
  throw new Error("Explicit LF-only confirmation required.");
const git = (...args) => execFileSync("git", args, { cwd: root });
if (
  git("branch", "--show-current").toString().trim() !==
  "plan/realistic-agency-archive"
)
  throw new Error("Wrong worktree branch.");
if (
  git("diff", "--name-only").length ||
  git("diff", "--cached", "--name-only").length
)
  throw new Error(
    "Tracked changes require investigation before normalization.",
  );
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pending = [];
for (const file of git("ls-files", "-z")
  .toString("utf8")
  .split("\0")
  .filter(Boolean)) {
  if (/(^|\/)\.env(?:\.|$)/.test(file)) continue; // including tracked .env.example; never read environment files
  if (path.isAbsolute(file) || file.split("/").includes(".."))
    throw new Error("Forbidden tracked path.");
  const absolute = path.join(root, file);
  if (!lstatSync(absolute).isFile() || lstatSync(absolute).isSymbolicLink())
    throw new Error("Non-regular tracked file.");
  const before = readFileSync(absolute);
  if (before.includes(0)) continue; // no binary conversions
  const source = before.toString("utf8");
  if (!Buffer.from(source).equals(before))
    throw new Error("Non-UTF8 tracked text refused.");
  const after = Buffer.from(source.replaceAll("\r\n", "\n"));
  if (after.equals(before)) continue;
  // Pin every converted result to the existing Git blob. No content edits can slip in.
  const blob = git("show", `HEAD:${file}`);
  if (!after.equals(blob))
    throw new Error(`Baseline differs beyond checkout line endings: ${file}`);
  pending.push({ file, absolute, before, after });
}
for (const item of pending) {
  if (!readFileSync(item.absolute).equals(item.before))
    throw new Error("File changed during normalization.");
  writeFileSync(item.absolute, item.after);
}
const receipt = {
  authorization:
    "User replied yes to LF-only normalization in this worktree; no semantic baseline changes authorised.",
  branch: "plan/realistic-agency-archive",
  count: pending.length,
  files: pending.map(({ file, before, after }) => ({
    file,
    before_sha256: digest(before),
    after_sha256: digest(after),
    matches_existing_git_blob: true,
  })),
};
writeFileSync(
  path.join(
    root,
    ".omo/evidence/realistic-agency-archive/lf-normalization.json",
  ),
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(
  `Normalized ${pending.length} tracked files; every result equals its existing Git blob.`,
);
