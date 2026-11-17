import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
if (
  [process.env.NODE_ENV, process.env.APP_ENV].some(
    (v) => v?.toLowerCase() === "production",
  )
)
  throw new Error("Archive QA harness is forbidden in production.");
const evidence = path.join(root, ".omo/evidence/realistic-agency-archive");
if (process.argv.length !== 2 || existsSync(path.join(root, ".env")))
  throw new Error(
    "Baseline harness requires no target overrides or root environment file.",
  );
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) =>
    /^(path|systemroot|windir|comspec|pathext|temp|tmp|home|userprofile|appdata|localappdata|pnpm_home|npm_execpath)$/i.test(
      name,
    ),
  ),
);
const pnpm =
  process.env.npm_execpath ??
  path.join(
    path.dirname(process.execPath),
    "node_modules/corepack/dist/pnpm.js",
  );
const password = randomBytes(32).toString("base64url");
const safe = (value) =>
  value
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/\$argon2[^\s"']+/g, "[REDACTED_HASH]")
    .split(password)
    .join("[REDACTED_PASSWORD]");
const run = (command, args, log, allowFailure = false) => {
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 ** 2,
  });
  if (log)
    writeFileSync(
      path.join(evidence, log),
      safe(`${result.stdout ?? ""}${result.stderr ?? ""}`),
    );
  if (!allowFailure && result.status !== 0)
    throw new Error(
      "Owned baseline command failed; no environment values logged.",
    );
  return {
    exit_status: result.status,
    elapsed_ms: Math.round(performance.now() - started),
    stdout: result.stdout ?? "",
  };
};
const endpoint = run(
  "docker",
  ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
  null,
).stdout.trim();
if (!endpoint.startsWith("npipe:") && !endpoint.startsWith("unix:"))
  throw new Error("Remote Docker context refused.");
for (const port of [55434, 3100, 3101])
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
const source = JSON.parse(
  readFileSync(path.join(evidence, "release-receipt.json"), "utf8"),
);
const suffix = randomBytes(6).toString("hex");
const container = `agency-archive-baseline-${suffix}`;
const volume = `${container}-data`;
if (
  run("docker", ["inspect", "--format", "{{.Id}}", container], null, true)
    .exit_status === 0 ||
  run(
    "docker",
    ["volume", "inspect", "--format", "{{.Name}}", volume],
    null,
    true,
  ).exit_status === 0
)
  throw new Error(
    "Owned baseline container/volume collision; no reuse permitted.",
  );
env.POSTGRES_PASSWORD = password;
env.POSTGRES_USER = "agency_test";
env.POSTGRES_DB = "agency_test";
run(
  "docker",
  [
    "volume",
    "create",
    "--label",
    `com.northbridge-vale.archive-baseline=${source.source_digest}`,
    volume,
  ],
  null,
);
const id = run(
  "docker",
  [
    "run",
    "--detach",
    "--name",
    container,
    "--label",
    `com.northbridge-vale.archive-baseline=${source.source_digest}`,
    "--publish",
    "127.0.0.1:55434:5432",
    "--mount",
    `type=volume,src=${volume},dst=/var/lib/postgresql`,
    "--env",
    "POSTGRES_PASSWORD",
    "--env",
    "POSTGRES_USER",
    "--env",
    "POSTGRES_DB",
    "postgres:18",
  ],
  null,
).stdout.trim();
const target = {
  container,
  container_id: id,
  volume,
  host: "127.0.0.1",
  port: 55434,
  database: "agency_test",
  archive_database_touched: false,
  credentials: "Ephemeral process-only; never serialized",
};
writeFileSync(
  path.join(evidence, "task-20-baseline-target.json"),
  JSON.stringify(target, null, 2) + "\n",
);
let ready = false;
for (let i = 0; i < 60; i++) {
  if (
    run(
      "docker",
      ["exec", id, "pg_isready", "-U", "agency_test", "-d", "agency_test"],
      null,
      true,
    ).exit_status === 0
  ) {
    ready = true;
    break;
  }
  await setTimeout(500);
}
if (!ready) throw new Error("Fresh baseline database did not become ready.");
env.NODE_ENV = "test";
env.APP_ENV = "test";
env.TEST_DATABASE_URL = `postgresql://agency_test:${password}@127.0.0.1:55434/agency_test`;
env.DATABASE_URL =
  "postgresql://agency_archive:unused-configuration-only@127.0.0.1:55433/agency_demo_archive";
env.PUBLIC_ORIGIN = "http://localhost:3100";
const results = [];
for (const [script, log] of [
  ["test:integration", "task-20-baseline-integration.log"],
  ["test:e2e", "task-20-baseline-e2e.log"],
]) {
  const result = run(process.execPath, [pnpm, script], log, true);
  results.push({
    command: `pnpm ${script}`,
    exit_status: result.exit_status,
    elapsed_ms: result.elapsed_ms,
    log,
  });
  console.log(
    `Isolated baseline ${script}: exit ${result.exit_status}; only agency_test/55434 may be reset.`,
  );
}
const unchanged = createHash("sha256")
  .update(
    readFileSync(path.join(root, ".omo/plans/realistic-agency-archive.md")),
  )
  .digest("hex");
writeFileSync(
  path.join(evidence, "task-20-baseline-checks.json"),
  JSON.stringify(
    {
      source_digest: source.source_digest,
      zip_sha256: source.zip_sha256,
      target,
      approved_plan_sha256: unchanged,
      passed: results.every((r) => r.exit_status === 0),
      results,
      final_release_accepted: false,
    },
    null,
    2,
  ) + "\n",
);
if (results.some((r) => r.exit_status !== 0)) process.exitCode = 1;
