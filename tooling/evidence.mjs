import { spawn } from "node:child_process";
import { mkdirSync, appendFileSync, existsSync } from "node:fs";
import path from "node:path";
import { rootDirectory } from "./env.mjs";

const [label, executable, ...args] = process.argv.slice(2);
if (
  !label ||
  !/^[a-zA-Z0-9-]+$/.test(label) ||
  !["node", "pnpm", "docker"].includes(executable)
)
  throw new Error(
    "Usage: pnpm exec node tooling/evidence.mjs <label> <node|pnpm|docker> ...args",
  );
const directory = path.join(
  rootDirectory,
  ".omo/evidence/agency-base-implementation",
);
mkdirSync(directory, { recursive: true });
const file = path.join(directory, `${label}.log`);
const command =
  executable === "pnpm"
    ? process.execPath
    : executable === "node"
      ? process.execPath
      : "docker";
const pnpm =
  process.env.npm_execpath ??
  path.join(
    path.dirname(process.execPath),
    "node_modules/corepack/dist/pnpm.js",
  );
if (executable === "pnpm" && !existsSync(pnpm))
  throw new Error("Run via a pnpm script, or install the Corepack pnpm shim.");
const actualArgs = executable === "pnpm" ? [pnpm, ...args] : args;
appendFileSync(file, `\n$ ${executable} ${args.join(" ")}\n`);
const child = spawn(command, actualArgs, {
  cwd: rootDirectory,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});
function write(stream, data) {
  const safe = data
    .toString()
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "[DATABASE_URL]");
  stream.write(safe);
  appendFileSync(file, safe);
}
child.stdout.on("data", (data) => write(process.stdout, data));
child.stderr.on("data", (data) => write(process.stderr, data));
child.once("error", (error) => {
  write(process.stderr, error.message);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  appendFileSync(file, `\nExit: ${code}\n`);
  process.exitCode = code ?? 1;
});
