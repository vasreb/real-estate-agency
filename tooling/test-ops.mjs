// Operations checks without any deployment:
//   pnpm test:ops             production compose shape + backup/restore smoke
//   pnpm test:ops --negative  refusals before any write
//   pnpm test:ops --build     additionally builds both images (downloads base images)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadRootEnv, rootDirectory, testEnvironment } from "./env.mjs";

const RESTORE_DB = "agency_test_restore";
const TEST_SERVICE = "postgres-test";
const TEST_USER = "agency_test";

function sh(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: rootDirectory,
    encoding: options.encoding === null ? undefined : "utf8",
    maxBuffer: 1 << 30,
    ...options,
  });
}
function ok(result, label) {
  if (result.status !== 0)
    throw new Error(
      `${label} failed (${result.status}): ${String(result.stderr).slice(0, 500)}`,
    );
  return result;
}

const productionEnv = {
  ...process.env,
  POSTGRES_PASSWORD: "ops-check-only",
  POSTGRES_TEST_PASSWORD: "ops-check-only",
  DATABASE_URL: "postgresql://agency:ops-check-only@postgres:5432/agency",
  PUBLIC_ORIGIN: "https://agency.example",
  // The indexing worker cannot start without an embeddings key.
  VOYAGE_API_KEY: "ops-check-only",
};

// An empty env file keeps the developer's .env out of production checks.
const emptyEnvFile = path.join(
  mkdtempSync(path.join(tmpdir(), "agency-ops-")),
  "empty.env",
);
writeFileSync(emptyEnvFile, "");

function composeConfig(env) {
  return sh(
    "docker",
    [
      "compose",
      "--env-file",
      emptyEnvFile,
      "-f",
      "compose.yaml",
      "-f",
      "compose.production.yaml",
      "config",
      "--format",
      "json",
    ],
    { env },
  );
}

/** Only the disposable restore database on the test service is accepted. */
export function assertRestoreTarget(service, database) {
  if (service !== TEST_SERVICE || database !== RESTORE_DB)
    throw new Error(
      `Refusing restore into ${service}/${database}: only ${TEST_SERVICE}/${RESTORE_DB} is allowed.`,
    );
}

function psql(database, sql) {
  return ok(
    sh("docker", [
      "compose",
      "--profile",
      "test",
      "exec",
      "-T",
      TEST_SERVICE,
      "psql",
      "-U",
      TEST_USER,
      "-d",
      database,
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ]),
    `psql ${database}`,
  ).stdout.trim();
}

const fingerprint = (database) =>
  psql(
    database,
    "SELECT id, encode(sha256(file_data), 'hex'), coalesce(parent_document_id::text, '-'), octet_length(file_data) FROM documents ORDER BY id",
  );

function checkComposeShape() {
  const config = JSON.parse(
    ok(composeConfig(productionEnv), "compose config").stdout,
  );
  const services = config.services;
  assert.deepEqual(services.api.ports ?? [], [], "API must not be published");
  assert.deepEqual(
    services.postgres.ports ?? [],
    [],
    "PostgreSQL must not be published",
  );
  assert.equal(services.web.ports?.length, 1, "web is the single ingress");
  assert.ok(!services.migrate, "migrate runs only via its explicit profile");
  assert.equal(services.api.environment.NODE_ENV, "production");
  const webAddress = services.web.networks?.internal?.ipv4_address;
  assert.ok(webAddress, "web has a fixed internal address");
  assert.equal(
    services.api.environment.TRUSTED_PROXIES,
    webAddress,
    "API trusts forwarded client IPs only from the web container",
  );
  assert.ok(
    config.volumes["agency-data"],
    "database volume is declared, never removed",
  );
  console.log(
    "PASS production compose: only web published; API/DB internal; migrate is explicit; API trusts only the web address",
  );
}

function backupRestoreSmoke() {
  testEnvironment(loadRootEnv()); // guard: test DB configuration must be safe
  ok(
    sh("docker", [
      "compose",
      "--profile",
      "test",
      "up",
      "-d",
      "--wait",
      TEST_SERVICE,
    ]),
    "test db up",
  );
  assertRestoreTarget(TEST_SERVICE, RESTORE_DB);
  const dump = ok(
    sh(
      "docker",
      [
        "compose",
        "--profile",
        "test",
        "exec",
        "-T",
        TEST_SERVICE,
        "pg_dump",
        "-U",
        TEST_USER,
        "-Fc",
        "agency_test",
      ],
      { encoding: null },
    ),
    "pg_dump",
  ).stdout;
  assert.ok(dump.length > 0, "dump is not empty");
  psql("postgres", `DROP DATABASE IF EXISTS ${RESTORE_DB}`);
  psql("postgres", `CREATE DATABASE ${RESTORE_DB}`);
  try {
    ok(
      sh(
        "docker",
        [
          "compose",
          "--profile",
          "test",
          "exec",
          "-T",
          TEST_SERVICE,
          "pg_restore",
          "-U",
          TEST_USER,
          "-d",
          RESTORE_DB,
          "--no-owner",
          "--exit-on-error",
        ],
        { input: dump, encoding: null },
      ),
      "pg_restore",
    );
    const source = fingerprint("agency_test");
    const restored = fingerprint(RESTORE_DB);
    assert.ok(source.split("\n").length >= 3, "source has seeded documents");
    assert.equal(restored, source, "restored originals and parent links match");
    console.log(
      `PASS backup/restore: ${source.split("\n").length} documents, sha256 of every original and parent links equal after pg_dump -Fc / pg_restore`,
    );
  } finally {
    psql("postgres", `DROP DATABASE IF EXISTS ${RESTORE_DB}`);
  }
}

function negative() {
  // 1. Production compose refuses to render without required settings.
  const missing = { ...productionEnv };
  delete missing.PUBLIC_ORIGIN;
  const config = composeConfig(missing);
  assert.notEqual(config.status, 0);
  assert.match(config.stderr, /PUBLIC_ORIGIN/);
  console.log("PASS missing PUBLIC_ORIGIN rejected before anything starts");
  // 2. Restore into any database other than the disposable one is refused before any command.
  for (const [service, database] of [
    ["postgres", "agency"],
    [TEST_SERVICE, "agency_test"],
    [TEST_SERVICE, "agency"],
  ])
    assert.throws(
      () => assertRestoreTarget(service, database),
      /Refusing restore/,
    );
  console.log("PASS restore refuses non-disposable targets before any command");
  // 3. Production seed is refused before connecting.
  const seed = sh(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"],
    {
      cwd: `${rootDirectory}apps/api`,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://x:y@127.0.0.1:1/agency",
      },
    },
  );
  assert.notEqual(seed.status, 0);
  assert.match(seed.stderr, /forbidden in production/);
  console.log("PASS production seed refused before any database connection");
}

function buildImages() {
  ok(
    sh(
      "docker",
      [
        "compose",
        "--env-file",
        emptyEnvFile,
        "-f",
        "compose.yaml",
        "-f",
        "compose.production.yaml",
        "build",
        "api",
        "web",
      ],
      {
        env: productionEnv,
        stdio: "inherit",
      },
    ),
    "image build",
  );
  console.log("PASS images built");
}

try {
  if (process.argv.includes("--negative")) negative();
  else {
    checkComposeShape();
    backupRestoreSmoke();
    if (process.argv.includes("--build")) buildImages();
  }
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
