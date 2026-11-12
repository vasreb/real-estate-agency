import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

export type DatabaseOptions = {
  /** Test hook: receives SQL text (never parameters) of each query. */
  onQuery?: (sql: string) => void;
};

export function createDatabase(
  databaseUrl: string,
  options: DatabaseOptions = {},
) {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: 8,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
  });
  const client = new PrismaClient({
    adapter,
    // Typed as no logging so Database stays one type; the hook is test-only.
    log: (options.onQuery ? [{ emit: "event", level: "query" }] : []) as [],
  });
  const onQuery = options.onQuery;
  if (onQuery)
    (
      client as unknown as {
        $on(event: "query", callback: (e: { query: string }) => void): void;
      }
    ).$on("query", (event) => onQuery(event.query));
  return client;
}
export type Database = ReturnType<typeof createDatabase>;
