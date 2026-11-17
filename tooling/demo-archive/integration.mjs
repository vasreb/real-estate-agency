import { spawnSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
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
const planPin =
  "286f5c4ccf9313234bd626d014fbee050c985d5c7fe8f812929d3f7ca2d328fb";
if (
  createHash("sha256")
    .update(
      readFileSync(path.join(root, ".omo/plans/realistic-agency-archive.md")),
    )
    .digest("hex") !== planPin
)
  throw new Error("Approved plan changed.");
if (process.argv.slice(2).join(" ") !== "--suite import")
  throw new Error("Use --suite import; later suites are not silently skipped.");
const receipt = JSON.parse(
  readFileSync(path.join(evidence, "release-receipt.json"), "utf8"),
);
const pnpm =
  process.env.npm_execpath ??
  path.join(
    path.dirname(process.execPath),
    "node_modules/corepack/dist/pnpm.js",
  );
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) =>
    /^(path|systemroot|windir|comspec|pathext|temp|tmp|home|userprofile|appdata|localappdata|pnpm_home|npm_execpath)$/i.test(
      name,
    ),
  ),
);
env.NODE_ENV = "test";
env.APP_ENV = "test";
const run = (command, args, childEnv = env, permitFailure = false) => {
  const result = spawnSync(command, args, {
    cwd: root,
    env: childEnv,
    encoding: "utf8",
    maxBuffer: 8 * 1024 ** 2,
  });
  if (result.status !== 0 && !permitFailure)
    throw new Error(
      `Isolated harness command failed: ${command === process.execPath ? "node/pnpm" : command}; no credentials or child environment logged.`,
    );
  return result;
};
const docker = (args, permitFailure = false) =>
  run("docker", args, env, permitFailure);
const endpoint = docker([
  "context",
  "inspect",
  "--format",
  "{{.Endpoints.docker.Host}}",
]).stdout.trim();
if (!endpoint.startsWith("npipe:") && !endpoint.startsWith("unix:"))
  throw new Error("Remote Docker context refused.");
await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once("error", reject);
  probe.listen(55433, "127.0.0.1", () =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
});
const suffix = randomBytes(6).toString("hex");
const container = `agency-archive-demo-${suffix}`;
const volume = `${container}-data`;
if (
  docker(["inspect", "--format", "{{.Id}}", container], true).status === 0 ||
  docker(["volume", "inspect", "--format", "{{.Name}}", volume], true)
    .status === 0
)
  throw new Error(
    "Container/volume collision; no reuse or deletion permitted.",
  );
docker(["image", "inspect", "postgres:18", "--format", "{{.Id}}"]);
env.POSTGRES_PASSWORD = randomBytes(32).toString("base64url");
env.POSTGRES_USER = "agency_archive";
env.POSTGRES_DB = "agency_demo_archive";
for (let i = 1; i <= 10; i++)
  env[`DEMO_ARCHIVE_PASSWORD_${String(i).padStart(2, "0")}`] =
    randomBytes(24).toString("base64url");
env.DEMO_ARCHIVE_APP_OFFLINE = "true";
docker([
  "volume",
  "create",
  "--label",
  `com.northbridge-vale.archive=${receipt.source_digest}`,
  volume,
]);
const created = docker([
  "run",
  "--detach",
  "--name",
  container,
  "--label",
  `com.northbridge-vale.archive=${receipt.source_digest}`,
  "--publish",
  "127.0.0.1:55433:5432",
  "--mount",
  `type=volume,src=${volume},dst=/var/lib/postgresql`,
  "--env",
  "POSTGRES_PASSWORD",
  "--env",
  "POSTGRES_USER",
  "--env",
  "POSTGRES_DB",
  "postgres:18",
]);
env.DEMO_ARCHIVE_CONTAINER = created.stdout.trim();
env.DATABASE_URL = `postgresql://agency_archive:${encodeURIComponent(env.POSTGRES_PASSWORD)}@127.0.0.1:55433/agency_demo_archive`;
const identity = {
  container,
  container_id: env.DEMO_ARCHIVE_CONTAINER,
  volume,
  host: "127.0.0.1",
  port: 55433,
  database: "agency_demo_archive",
  role: "agency_archive",
  source_digest: receipt.source_digest,
  zip_sha256: receipt.zip_sha256,
  credentials:
    "Generated ephemerally in this process; never serialized or printed",
  state: "created; migration/import pending",
};
writeFileSync(
  path.join(evidence, "task-17-target.json"),
  JSON.stringify(identity, null, 2) + "\n",
);
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  if (
    docker(
      [
        "exec",
        env.DEMO_ARCHIVE_CONTAINER,
        "pg_isready",
        "-U",
        "agency_archive",
        "-d",
        "agency_demo_archive",
      ],
      true,
    ).status === 0
  ) {
    ready = true;
    break;
  }
  await setTimeout(500);
}
if (!ready)
  throw new Error(
    "Fresh archive PostgreSQL did not become ready; no existing service touched.",
  );
run(
  process.execPath,
  [pnpm, "--filter", "@agency/api", "exec", "prisma", "migrate", "deploy"],
  env,
);
console.log(
  "Fresh owned PostgreSQL 18 migrated on loopback 55433; no baseline seed/reset invoked.",
);
run(
  process.execPath,
  [
    pnpm,
    "--filter",
    "@agency/api",
    "exec",
    "tsx",
    "prisma/demo-archive/qa/integration.ts",
    "--phase",
    "rollback",
  ],
  env,
);
console.log(
  "Injected mid-import failure rolled back; matching partial rows prepared safely.",
);
run(
  process.execPath,
  [
    pnpm,
    "--filter",
    "@agency/api",
    "exec",
    "tsx",
    "prisma/demo-archive/cli.ts",
    "import",
    "--input",
    "out/agency-demo-archive-v1.zip",
    "--expected-sha256",
    receipt.zip_sha256,
    "--confirm",
    "agency_demo_archive",
  ],
  env,
);
console.log(
  "All archive data and original bytes committed to agency_demo_archive.",
);
run(
  process.execPath,
  [
    pnpm,
    "--filter",
    "@agency/api",
    "exec",
    "tsx",
    "prisma/demo-archive/qa/integration.ts",
    "--phase",
    "verify",
  ],
  env,
);
console.log(
  "Exact rerun, database bytes and ten ephemeral account logins verified through the real application.",
);
writeFileSync(
  path.join(evidence, "task-17-target.json"),
  JSON.stringify(
    {
      ...identity,
      state:
        "imported and verified; container left running; no cleanup/deletion performed",
    },
    null,
    2,
  ) + "\n",
);
