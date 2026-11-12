import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (existsSync(".git")) {
  const result = spawnSync(process.execPath, ["node_modules/husky/bin.mjs"], {
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
} else {
  console.log("Husky: skipped (no Git repository).");
}
