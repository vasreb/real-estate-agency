/**
 * Extracts the PostgreSQL SQLSTATE and constraint name from a Prisma/driver
 * adapter error without depending on its exact wrapping.
 */
export function postgresError(error: unknown): {
  code?: string;
  constraint?: string;
} {
  const seen = new Set<unknown>();
  const result: { code?: string; constraint?: string } = {};
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || seen.has(value) || depth > 6)
      return;
    seen.add(value);
    const record = value as Record<string, unknown>;
    for (const key of ["originalCode", "code"]) {
      const code = record[key];
      if (
        result.code === undefined &&
        typeof code === "string" &&
        /^[0-9A-Z]{5}$/.test(code) &&
        !code.startsWith("P")
      )
        result.code = code;
    }
    for (const key of ["constraint", "constraint_name"]) {
      const name = record[key];
      if (result.constraint !== undefined) continue;
      if (typeof name === "string") result.constraint = name;
      // Prisma 7 driver adapters report `constraint: { index: "<name>" }`.
      else if (
        name &&
        typeof name === "object" &&
        typeof (name as { index?: unknown }).index === "string"
      )
        result.constraint = (name as { index: string }).index;
    }
    for (const key of ["cause", "meta", "driverAdapterError"])
      visit(record[key], depth + 1);
  };
  visit(error, 0);
  return result;
}
