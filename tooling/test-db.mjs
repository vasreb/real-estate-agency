import { spawnSync } from "node:child_process";
import { loadRootEnv, testEnvironment, rootDirectory } from "./env.mjs";

// Guard first: throws for a missing, non-allowlisted, or dev-equal test URL.
const env = testEnvironment(loadRootEnv());
if (env.DATABASE_URL !== env.TEST_DATABASE_URL)
  throw new Error("Refusing to reset: target is not TEST_DATABASE_URL.");
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error("Use pnpm db:test:prepare.");

function run(args, input) {
  const result = spawnSync(
    process.execPath,
    [pnpm, "--filter", "@agency/api", "--fail-if-no-match", ...args],
    {
      cwd: rootDirectory,
      env,
      input,
      stdio: [input === undefined ? "inherit" : "pipe", "inherit", "inherit"],
    },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// The isolated test database is disposable: recreate the schema so migrations
// always deploy onto a clean state. Never runs against DATABASE_URL from .env.
run(
  ["exec", "prisma", "db", "execute", "--stdin"],
  "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;",
);
// A missing schema/migration/seed is a failure, never a skipped database test.
for (const script of ["db:generate", "db:migrate", "db:seed"]) run([script]);
