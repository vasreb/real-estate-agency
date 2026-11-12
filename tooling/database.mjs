import { spawnSync } from "node:child_process";
import { loadRootEnv, rootDirectory } from "./env.mjs";

const operation = process.argv[2];
if (!["validate", "generate", "migrate", "seed"].includes(operation))
  throw new Error("Unknown database operation.");
const env = loadRootEnv();
if (!env.DATABASE_URL)
  throw new Error("DATABASE_URL is required in root .env or environment.");
if (operation === "seed" && env.NODE_ENV === "production")
  throw new Error("Development seed is forbidden in production.");
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error("Use the pnpm database scripts.");
const result = spawnSync(
  process.execPath,
  [pnpm, "--filter", "@agency/api", "--fail-if-no-match", `db:${operation}`],
  { env, cwd: rootDirectory, stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
