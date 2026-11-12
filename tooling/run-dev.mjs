import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { loadRootEnv, rootDirectory } from "./env.mjs";

const env = loadRootEnv();
if (!env.DATABASE_URL || !env.PUBLIC_ORIGIN)
  throw new Error("Set DATABASE_URL and PUBLIC_ORIGIN in the root .env first.");
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error("Use pnpm dev.");
const build = spawnSync(process.execPath, [pnpm, "build:shared"], {
  env,
  cwd: rootDirectory,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (process.platform === "win32" && child.pid) {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else child.kill("SIGTERM");
  }
}
for (const [directory, command, args] of [
  [
    "packages/contracts",
    "typescript/bin/tsc",
    ["-p", "tsconfig.build.json", "--watch"],
  ],
  [
    "packages/ui",
    "typescript/bin/tsc",
    ["-p", "tsconfig.build.json", "--watch"],
  ],
  ["apps/api", "tsx/dist/cli.mjs", ["watch", "src/server.ts"]],
  [
    "apps/web",
    "next/dist/bin/next",
    ["dev", "--hostname", "127.0.0.1", "--port", "3000"],
  ],
]) {
  const cwd = path.join(rootDirectory, directory);
  const child = spawn(
    process.execPath,
    [path.join(cwd, "node_modules", command), ...args],
    { cwd, env, stdio: "inherit" },
  );
  children.push(child);
  child.once("error", () => stop(1));
  child.once("exit", (code) => {
    if (!stopping) stop(code || 1);
  });
}
process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());
