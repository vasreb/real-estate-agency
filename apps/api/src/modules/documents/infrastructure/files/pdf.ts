import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

const isTs = import.meta.url.endsWith(".ts");

function workerExecArgv(): string[] {
  if (!isTs) return [];
  // Source (.ts) runtime: Jest or tsx dev. The worker is a separate thread, so
  // it needs its own TypeScript loader.
  const tsxEsm = createRequire(import.meta.url).resolve("tsx/esm");
  return ["--import", pathToFileURL(tsxEsm).href];
}

/**
 * Bounded structural PDF parse in a worker thread (128 MB heap, hard timeout).
 * Resolves true only for a loadable, non-encrypted PDF with at least one page.
 */
export function isStructurallyValidPdf(
  bytes: Uint8Array,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let worker: Worker | undefined;
    // eslint-disable-next-line prefer-const -- assigned after finish is defined
    let timer: NodeJS.Timeout | undefined;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker?.terminate();
      resolve(ok);
    };
    timer = setTimeout(() => finish(false), timeoutMs);
    try {
      const url = new URL(
        isTs ? "./pdf-worker.ts" : "./pdf-worker.js",
        import.meta.url,
      );
      // Copy: the worker must never see (or detach) the caller's buffer.
      const copy = new Uint8Array(bytes);
      worker = new Worker(url, {
        workerData: copy,
        transferList: [copy.buffer],
        execArgv: workerExecArgv(),
        resourceLimits: { maxOldGenerationSizeMb: 128 },
      });
      worker.once("message", (msg: { ok?: boolean }) =>
        finish(msg.ok === true),
      );
      worker.once("error", () => finish(false));
      worker.once("exit", () => finish(false));
    } catch {
      finish(false);
    }
  });
}
