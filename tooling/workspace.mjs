import { spawnSync } from "node:child_process";
import { validateWorkspace } from "./test-workspace.mjs";
import { loadRootEnv } from "./env.mjs";

validateWorkspace();
Object.assign(process.env, loadRootEnv());
const mode = process.argv[2];
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error("Run this command with pnpm.");
function run(name, script) {
  const result = spawnSync(
    process.execPath,
    [pnpm, "--filter", `@agency/${name}`, "--fail-if-no-match", script],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
for (const name of ["config", "contracts", "ui"]) run(name, "build");
if (mode === "shared") process.exit(0);
if (mode === "typecheck" || mode === "build") {
  run("api", "db:generate");
  for (const name of ["config", "contracts", "ui", "api", "web"])
    run(name, mode);
} else if (mode === "test:unit") {
  run("config", "typecheck");
  for (const name of ["contracts", "ui", "web"]) run(name, "test");
  run("api", "test:unit");
  const result = spawnSync(
    process.execPath,
    ["--test", "tooling/tests/*.test.mjs"],
    {
      stdio: "inherit",
    },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
} else throw new Error(`Unknown workspace operation: ${mode}`);
