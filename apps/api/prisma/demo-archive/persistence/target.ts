import { execFileSync } from "node:child_process";
import { assertOfflineEnvironment } from "../policy.js";

export function resolveImportTarget(
  env: NodeJS.ProcessEnv,
  confirmation: string,
) {
  assertOfflineEnvironment(env);
  if (
    confirmation !== "agency_demo_archive" ||
    env.DEMO_ARCHIVE_APP_OFFLINE !== "true" ||
    !env.DATABASE_URL ||
    !URL.canParse(env.DATABASE_URL) ||
    !/^[a-f0-9]{64}$/.test(env.DEMO_ARCHIVE_CONTAINER ?? "")
  )
    throw new Error(
      "Explicit offline disposable database/container confirmation required.",
    );
  const url = new URL(env.DATABASE_URL);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.port !== "55433" ||
    url.username !== "agency_archive" ||
    !url.password ||
    url.pathname !== "/agency_demo_archive" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Import target must be the dedicated local archive database on port 55433.",
    );
  return {
    databaseUrl: env.DATABASE_URL,
    containerId: env.DEMO_ARCHIVE_CONTAINER!,
  };
}
export function verifyOwnedTarget(
  target: ReturnType<typeof resolveImportTarget>,
  sourceDigest: string,
  originalBytes: number,
) {
  const docker = (args: string[]) =>
    execFileSync("docker", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 20_000,
    }).trim();
  const endpoint = docker([
    "context",
    "inspect",
    "--format",
    "{{.Endpoints.docker.Host}}",
  ]);
  if (!endpoint.startsWith("npipe:") && !endpoint.startsWith("unix:"))
    throw new Error("Nonlocal Docker context refused.");
  const format =
    '{"id":{{json .Id}},"image":{{json .Config.Image}},"label":{{json (index .Config.Labels "com.northbridge-vale.archive")}},"ports":{{json .NetworkSettings.Ports}}}';
  const info = JSON.parse(
    docker(["inspect", "--format", format, target.containerId]),
  ) as {
    id: string;
    image: string;
    label: string;
    ports: Record<string, { HostIp: string; HostPort: string }[] | null>;
  };
  const bindings = info.ports["5432/tcp"];
  if (
    info.id !== target.containerId ||
    info.image !== "postgres:18" ||
    info.label !== sourceDigest ||
    bindings?.length !== 1 ||
    bindings[0]!.HostIp !== "127.0.0.1" ||
    bindings[0]!.HostPort !== "55433"
  )
    throw new Error("Task-owned PostgreSQL 18 identity/label/port mismatch.");
  const df = docker([
    "exec",
    target.containerId,
    "df",
    "-Pk",
    "/var/lib/postgresql",
  ])
    .split(/\r?\n/)
    .at(-1)!
    .trim()
    .split(/\s+/);
  const freeBytes = Number(df[3]) * 1024;
  const required = originalBytes * 4 + 512 * 1024 ** 2;
  if (!Number.isSafeInteger(freeBytes) || freeBytes < required)
    throw new Error("Insufficient measured database/WAL capacity headroom.");
  return {
    container_id: target.containerId,
    database: "agency_demo_archive",
    role: "agency_archive",
    host: "127.0.0.1",
    port: 55433,
    postgres_major: 18,
    measured_db_wal_free_bytes: freeBytes,
    required_db_wal_free_bytes: required,
  };
}
