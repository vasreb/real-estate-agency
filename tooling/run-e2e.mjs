// End-to-end harness: production builds, isolated test DB, compiled API and
// `next start` on dedicated ports, Playwright, and teardown even on failure.
// Extra CLI args are forwarded to `playwright test`.
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { loadRootEnv, rootDirectory, testEnvironment } from "./env.mjs";

const WEB_PORT = 3100;
const API_PORT = 3101;
const origin = `http://localhost:${WEB_PORT}`;
const shared = {
  API_HOST: "127.0.0.1",
  API_PORT: String(API_PORT),
  API_INTERNAL_URL: `http://127.0.0.1:${API_PORT}`,
  PUBLIC_ORIGIN: origin,
  E2E_BASE_URL: origin,
  LOG_LEVEL: "warn",
  // The web server (on loopback) is the only trusted hop for client IPs.
  TRUSTED_PROXIES: "127.0.0.1",
};
const rootEnv = loadRootEnv(shared);
// The suite never calls real model providers: it is deterministic and free.
// Personal keys from `.env` would switch the assistant on.
for (const key of ["ANTHROPIC_API_KEY", "VOYAGE_API_KEY"]) delete rootEnv[key];
// Tooling steps get the root env (their own guards derive the test target);
// runtime processes get the guarded test database as DATABASE_URL.
const env = { ...testEnvironment(rootEnv), ...shared };
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error("Run with `pnpm test:e2e`.");

function run(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [pnpm, ...args], {
    cwd: rootDirectory,
    env: { ...rootEnv, ...extraEnv },
    stdio: "inherit",
  });
  if (result.status !== 0)
    throw new Error(`Step failed (${result.status}): pnpm ${args.join(" ")}`);
}

async function assertPortFree(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(1000),
    });
  } catch {
    return;
  }
  throw new Error(
    `Port ${port} is already in use; refusing to test against an unknown process.`,
  );
}

async function waitReady(url, child, name) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (child.exitCode !== null)
      throw new Error(`${name} exited before becoming ready.`);
    try {
      await fetch(url, { redirect: "manual" });
      return;
    } catch {
      await sleep(200);
    }
  }
  throw new Error(`${name} readiness timeout.`);
}

const children = [];
function start(name, args, cwd, extraEnv = {}) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...env, ...extraEnv },
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.once("error", () => {});
  children.push(child);
  return child;
}
async function teardown() {
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null) return resolve();
          child.once("exit", resolve);
          child.kill();
          setTimeout(() => {
            if (child.exitCode === null) child.kill("SIGKILL");
          }, 5000).unref();
        }),
    ),
  );
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    void teardown().finally(() => process.exit(130));
  });

let status;
try {
  await assertPortFree(WEB_PORT);
  await assertPortFree(API_PORT);
  // API_INTERNAL_URL is baked into Next rewrites at build time.
  run(["build"]);
  run(["db:test:prepare"]);
  const api = start(
    "api",
    ["dist/server.js"],
    path.join(rootDirectory, "apps/api"),
  );
  const web = start(
    "web",
    [
      path.join(rootDirectory, "apps/web/server.mjs"),
      "--hostname",
      "127.0.0.1",
      "--port",
      String(WEB_PORT),
    ],
    path.join(rootDirectory, "apps/web"),
    { NODE_ENV: "production" },
  );
  await waitReady(`http://127.0.0.1:${API_PORT}/api/deals`, api, "API");
  await waitReady(`http://127.0.0.1:${WEB_PORT}/login`, web, "Web");
  const result = spawnSync(
    process.execPath,
    [
      path.join(rootDirectory, "apps/web/node_modules/@playwright/test/cli.js"),
      "test",
      ...process.argv.slice(2),
    ],
    {
      cwd: path.join(rootDirectory, "apps/web"),
      env,
      stdio: "inherit",
    },
  );
  status = result.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  status = 1;
} finally {
  await teardown();
}
process.exit(status);
