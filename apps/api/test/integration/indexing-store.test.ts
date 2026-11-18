import { createJobStore } from "../../src/modules/indexing/infrastructure/job-store.js";
import { extractPdfPages } from "../../src/modules/indexing/infrastructure/pdf-text.js";
import { createSamplePdf, ids, PDF_MIME } from "../fixtures/index.js";
import { openDatabase } from "./helpers.js";

const db = openDatabase();
const store = createJobStore(db);
const created: string[] = [];
let pdf: Uint8Array<ArrayBuffer>;

beforeAll(async () => {
  pdf = await createSamplePdf("Monthly rent is 1200 EUR");
});
afterAll(async () => {
  // enqueueUnindexed also queues the seeded documents; leave no jobs behind.
  await db.indexJob.deleteMany({});
  await db.document.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});
beforeEach(async () => {
  // The queue is global: leave no jobs of earlier tests behind.
  await db.indexJob.deleteMany({});
});

async function newDocument() {
  const document = await db.document.create({
    data: {
      dealId: ids.dealNorthRental,
      type: "other",
      title: "Indexing test",
      fileName: "test.pdf",
      mimeType: PDF_MIME,
      fileData: pdf,
    },
    select: { id: true },
  });
  created.push(document.id);
  return document.id;
}
const vector = (value: number) => Array.from({ length: 1024 }, () => value);
const chunk = (ordinal: number, content: string, value = 0.5) => ({
  ordinal,
  pageStart: 1,
  pageEnd: 1,
  section: null,
  content,
  embedding: vector(value),
});
const retry = { maxAttempts: 3, backoffSeconds: 60 };

describe("PDF text extraction", () => {
  it("reads the text layer of a generated PDF per page", async () => {
    const pages = await extractPdfPages(pdf);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.page).toBe(1);
    expect(pages[0]?.text).toContain("Monthly rent is 1200 EUR");
  });
});

describe("replaceChunks", () => {
  it("stores chunks, marks the document indexed and replaces old chunks", async () => {
    const id = await newDocument();
    const representation = new Uint8Array([1, 2, 3]);
    expect(
      await store.indexingStore.replaceChunks({
        documentId: id,
        model: "voyage-test",
        chunks: [chunk(1, "first"), chunk(2, "second")],
        pdfRepresentation: representation,
      }),
    ).toBe(true);
    const document = await db.document.findUniqueOrThrow({
      where: { id },
      select: {
        processingStatus: true,
        indexedAt: true,
        processingError: true,
        pdfRepresentation: true,
      },
    });
    expect(document.processingStatus).toBe("indexed");
    expect(document.indexedAt).toBeInstanceOf(Date);
    expect(Buffer.from(document.pdfRepresentation!)).toEqual(
      Buffer.from(representation),
    );

    await store.indexingStore.replaceChunks({
      documentId: id,
      model: "voyage-test",
      chunks: [chunk(1, "replacement")],
      pdfRepresentation: null,
    });
    const rows = await db.documentChunk.findMany({
      where: { documentId: id },
      select: { content: true, embeddingModel: true },
    });
    expect(rows).toEqual([
      { content: "replacement", embeddingModel: "voyage-test" },
    ]);
    // A missing representation keeps the stored one.
    const kept = await db.document.findUniqueOrThrow({
      where: { id },
      select: { pdfRepresentation: true },
    });
    expect(kept.pdfRepresentation).not.toBeNull();
  });

  it("rolls back every change when an insert fails", async () => {
    const id = await newDocument();
    await store.indexingStore.replaceChunks({
      documentId: id,
      model: "voyage-test",
      chunks: [chunk(1, "kept")],
      pdfRepresentation: null,
    });
    await expect(
      store.indexingStore.replaceChunks({
        documentId: id,
        model: "voyage-test",
        // Duplicate ordinal violates the unique index on the second row.
        chunks: [chunk(1, "new a"), chunk(1, "new b")],
        pdfRepresentation: null,
      }),
    ).rejects.toThrow();
    const rows = await db.documentChunk.findMany({
      where: { documentId: id },
      select: { content: true },
    });
    expect(rows).toEqual([{ content: "kept" }]);
  });

  it("supports vector and full-text search over stored chunks", async () => {
    const id = await newDocument();
    await store.indexingStore.replaceChunks({
      documentId: id,
      model: "voyage-test",
      chunks: [chunk(1, "Monthly rent is 1200 EUR", 0.9)],
      pdfRepresentation: null,
    });
    const nearest = await db.$queryRaw<{ document_id: string }[]>`
      SELECT document_id FROM document_chunks
      WHERE document_id = ${id}::uuid
      ORDER BY embedding <=> ${`[${vector(0.9).join(",")}]`}::vector LIMIT 1`;
    expect(nearest[0]?.document_id).toBe(id);
    const text = await db.$queryRaw<{ document_id: string }[]>`
      SELECT document_id FROM document_chunks
      WHERE document_id = ${id}::uuid
        AND content_tsv @@ plainto_tsquery('simple', '1200')`;
    expect(text).toHaveLength(1);
  });

  it("reports a deleted document instead of failing", async () => {
    const id = await newDocument();
    await db.document.delete({ where: { id } });
    expect(
      await store.indexingStore.replaceChunks({
        documentId: id,
        model: "voyage-test",
        chunks: [chunk(1, "x")],
        pdfRepresentation: null,
      }),
    ).toBe(false);
    expect(await store.indexingStore.loadDocument(id)).toBeNull();
  });
});

describe("job queue", () => {
  it("hands one job to exactly one of two concurrent workers", async () => {
    const id = await newDocument();
    await db.indexJob.create({ data: { documentId: id } });
    const claims = await Promise.all([store.claimJob(), store.claimJob()]);
    const claimed = claims.filter((job) => job !== null);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({ documentId: id, attempts: 1 });
    const document = await db.document.findUniqueOrThrow({
      where: { id },
      select: { processingStatus: true },
    });
    expect(document.processingStatus).toBe("processing");
  });

  it("retries with backoff, then fails the job and the document with a reason", async () => {
    const id = await newDocument();
    await db.indexJob.create({ data: { documentId: id } });
    const first = (await store.claimJob())!;
    expect(await store.failJob(first, new Error("OCR crashed"), retry)).toBe(
      "retry",
    );
    // Backoff: the job is queued but not due yet.
    expect(await store.claimJob()).toBeNull();
    const pending = await db.document.findUniqueOrThrow({
      where: { id },
      select: { processingStatus: true, processingError: true },
    });
    expect(pending).toEqual({
      processingStatus: "pending",
      processingError: null,
    });

    await db.indexJob.updateMany({
      where: { documentId: id },
      data: { runAfter: new Date(Date.now() - 1000) },
    });
    const second = (await store.claimJob())!;
    expect(second.attempts).toBe(2);
    await db.indexJob.updateMany({
      where: { documentId: id },
      data: { attempts: 3 },
    });
    expect(
      await store.failJob(
        { ...second, attempts: 3 },
        new Error("still bad"),
        retry,
      ),
    ).toBe("failed");
    const failed = await db.document.findUniqueOrThrow({
      where: { id },
      select: { processingStatus: true, processingError: true },
    });
    expect(failed).toEqual({
      processingStatus: "failed",
      processingError: "still bad",
    });
    const job = await db.indexJob.findFirstOrThrow({
      where: { documentId: id },
    });
    expect(job.status).toBe("failed");
    // A failed job is not active, so the document can be queued again.
    await db.indexJob.create({ data: { documentId: id } });
  });

  it("completes a job", async () => {
    const id = await newDocument();
    await db.indexJob.create({ data: { documentId: id } });
    const job = (await store.claimJob())!;
    await store.completeJob(job);
    const row = await db.indexJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe("succeeded");
    expect(row.lockedAt).toBeNull();
  });

  it("makes jobs of a dead worker available again", async () => {
    const id = await newDocument();
    await db.indexJob.create({ data: { documentId: id } });
    const job = (await store.claimJob())!;
    expect(await store.requeueStale(3600)).toBe(0);
    await db.indexJob.update({
      where: { id: job.id },
      data: { lockedAt: new Date(Date.now() - 2 * 3600 * 1000) },
    });
    expect(await store.requeueStale(3600)).toBe(1);
    expect(await store.claimJob()).toMatchObject({ documentId: id });
  });

  it("queues only documents that are not indexed and have no active job", async () => {
    const indexed = await newDocument();
    await db.document.update({
      where: { id: indexed },
      data: { processingStatus: "indexed" },
    });
    const waiting = await newDocument();
    const active = await newDocument();
    await db.indexJob.create({ data: { documentId: active } });
    await store.enqueueUnindexed();
    const queued = (
      await db.indexJob.findMany({ select: { documentId: true } })
    ).map((job) => job.documentId);
    expect(queued).toContain(waiting);
    expect(queued).not.toContain(indexed);
    expect(queued.filter((id) => id === active)).toHaveLength(1);
    // Running it again adds nothing.
    const before = await db.indexJob.count();
    await store.enqueueUnindexed();
    expect(await db.indexJob.count()).toBe(before);
  });
});
