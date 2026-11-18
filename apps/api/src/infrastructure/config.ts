import { isIP } from "node:net";
import { z } from "zod";

const originSchema = z.url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && url.origin === value;
}, "Must be an exact HTTP(S) origin, without path, trailing slash, or credentials");
const databaseSchema = z.url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    ["postgres:", "postgresql:"].includes(url.protocol) &&
    url.hostname.length > 0 &&
    url.pathname.length > 1
  );
}, "Must be a PostgreSQL URL with a database name");
/**
 * Explicit allowlist of proxy addresses (IPs or CIDRs) whose X-Forwarded-For
 * entries are trusted. Empty (default) = use the socket address. Catch-all
 * ranges are refused: trusting every hop would let clients forge their IP.
 */
const trustedProxiesSchema = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  )
  .pipe(
    z.array(
      z.string().refine((entry) => {
        const [address, prefix, ...rest] = entry.split("/");
        if (rest.length || !address || !isIP(address)) return false;
        if (prefix === undefined) return true;
        if (!/^\d{1,3}$/.test(prefix)) return false;
        const bits = Number(prefix);
        const max = isIP(address) === 4 ? 32 : 128;
        // Refuse catch-all and overly broad ranges (e.g. 0.0.0.0/0, ::/0).
        return bits >= (max === 32 ? 8 : 16) && bits <= max;
      }, "Must be an IP or a CIDR no broader than /8 (IPv4) or /16 (IPv6)"),
    ),
  );

const configSchema = z.object({
  TRUSTED_PROXIES: trustedProxiesSchema,
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: databaseSchema,
  PUBLIC_ORIGIN: originSchema,
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  SESSION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(2_592_000)
    .default(28_800),
  LOG_LEVEL: z
    .enum(["silent", "fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});
export type Config = z.infer<typeof configSchema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    // Report keys, never values (a URL may contain database credentials).
    throw new Error(
      `Invalid environment: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].join(", ")}`,
    );
  }
  return parsed.data;
}

/** Assistant settings; optional so the API still runs without the keys. */
const assistantConfigSchema = z.object({
  // The assistant is enabled only when both keys are set (see app.ts).
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  VOYAGE_API_KEY: z.string().min(1).optional(),
  ASSISTANT_MODEL: z.string().min(1).default("claude-haiku-5-5"),
  EMBEDDING_MODEL: z.string().min(1).default("voyage-4"),
  EMBEDDING_DIMENSIONS: z.coerce
    .number()
    .int()
    .min(256)
    .max(2000)
    .default(1024),
  ASSISTANT_MAX_STEPS: z.coerce.number().int().min(1).max(20).default(20),
  ASSISTANT_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).default(20),
});
export type AssistantConfig = z.infer<typeof assistantConfigSchema>;
export function loadAssistantConfig(
  env: NodeJS.ProcessEnv = process.env,
): AssistantConfig {
  const parsed = assistantConfigSchema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      `Invalid environment: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].join(", ")}`,
    );
  return parsed.data;
}
