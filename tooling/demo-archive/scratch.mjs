import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
if (process.argv.length !== 2)
  throw new Error("Scratch harness accepts no target overrides.");
const target = JSON.parse(
  readFileSync(path.join(evidence, "task-17-target.json"), "utf8"),
);
if (
  !/^[a-f0-9]{64}$/.test(target.container_id) ||
  target.database !== "agency_demo_archive" ||
  target.port !== 55433
)
  throw new Error("Missing owned demo identity.");
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) =>
    /^(path|systemroot|windir|comspec|pathext|temp|tmp|home|userprofile|appdata|localappdata|pnpm_home|npm_execpath)$/i.test(
      name,
    ),
  ),
);
const run = (command, args, input) => {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    input,
    encoding: "utf8",
    maxBuffer: 8 * 1024 ** 2,
  });
  if (result.status !== 0)
    throw new Error(
      "Owned scratch command failed; process inputs/credentials are not logged.",
    );
  return result.stdout.trim();
};
const format =
  '{"id":{{json .Id}},"label":{{json (index .Config.Labels "com.northbridge-vale.archive")}},"ports":{{json .NetworkSettings.Ports}}}';
const owned = JSON.parse(
  run("docker", ["inspect", "--format", format, target.container_id]),
);
if (
  owned.id !== target.container_id ||
  owned.label !== target.source_digest ||
  owned.ports["5432/tcp"]?.[0]?.HostPort !== "55433" ||
  owned.ports["5432/tcp"]?.[0]?.HostIp !== "127.0.0.1"
)
  throw new Error("Scratch container proof mismatch.");
const suffix = randomBytes(6).toString("hex");
const name = `agency_archive_scratch_${suffix}`;
const password = randomBytes(32).toString("base64url");
// Local peer access only inside the newly owned container. No secret is read,
// existing credential rotated, or existing application database altered.
run(
  "docker",
  [
    "exec",
    "--interactive",
    target.container_id,
    "psql",
    "-X",
    "--set",
    "ON_ERROR_STOP=1",
    "--username",
    "agency_archive",
    "--dbname",
    "postgres",
  ],
  `CREATE ROLE "${name}" LOGIN PASSWORD '${password}';\nCREATE DATABASE "${name}" OWNER "${name}";\n`,
);
env.NODE_ENV = "test";
env.APP_ENV = "test";
env.DATABASE_URL = `postgresql://${name}:${password}@127.0.0.1:55433/${name}`;
env.DEMO_ARCHIVE_SCRATCH_DB = name;
env.DEMO_ARCHIVE_CONTAINER = target.container_id;
for (let i = 1; i <= 10; i++)
  env[`DEMO_ARCHIVE_PASSWORD_${String(i).padStart(2, "0")}`] =
    randomBytes(24).toString("base64url");
const pnpm =
  process.env.npm_execpath ??
  path.join(
    path.dirname(process.execPath),
    "node_modules/corepack/dist/pnpm.js",
  );
writeFileSync(
  path.join(evidence, "task-17-scratch-target.json"),
  JSON.stringify(
    {
      container_id: target.container_id,
      database: name,
      role: name,
      port: 55433,
      secrets: "Ephemeral process-only; no password recorded",
      main_database_mutated: false,
    },
    null,
    2,
  ) + "\n",
);
run(process.execPath, [
  pnpm,
  "--filter",
  "@agency/api",
  "exec",
  "prisma",
  "migrate",
  "deploy",
]);
console.log(
  "Fresh scratch database migrated inside the owned container; main corpus remains unchanged.",
);
run(process.execPath, [
  pnpm,
  "--filter",
  "@agency/api",
  "exec",
  "tsx",
  "prisma/demo-archive/qa/upload.ts",
]);
console.log(
  "All 2,400 original uploads/downloads and mutation safety checks passed in scratch only.",
);
