import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TOOL_TIMEOUT_MS = 5 * 60 * 1000;

function run(command: string, args: string[], timeoutMs = TOOL_TIMEOUT_MS) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 2000) stderr += chunk.toString("utf8");
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`${command} could not start: ${error.message}`));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${command} failed (exit ${String(code)}): ${stderr.trim()}`,
          ),
        );
    });
  });
}

/** Runs `work` with a private temporary directory that is always removed. */
async function withTempDirectory<T>(work: (directory: string) => Promise<T>) {
  const directory = await mkdtemp(path.join(tmpdir(), "agency-index-"));
  try {
    return await work(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export type ExternalTools = {
  /** Adds a text layer to pages without one; the input is never modified. */
  ocr(pdf: Uint8Array): Promise<Uint8Array>;
  docxToPdf(docx: Uint8Array): Promise<Uint8Array>;
};

export function createExternalTools(options: {
  ocrLanguages: string;
  ocrCommand?: string;
  officeCommand?: string;
}): ExternalTools {
  const ocrCommand = options.ocrCommand ?? "ocrmypdf";
  const officeCommand = options.officeCommand ?? "soffice";
  return {
    ocr: (pdf) =>
      withTempDirectory(async (directory) => {
        const input = path.join(directory, "input.pdf");
        const output = path.join(directory, "output.pdf");
        await writeFile(input, pdf);
        // --skip-text: pages that already have text are left as they are.
        await run(ocrCommand, [
          "--skip-text",
          "--output-type",
          "pdf",
          "-l",
          options.ocrLanguages,
          input,
          output,
        ]);
        return new Uint8Array(await readFile(output));
      }),
    docxToPdf: (docx) =>
      withTempDirectory(async (directory) => {
        const input = path.join(directory, "document.docx");
        await writeFile(input, docx);
        await run(officeCommand, [
          "--headless",
          // Private profile: concurrent conversions never share a lock.
          `-env:UserInstallation=${pathToFileURL(path.join(directory, "profile")).href}`,
          "--convert-to",
          "pdf",
          "--outdir",
          directory,
          input,
        ]);
        return new Uint8Array(
          await readFile(path.join(directory, "document.pdf")),
        );
      }),
  };
}
