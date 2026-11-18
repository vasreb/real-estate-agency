import { createDatabase } from "./infrastructure/database/index.js";
import { loadWorkerConfig } from "./infrastructure/worker-config.js";
import {
  createExternalTools,
  createIndexer,
  createJobStore,
  createVoyageEmbedder,
  extractPdfPages,
  runWorker,
} from "./modules/indexing/index.js";

/**
 * Indexing worker (ADR-0008). `--backfill` queues every document that is not
 * indexed yet and exits; otherwise it processes the queue until stopped.
 */
const config = loadWorkerConfig();
const database = createDatabase(config.DATABASE_URL);
const store = createJobStore(database);
const log = (event: string, details: Record<string, unknown> = {}) => {
  if (config.LOG_LEVEL !== "silent")
    console.log(JSON.stringify({ event, ...details }));
};

if (process.argv.includes("--backfill")) {
  const queued = await store.enqueueUnindexed();
  log("backfill_queued", { queued });
  await database.$disconnect();
} else {
  const controller = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => controller.abort());
  const indexer = createIndexer({
    store: store.indexingStore,
    tools: createExternalTools({ ocrLanguages: config.OCR_LANGUAGES }),
    extractPages: extractPdfPages,
    embedder: createVoyageEmbedder({
      apiKey: config.VOYAGE_API_KEY,
      model: config.EMBEDDING_MODEL,
      dimensions: config.EMBEDDING_DIMENSIONS,
    }),
  });
  log("worker_started");
  try {
    await runWorker({
      store,
      indexer,
      pollMs: config.WORKER_POLL_SECONDS * 1000,
      staleAfterSeconds: config.WORKER_STALE_SECONDS,
      maxAttempts: config.WORKER_MAX_ATTEMPTS,
      backoffSeconds: config.WORKER_BACKOFF_SECONDS,
      signal: controller.signal,
      log,
    });
  } finally {
    await database.$disconnect();
    log("worker_stopped");
  }
}
