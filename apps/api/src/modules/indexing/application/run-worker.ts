import type { JobStore } from "../infrastructure/job-store.js";
import type { Indexer } from "./index-document.js";

export type WorkerOptions = {
  store: Pick<
    JobStore,
    "claimJob" | "requeueStale" | "completeJob" | "failJob"
  >;
  indexer: Pick<Indexer, "indexDocument">;
  pollMs: number;
  staleAfterSeconds: number;
  maxAttempts: number;
  backoffSeconds: number;
  signal: AbortSignal;
  log?: (event: string, details: Record<string, unknown>) => void;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
};

function abortableSleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done);
  });
}

/** Processes one due job. Returns false when the queue is empty. */
export async function processNextJob(
  options: Omit<WorkerOptions, "pollMs" | "signal" | "sleep">,
): Promise<boolean> {
  const log = options.log ?? (() => undefined);
  const job = await options.store.claimJob();
  if (!job) return false;
  try {
    const result = await options.indexer.indexDocument(job.documentId);
    await options.store.completeJob(job);
    log("job_done", { jobId: job.id, result });
  } catch (error) {
    const outcome = await options.store.failJob(job, error, {
      maxAttempts: options.maxAttempts,
      backoffSeconds: options.backoffSeconds,
    });
    log("job_failed", { jobId: job.id, attempts: job.attempts, outcome });
  }
  return true;
}

/** Polls the queue until the signal aborts; one job at a time. */
export async function runWorker(options: WorkerOptions): Promise<void> {
  const sleep = options.sleep ?? abortableSleep;
  while (!options.signal.aborted) {
    await options.store.requeueStale(options.staleAfterSeconds);
    const worked = await processNextJob(options);
    if (!worked) await sleep(options.pollMs, options.signal);
  }
}
