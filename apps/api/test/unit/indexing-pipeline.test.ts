import {
  createIndexer,
  type IndexingStore,
} from "../../src/modules/indexing/application/index-document.js";
import {
  processNextJob,
  runWorker,
} from "../../src/modules/indexing/application/run-worker.js";
import { describeFailure } from "../../src/modules/indexing/infrastructure/job-store.js";
import { createVoyageEmbedder } from "../../src/modules/indexing/infrastructure/voyage.js";
import type { PageText } from "../../src/modules/indexing/domain/chunking.js";

/** Minimal call recorder (jest globals are not importable in this ESM setup). */
function spy<A extends unknown[], R>(implementation: (...args: A) => R) {
  const calls: A[] = [];
  const fn = (...args: A): R => {
    calls.push(args);
    return implementation(...args);
  };
  return Object.assign(fn, { calls });
}

const PDF = "application/pdf";
const DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const original = new Uint8Array([1, 2, 3]);
const converted = new Uint8Array([9, 9]);
const recognised = new Uint8Array([7]);
const text = "1. Rent\nMonthly rent is 1200 EUR payable in advance.";

function setup(options: {
  mime?: string;
  pages?: Record<string, PageText[]>;
  missing?: boolean;
}) {
  const stored: Parameters<IndexingStore["replaceChunks"]>[0][] = [];
  const store: IndexingStore = {
    loadDocument: () =>
      Promise.resolve(
        options.missing
          ? null
          : { mimeType: options.mime ?? PDF, bytes: original },
      ),
    replaceChunks: (input) => {
      stored.push(input);
      return Promise.resolve(true);
    },
  };
  const tools = {
    ocr: spy<[Uint8Array], Promise<Uint8Array>>(() =>
      Promise.resolve(recognised),
    ),
    docxToPdf: spy<[Uint8Array], Promise<Uint8Array>>(() =>
      Promise.resolve(converted),
    ),
  };
  const embed = spy<[string[], string], Promise<number[][]>>((texts) =>
    Promise.resolve(texts.map(() => [0.1, 0.2])),
  );
  const indexer = createIndexer({
    store,
    tools,
    extractPages: (bytes) => {
      const key =
        bytes === original
          ? "original"
          : bytes === converted
            ? "converted"
            : "ocr";
      return Promise.resolve(options.pages?.[key] ?? []);
    },
    embedder: { model: "voyage-test", dimensions: 2, embed },
  });
  return { indexer, stored, tools, embed };
}

describe("indexDocument", () => {
  it("indexes a text PDF without OCR and keeps page numbers", async () => {
    const { indexer, stored, tools, embed } = setup({
      pages: {
        original: [
          { page: 1, text },
          { page: 2, text },
        ],
      },
    });
    await expect(indexer.indexDocument("d1")).resolves.toBe("indexed");
    expect(tools.ocr.calls).toHaveLength(0);
    expect(embed.calls[0]?.[1]).toBe("document");
    expect(stored[0]).toMatchObject({
      documentId: "d1",
      model: "voyage-test",
      pdfRepresentation: null,
    });
    expect(stored[0]?.chunks[0]).toMatchObject({
      pageStart: 1,
      embedding: [0.1, 0.2],
    });
  });

  it("runs OCR when a page has no text layer and only fills those pages", async () => {
    const { indexer, stored, tools } = setup({
      pages: {
        original: [
          { page: 1, text },
          { page: 2, text: "" },
        ],
        ocr: [
          { page: 1, text: "ignored because page 1 has its own text" },
          { page: 2, text: "2. Deposit\nThe deposit is 1200 EUR." },
        ],
      },
    });
    await indexer.indexDocument("d1");
    expect(tools.ocr.calls[0]?.[0]).toBe(original);
    const content = stored[0]!.chunks.map((chunk) => chunk.content).join("\n");
    expect(content).toContain("Monthly rent");
    expect(content).toContain("deposit is 1200");
    expect(content).not.toContain("ignored");
    const deposit = stored[0]!.chunks.find((chunk) =>
      chunk.content.includes("deposit"),
    );
    // The short pages fit in one chunk that spans both of them.
    expect(deposit).toMatchObject({ pageStart: 1, pageEnd: 2 });
  });

  it("converts DOCX to PDF and stores the representation", async () => {
    const { indexer, stored, tools } = setup({
      mime: DOCX,
      pages: { converted: [{ page: 1, text }] },
    });
    await indexer.indexDocument("d1");
    expect(tools.docxToPdf.calls[0]?.[0]).toBe(original);
    expect(stored[0]?.pdfRepresentation).toBe(converted);
  });

  it("fails when no text can be extracted, so nothing is replaced", async () => {
    const { indexer, stored } = setup({
      pages: {
        original: [{ page: 1, text: "" }],
        ocr: [{ page: 1, text: "" }],
      },
    });
    await expect(indexer.indexDocument("d1")).rejects.toThrow(
      "No text could be extracted",
    );
    expect(stored).toHaveLength(0);
  });

  it("reports a deleted document as missing", async () => {
    const { indexer } = setup({ missing: true });
    await expect(indexer.indexDocument("d1")).resolves.toBe("missing");
  });
});

describe("worker loop", () => {
  const job = { id: "j1", documentId: "d1", attempts: 1 };
  const base = {
    staleAfterSeconds: 60,
    maxAttempts: 3,
    backoffSeconds: 1,
  };

  it("completes a job after indexing", async () => {
    const store = {
      claimJob: spy(() => Promise.resolve(job)),
      requeueStale: spy(() => Promise.resolve(0)),
      completeJob: spy<[unknown], Promise<void>>(() => Promise.resolve()),
      failJob: spy<unknown[], Promise<"retry">>(() => Promise.resolve("retry")),
    };
    const worked = await processNextJob({
      ...base,
      store,
      indexer: { indexDocument: () => Promise.resolve("indexed") },
    });
    expect(worked).toBe(true);
    expect(store.completeJob.calls[0]?.[0]).toBe(job);
    expect(store.failJob.calls).toHaveLength(0);
  });

  it("records a failure instead of throwing", async () => {
    const store = {
      claimJob: spy(() => Promise.resolve(job)),
      requeueStale: spy(() => Promise.resolve(0)),
      completeJob: spy<[unknown], Promise<void>>(() => Promise.resolve()),
      failJob: spy(() => Promise.resolve("retry" as const)),
    };
    const error = new Error("boom");
    await processNextJob({
      ...base,
      store,
      indexer: { indexDocument: () => Promise.reject(error) },
    });
    expect(store.failJob.calls[0]).toEqual([
      job,
      error,
      { maxAttempts: 3, backoffSeconds: 1 },
    ]);
    expect(store.completeJob.calls).toHaveLength(0);
  });

  it("returns false on an empty queue and stops when aborted", async () => {
    const controller = new AbortController();
    const store = {
      claimJob: spy(() => Promise.resolve(null)),
      requeueStale: spy(() => Promise.resolve(0)),
      completeJob: spy<[unknown], Promise<void>>(() => Promise.resolve()),
      failJob: spy<unknown[], Promise<"retry">>(() => Promise.resolve("retry")),
    };
    const sleep = spy(() => {
      controller.abort();
      return Promise.resolve();
    });
    await runWorker({
      ...base,
      store,
      indexer: { indexDocument: () => Promise.resolve("indexed" as const) },
      pollMs: 10,
      signal: controller.signal,
      sleep,
    });
    expect(store.requeueStale.calls).toHaveLength(1);
    expect(sleep.calls).toHaveLength(1);
  });
});

describe("describeFailure", () => {
  it("keeps one short line without a stack", () => {
    const error = new Error(`first\nsecond ${"x".repeat(900)}`);
    const message = describeFailure(error);
    expect(message).not.toContain("\n");
    expect(message.length).toBeLessThanOrEqual(500);
    expect(describeFailure("weird")).toBe("Indexing failed");
  });
});

describe("Voyage embedder", () => {
  const vector = (size: number) => Array.from({ length: size }, () => 0.5);
  const okResponse = (count: number, size: number) =>
    new Response(
      JSON.stringify({
        data: Array.from({ length: count }, (_, index) => ({
          index,
          embedding: vector(size),
        })),
      }),
      { status: 200 },
    );

  it("sends model, input type and dimension with a bearer key, in batches", async () => {
    const fetchMock = spy((_url: string, init: RequestInit) => {
      const { input } = JSON.parse(init.body as string) as { input: string[] };
      return Promise.resolve(okResponse(input.length, 4));
    });
    const embedder = createVoyageEmbedder({
      apiKey: "secret-key",
      model: "voyage-4",
      dimensions: 4,
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await embedder.embed(
      Array.from({ length: 70 }, (_, i) => `t${i}`),
      "query",
    );
    expect(result).toHaveLength(70);
    expect(fetchMock.calls).toHaveLength(2);
    const [, init] = fetchMock.calls[0]!;
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer secret-key",
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "voyage-4",
      input_type: "query",
      output_dimension: 4,
    });
  });

  it("retries rate limits and never leaks the key in errors", async () => {
    const sleep = spy(() => Promise.resolve());
    const responses = [new Response("", { status: 429 }), okResponse(1, 4)];
    const fetchMock = spy(() => Promise.resolve(responses.shift()!));
    const embedder = createVoyageEmbedder({
      apiKey: "secret-key",
      model: "voyage-4",
      dimensions: 4,
      fetch: fetchMock,
      sleep,
    });
    await expect(embedder.embed(["a"], "document")).resolves.toHaveLength(1);
    expect(sleep.calls).toHaveLength(1);

    const failing = createVoyageEmbedder({
      apiKey: "secret-key",
      model: "voyage-4",
      dimensions: 4,
      fetch: () => Promise.resolve(new Response("", { status: 401 })),
    });
    const error = await failing.embed(["a"], "document").then(
      () => new Error("did not fail"),
      (e: Error) => e,
    );
    expect(error.message).toBe("Embedding request failed (HTTP 401)");
    expect(error.message).not.toContain("secret-key");
  });

  it("rejects a response with the wrong dimension", async () => {
    const embedder = createVoyageEmbedder({
      apiKey: "k",
      model: "voyage-4",
      dimensions: 4,
      fetch: () => Promise.resolve(okResponse(1, 3)),
    });
    await expect(embedder.embed(["a"], "document")).rejects.toThrow(
      "unexpected shape",
    );
  });
});
