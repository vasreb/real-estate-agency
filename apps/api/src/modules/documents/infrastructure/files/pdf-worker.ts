import { parentPort, workerData } from "node:worker_threads";
import { PDFDocument } from "pdf-lib";

// Structural parse only: no rendering. Encrypted documents make pdf-lib throw.
async function main() {
  const bytes = workerData as Uint8Array;
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    // Walk the page tree so a broken catalog is detected.
    parentPort?.postMessage({ ok: doc.getPageCount() > 0 });
  } catch {
    parentPort?.postMessage({ ok: false });
  }
}

void main();
