import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function prepareHooks({
  cwd = process.cwd(),
  run = spawnSync,
  log = console.log,
} = {}) {
  // .git is a directory in the primary checkout and a file in linked worktrees.
  if (!existsSync(path.join(cwd, ".git"))) {
    log("Husky: skipped (no Git repository).");
    return 0;
  }
  const executable = fileURLToPath(
    new URL("../node_modules/husky/bin.js", import.meta.url),
  );
  const result = run(process.execPath, [executable], { cwd, stdio: "inherit" });
  return result.status ?? 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = prepareHooks();
