import { z } from "zod";

const workerConfigSchema = z.object({
  DATABASE_URL: z.url(),
  LOG_LEVEL: z
    .enum(["silent", "fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  VOYAGE_API_KEY: z.string().min(1),
  EMBEDDING_MODEL: z.string().min(1).default("voyage-4"),
  EMBEDDING_DIMENSIONS: z.coerce
    .number()
    .int()
    .min(256)
    .max(2000)
    .default(1024),
  OCR_LANGUAGES: z
    .string()
    .regex(/^[a-z_]+(\+[a-z_]+)*$/)
    .default("eng"),
  WORKER_POLL_SECONDS: z.coerce.number().int().min(1).max(300).default(5),
  WORKER_STALE_SECONDS: z.coerce.number().int().min(60).default(900),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  WORKER_BACKOFF_SECONDS: z.coerce.number().int().min(1).default(30),
});
export type WorkerConfig = z.infer<typeof workerConfigSchema>;

export function loadWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  const parsed = workerConfigSchema.safeParse(env);
  if (!parsed.success)
    // Report keys, never values (they include credentials).
    throw new Error(
      `Invalid environment: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].join(", ")}`,
    );
  return parsed.data;
}
