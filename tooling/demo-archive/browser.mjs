import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
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
if (
  process.argv.slice(2).join(" ") !== "--suite browse" ||
  existsSync(path.join(root, ".env"))
)
  throw new Error("Use --suite browse without a root environment file.");
const target = JSON.parse(
  readFileSync(path.join(evidence, "task-17-target.json"), "utf8"),
);
const release = JSON.parse(
  readFileSync(path.join(evidence, "release-receipt.json"), "utf8"),
);
if (
  !/^[a-f0-9]{64}$/.test(target.container_id) ||
  target.source_digest !== release.source_digest
)
  throw new Error("Owned main database receipt required.");
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) =>
    /^(path|systemroot|windir|comspec|pathext|temp|tmp|home|userprofile|appdata|localappdata|pnpm_home|npm_execpath)$/i.test(
      name,
    ),
  ),
);
const password = randomBytes(32).toString("base64url");
const redact = (s) =>
  s
    .split(password)
    .join("[REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/\$argon2[^\s"']+/g, "[REDACTED_HASH]");
const run = (command, args, input, log) => {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    input,
    encoding: "utf8",
    maxBuffer: 8 * 1024 ** 2,
  });
  if (log)
    writeFileSync(
      path.join(evidence, log),
      redact(`${result.stdout ?? ""}${result.stderr ?? ""}`),
    );
  if (result.status !== 0)
    throw new Error("Owned browser command failed; see redacted browser log.");
  return result.stdout.trim();
};
const endpoint = run("docker", [
  "context",
  "inspect",
  "--format",
  "{{.Endpoints.docker.Host}}",
]);
if (!endpoint.startsWith("npipe:") && !endpoint.startsWith("unix:"))
  throw new Error("Remote Docker context refused.");
const fmt =
  '{"id":{{json .Id}},"label":{{json (index .Config.Labels "com.northbridge-vale.archive")}},"ports":{{json .NetworkSettings.Ports}}}';
const info = JSON.parse(
  run("docker", ["inspect", "--format", fmt, target.container_id]),
);
if (
  info.id !== target.container_id ||
  info.label !== release.source_digest ||
  info.ports["5432/tcp"]?.[0]?.HostPort !== "55433" ||
  info.ports["5432/tcp"]?.[0]?.HostIp !== "127.0.0.1"
)
  throw new Error("Main database Docker proof mismatch.");
for (const port of [35533, 35534])
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  });
const name = `agency_archive_qa_${randomBytes(6).toString("hex")}`;
const peer = (sql) =>
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
      "agency_demo_archive",
    ],
    sql,
  );
peer(
  `CREATE ROLE "${name}" LOGIN PASSWORD '${password}'; ALTER ROLE "${name}" SET default_transaction_read_only = on; GRANT CONNECT ON DATABASE agency_demo_archive TO "${name}"; GRANT USAGE ON SCHEMA public TO "${name}"; GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${name}";`,
);
env.DATABASE_URL = `postgresql://${name}:${password}@127.0.0.1:55433/agency_demo_archive`;
env.DEMO_ARCHIVE_QA_ROLE = name;
env.DEMO_ARCHIVE_CONTAINER = target.container_id;
env.API_INTERNAL_URL = "http://127.0.0.1:35533";
env.PUBLIC_ORIGIN = "http://127.0.0.1:35534";
env.NODE_ENV = "test";
env.APP_ENV = "test";
const pnpm =
  process.env.npm_execpath ??
  path.join(
    path.dirname(process.execPath),
    "node_modules/corepack/dist/pnpm.js",
  );
try {
  run(
    process.execPath,
    [pnpm, "--filter", "@agency/web", "build"],
    undefined,
    "task-18-web-build.log",
  );
  run(
    process.execPath,
    [
      pnpm,
      "--filter",
      "@agency/api",
      "exec",
      "tsx",
      "prisma/demo-archive/qa/browser.ts",
    ],
    undefined,
    "task-18-browser-runtime.log",
  );
} finally {
  peer(
    `REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM "${name}"; REVOKE USAGE ON SCHEMA public FROM "${name}"; REVOKE CONNECT ON DATABASE agency_demo_archive FROM "${name}"; DROP ROLE "${name}";`,
  );
  writeFileSync(
    path.join(evidence, "task-18-access-cleanup.json"),
    JSON.stringify(
      {
        role: name,
        dropped: true,
        target_container: target.container_id,
        password_exported: false,
        existing_credentials_rotated: false,
        authorization:
          "User explicitly approved temporary QA session and read-only PostgreSQL role; existing passwords/sessions and Git configuration unchanged.",
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  "Main archive browser checks finished; temporary QA access removed.",
);
