import { createApp } from "../../src/app.js";
import { loadConfig } from "../../src/infrastructure/config.js";
import {
  createDatabase,
  type Database,
} from "../../src/infrastructure/database/index.js";
import { testPasswords } from "../fixtures/index.js";

export const ORIGIN = "http://localhost:3000";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !databaseUrl.includes("/agency_test"))
  throw new Error(
    "Integration tests require the isolated agency_test database.",
  );

export function testConfig(overrides: Record<string, string> = {}) {
  return loadConfig({
    DATABASE_URL: databaseUrl,
    PUBLIC_ORIGIN: ORIGIN,
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
    ...overrides,
  });
}

export function openDatabase(): Database {
  return createDatabase(databaseUrl!);
}

export type TestClock = { now: Date };

export function createTestApp(
  database: Database,
  options: { clock?: TestClock; config?: Record<string, string> } = {},
) {
  const clock = options.clock;
  return createApp(testConfig(options.config), {
    database,
    ...(clock ? { now: () => clock.now } : {}),
  });
}

export const accounts = {
  admin: { email: "admin@agency.test", password: testPasswords.admin },
  member: { email: "member@agency.test", password: testPasswords.member },
  other: { email: "other@agency.test", password: testPasswords.other },
  multi: { email: "multi@agency.test", password: testPasswords.multi },
} as const;

type App = ReturnType<typeof createApp>;

export async function login(
  app: App,
  account: { email: string; password: string },
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: ORIGIN },
    payload: account,
  });
  if (response.statusCode !== 204)
    throw new Error(`Login failed with ${response.statusCode}`);
  const cookie = response.cookies.find((c) => c.name === "agency_session");
  if (!cookie) throw new Error("No session cookie");
  return `agency_session=${cookie.value}`;
}
