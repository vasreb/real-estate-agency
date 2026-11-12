import assert from "node:assert/strict";
import { test } from "node:test";
import { assertTestDatabase, testEnvironment, loadRootEnv } from "../env.mjs";

const env = {
  DATABASE_URL: "postgresql://local:local@localhost:5432/agency",
  TEST_DATABASE_URL: "postgresql://local:local@localhost:5433/agency_test",
};
test("explicit safe database is used with test override", () => {
  assert.equal(assertTestDatabase(env).pathname, "/agency_test");
  assert.equal(testEnvironment(env).DATABASE_URL, env.TEST_DATABASE_URL);
  assert.equal(testEnvironment(env).NODE_ENV, "test");
  assert.equal(
    loadRootEnv({ EXPLICIT_TEST_SENTINEL: "set" }).EXPLICIT_TEST_SENTINEL,
    "set",
  );
});
test("missing URL never falls back to the development database", () => {
  assert.throws(
    () => assertTestDatabase({ DATABASE_URL: env.DATABASE_URL }),
    /TEST_DATABASE_URL is required/,
  );
});
for (const url of [
  "postgresql://local:local@localhost/agency",
  "postgresql://local:local@localhost/production",
  "postgresql://local:local@remote.example/agency_test",
  "postgresql://local:local@localhost/agency_test?schema=public",
  "https://localhost/agency_test",
  "invalid",
]) {
  test(`unsafe database fixture ${url.replace(/\/\/.*@/, "//[redacted]@")} is rejected before SQL`, () => {
    assert.throws(() => assertTestDatabase({ ...env, TEST_DATABASE_URL: url }));
  });
}
test("identical development/test targets are rejected even with different credentials", () => {
  assert.throws(
    () =>
      assertTestDatabase({
        DATABASE_URL: "postgresql://dev:x@localhost:5433/agency_test",
        TEST_DATABASE_URL: env.TEST_DATABASE_URL,
      }),
    /Unsafe test database/,
  );
});
test("test database reset refuses a development target before any SQL", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const script = fileURLToPath(new URL("../test-db.mjs", import.meta.url));
  for (const unsafe of [
    "postgresql://local:local@localhost:5432/agency",
    env.DATABASE_URL.replace("/agency", "/agency_test"),
  ]) {
    const result = spawnSync(process.execPath, [script], {
      env: {
        ...process.env,
        DATABASE_URL: env.DATABASE_URL.replace("/agency", "/agency_test"),
        TEST_DATABASE_URL: unsafe,
        npm_execpath: "",
      },
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unsafe test database/);
    assert.doesNotMatch(result.stdout, /Script executed/);
  }
});
