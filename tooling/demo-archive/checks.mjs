import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const evidence = path.join(root, ".omo/evidence/realistic-agency-archive");
const pin = "286f5c4ccf9313234bd626d014fbee050c985d5c7fe8f812929d3f7ca2d328fb";
const plan = createHash("sha256")
  .update(
    readFileSync(path.join(root, ".omo/plans/realistic-agency-archive.md")),
  )
  .digest("hex");
if (plan !== pin) throw new Error("Approved plan digest mismatch.");
const suite = process.argv[2];
const scripts = {
  unit: [
    [
      "--filter",
      "@agency/api",
      "test:unit",
      "--testPathPatterns",
      "demo-archive-",
    ],
  ],
  "api-unit": [["--filter", "@agency/api", "test:unit"]],
  workspace: [["typecheck"], ["test:unit"]],
  static: [
    ["lint"],
    ["format:check"],
    ["--filter", "@agency/api", "typecheck"],
    ["check:architecture"],
    ["contracts:check"],
  ],
};
if (!scripts[suite] || process.argv.length !== 3)
  throw new Error(
    "Use checks.mjs unit|api-unit|static|workspace via pnpm exec node.",
  );
const pnpm =
  process.env.npm_execpath ??
  path.join(
    path.dirname(process.execPath),
    "node_modules/corepack/dist/pnpm.js",
  );
if (!lstatSync(pnpm).isFile())
  throw new Error(
    "A Node-runnable pnpm/Corepack entry point is required; no shell fallback.",
  );
// No .env loading or inherited connection strings, passwords or app targets.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) =>
    /^(path|systemroot|windir|comspec|pathext|temp|tmp|home|userprofile|appdata|localappdata|pnpm_home|npm_execpath)$/i.test(
      name,
    ),
  ),
);
env.NODE_ENV = "test";
if (suite === "workspace") {
  // Prisma generation requires a config URL but performs no DB connection.
  // Never inherit a developer URL merely to run all-workspace source checks.
  if (existsSync(path.join(root, ".env")))
    throw new Error("Workspace checks refuse root environment-file loading.");
  env.DATABASE_URL =
    "postgresql://agency_archive:configuration-only-unused@127.0.0.1:55433/agency_demo_archive";
}
for (const relative of [
  ".omo",
  ".omo/evidence",
  ".omo/evidence/realistic-agency-archive",
]) {
  try {
    if (lstatSync(path.join(root, relative)).isSymbolicLink())
      throw new Error("Linked evidence path refused.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
mkdirSync(evidence, { recursive: true });
const temporary = path.join(root, "out/agency-demo-archive/qa-temp");
for (const relative of [
  "out",
  "out/agency-demo-archive",
  "out/agency-demo-archive/qa-temp",
]) {
  try {
    if (lstatSync(path.join(root, relative)).isSymbolicLink())
      throw new Error("Linked temporary path refused.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
mkdirSync(temporary, { recursive: true });
for (const name of Object.keys(env))
  if (/^(temp|tmp)$/i.test(name)) delete env[name];
env.TEMP = temporary;
env.TMP = temporary;
const receipts = [];
for (const [index, args] of scripts[suite].entries()) {
  const start = performance.now();
  const result = spawnSync(process.execPath, [pnpm, ...args], {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 ** 2,
  });
  const elapsed_ms = Math.round(performance.now() - start);
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.replace(
    /postgres(?:ql)?:\/\/[^\s"']+/gi,
    "[REDACTED_DATABASE_URL]",
  );
  const log = `checks-${suite}-${index + 1}.log`;
  writeFileSync(path.join(evidence, log), output);
  console.log(
    `pnpm ${args.join(" ")}: exit ${result.status ?? "spawn-error"}, ${elapsed_ms}ms`,
  );
  receipts.push({
    command: `pnpm ${args.join(" ")}`,
    exit_status: result.status,
    elapsed_ms,
    log,
    spawn_error: result.error ? "Child process could not start" : null,
  });
}
const passed = receipts.every((receipt) => receipt.exit_status === 0);
const releaseFile = path.join(evidence, "release-receipt.json");
const release = existsSync(releaseFile)
  ? JSON.parse(readFileSync(releaseFile, "utf8"))
  : null;
writeFileSync(
  path.join(evidence, `checks-${suite}.json`),
  JSON.stringify(
    {
      approved_plan_sha256: plan,
      suite,
      passed,
      corpus_digest: release?.source_digest ?? null,
      zip_digest: release?.zip_sha256 ?? null,
      limitation:
        "Source checks only; packaged corpus/import/browser/final release acceptance require their separate receipts.",
      receipts,
    },
    null,
    2,
  ) + "\n",
);
if (!passed) process.exitCode = 1;
