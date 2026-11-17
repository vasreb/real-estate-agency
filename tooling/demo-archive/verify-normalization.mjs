import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const evidence = path.join(root, ".omo/evidence/realistic-agency-archive");
const receipt = JSON.parse(
  readFileSync(path.join(evidence, "lf-normalization.json"), "utf8"),
);
const mismatches = [];
const repairs = JSON.parse(
  readFileSync(path.join(evidence, "authorized-repairs.json"), "utf8"),
);
const permitted = new Set([
  "tooling/prepare.mjs",
  "tooling/tests/hooks.test.mjs",
]);
if (
  repairs.files.length !== permitted.size ||
  repairs.files.some(
    (row) =>
      !permitted.has(row.file) || !/^[a-f0-9]{64}$/.test(row.after_sha256),
  )
)
  throw new Error("Unexpected baseline repair scope.");
const exceptions = new Map(
  repairs.files.map((row) => [row.file, row.after_sha256]),
);
const acceptedRepairs = [];
for (const row of receipt.files) {
  if (
    path.isAbsolute(row.file) ||
    row.file.split("/").includes("..") ||
    /(^|\/)\.env(?:\.|$)/.test(row.file)
  )
    throw new Error("Invalid normalization receipt path.");
  const bytes = readFileSync(path.join(root, row.file));
  const blob = execFileSync("git", ["show", `HEAD:${row.file}`], { cwd: root });
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (exceptions.has(row.file)) {
    if (digest !== exceptions.get(row.file)) mismatches.push(row.file);
    else acceptedRepairs.push(row.file);
  } else if (digest !== row.after_sha256 || !bytes.equals(blob))
    mismatches.push(row.file);
}
const result = {
  checked_files: receipt.files.length,
  unchanged_head_blob_files:
    receipt.files.length - acceptedRepairs.length - mismatches.length,
  explicitly_authorized_repairs: acceptedRepairs,
  matches_authorized_scope:
    mismatches.length === 0 && acceptedRepairs.length === 2,
  mismatches,
  note: "Git status can show authorised LF checkout changes under system core.autocrlf=true even when normalized content diff is empty. No index, Git config or protected-original file was changed by this verifier.",
};
writeFileSync(
  path.join(evidence, "lf-verification.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result));
if (mismatches.length) process.exitCode = 1;
