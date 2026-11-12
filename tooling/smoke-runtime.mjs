import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { loadRootEnv, rootDirectory } from "./env.mjs";

const env = loadRootEnv({
  API_PORT: "3101",
  API_INTERNAL_URL: "http://127.0.0.1:3101",
  PUBLIC_ORIGIN: "http://localhost:3100",
  LOG_LEVEL: "silent",
});
const children = [];
function start(args) {
  const child = spawn(process.execPath, args, {
    cwd: rootDirectory,
    env,
    stdio: "pipe",
  });
  children.push(child);
  child.stderr.on("data", () => {});
  child.stdout.on("data", () => {});
  child.once("error", () => {});
  return child;
}
async function waitFor(url, child) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null)
      throw new Error("Runtime exited before becoming ready.");
    try {
      return await fetch(url, { redirect: "manual" });
    } catch {
      await setTimeout(100);
    }
  }
  throw new Error("Runtime readiness timeout.");
}
try {
  // Refuse to reuse or stop an existing user process on either required port.
  for (const port of [3100, 3101]) {
    let inUse = false;
    try {
      await fetch(`http://127.0.0.1:${port}`, {
        signal: AbortSignal.timeout(500),
      });
      inUse = true;
    } catch {
      /* no server */
    }
    if (inUse)
      throw new Error(
        `Port ${port} is already in use; refusing to reuse a user process.`,
      );
  }
  const build = spawnSync(
    process.execPath,
    ["apps/web/node_modules/next/dist/bin/next", "build", "apps/web"],
    { cwd: rootDirectory, env, stdio: "inherit" },
  );
  assert.equal(
    build.status,
    0,
    "Isolated-origin production build must succeed",
  );
  const api = start(["apps/api/dist/server.js"]);
  const apiResponse = await waitFor("http://127.0.0.1:3101/api/not-found", api);
  assert.equal(apiResponse.status, 404);
  assert.equal((await apiResponse.json()).code, "NOT_FOUND");
  const web = start([
    "apps/web/node_modules/next/dist/bin/next",
    "start",
    "apps/web",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ]);
  const root = await waitFor("http://127.0.0.1:3100", web);
  assert.equal(root.status, 307);
  assert.equal(root.headers.get("location"), "/deals");
  const proxy = await fetch("http://127.0.0.1:3100/api/not-found");
  assert.equal(proxy.status, 404);
  assert.equal((await proxy.json()).code, "NOT_FOUND");
  assert.equal(proxy.headers.get("cache-control"), "private, no-store");
  console.log(
    "Compiled API + Next production server: root redirect and same-origin rewrite verified.",
  );
} finally {
  for (const child of children) {
    if (child.pid && child.exitCode === null) {
      if (process.platform === "win32")
        spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      else child.kill("SIGTERM");
    }
  }
}
