import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

export const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
export function loadRootEnv(overrides = {}) {
  const file = new URL("../.env", import.meta.url);
  return {
    ...(existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {}),
    ...process.env,
    ...overrides,
  };
}
export function assertTestDatabase(env) {
  if (!env.TEST_DATABASE_URL)
    throw new Error(
      "TEST_DATABASE_URL is required; tests never fall back to DATABASE_URL.",
    );
  let test, dev;
  try {
    test = new URL(env.TEST_DATABASE_URL);
    dev = env.DATABASE_URL ? new URL(env.DATABASE_URL) : null;
  } catch {
    throw new Error("Invalid database URL (values suppressed).");
  }
  if (
    !["postgres:", "postgresql:"].includes(test.protocol) ||
    !["127.0.0.1", "localhost", "[::1]", "postgres-test"].includes(
      test.hostname,
    ) ||
    test.pathname !== "/agency_test" ||
    test.search ||
    test.hash ||
    (dev &&
      dev.pathname === test.pathname &&
      dev.hostname === test.hostname &&
      (dev.port || "5432") === (test.port || "5432"))
  ) {
    throw new Error(
      "Unsafe test database: require isolated allowlisted agency_test on local/test host, distinct from development.",
    );
  }
  return test;
}
export function testEnvironment(env) {
  assertTestDatabase(env);
  return {
    ...env,
    DATABASE_URL: env.TEST_DATABASE_URL,
    NODE_ENV: "test",
    APP_ENV: "test",
  };
}
