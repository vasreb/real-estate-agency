import type { Database } from "../../../infrastructure/database/index.js";
import type {
  IndexedChunk,
  IndexingStore,
} from "../application/index-document.js";

export type ClaimedJob = { id: string; documentId: string; attempts: number };

/** pgvector text input format: `[0.1,0.2,...]`. */
export const toVectorLiteral = (values: number[]) => `[${values.join(",")}]`;

/** Error text stored for administrators: short, single line, no stack. */
export function describeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "Indexing failed";
  return message.replace(/\s+/g, " ").trim().slice(0, 500) || "Indexing failed";
}

/** Queue operations and persistence of indexing results (ADR-0008). */
export function createJobStore(database: Database) {
  const indexingStore: IndexingStore = {
    async loadDocument(documentId) {
      const row = await database.document.findUnique({
        where: { id: documentId },
        select: { mimeType: true, fileData: true },
      });
      return row ? { mimeType: row.mimeType, bytes: row.fileData } : null;
    },

    async replaceChunks({ documentId, model, chunks, pdfRepresentation }) {
      return database.$transaction(
        async (tx) => {
          // Lock the document row: a concurrent delete waits, a prior delete is seen.
          const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM documents WHERE id = ${documentId}::uuid FOR UPDATE`;
          if (locked.length === 0) return false;
          await tx.documentChunk.deleteMany({ where: { documentId } });
          for (const chunk of chunks)
            await insertChunk(tx, documentId, model, chunk);
          await tx.document.update({
            where: { id: documentId },
            data: {
              processingStatus: "indexed",
              indexedAt: new Date(),
              processingError: null,
              ...(pdfRepresentation
                ? { pdfRepresentation: new Uint8Array(pdfRepresentation) }
                : {}),
            },
          });
          return true;
        },
        { timeout: 120_000 },
      );
    },
  };

  type Transaction = Parameters<Parameters<Database["$transaction"]>[0]>[0];
  async function insertChunk(
    tx: Transaction,
    documentId: string,
    model: string,
    chunk: IndexedChunk,
  ) {
    await tx.$executeRaw`
      INSERT INTO document_chunks
        (id, document_id, ordinal, page_start, page_end, section, content,
         embedding, embedding_model)
      VALUES (gen_random_uuid(), ${documentId}::uuid, ${chunk.ordinal},
        ${chunk.pageStart}, ${chunk.pageEnd}, ${chunk.section}, ${chunk.content},
        ${toVectorLiteral(chunk.embedding)}::vector, ${model})`;
  }

  return {
    indexingStore,

    /** Takes the oldest due job; concurrent workers never get the same one. */
    async claimJob(): Promise<ClaimedJob | null> {
      const rows = await database.$queryRaw<ClaimedJob[]>`
        UPDATE index_jobs
        SET status = 'running', locked_at = now(), attempts = attempts + 1,
            updated_at = now()
        WHERE id = (
          SELECT id FROM index_jobs
          WHERE status = 'queued' AND run_after <= now()
          ORDER BY run_after, created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1)
        RETURNING id, document_id AS "documentId", attempts`;
      const job = rows[0];
      if (!job) return null;
      await database.document.updateMany({
        where: { id: job.documentId },
        data: { processingStatus: "processing" },
      });
      return job;
    },

    /** Jobs whose worker died are made available again. */
    async requeueStale(staleAfterSeconds: number): Promise<number> {
      return database.$executeRaw`
        UPDATE index_jobs
        SET status = 'queued', locked_at = NULL, updated_at = now()
        WHERE status = 'running'
          AND locked_at < now() - make_interval(secs => ${staleAfterSeconds})`;
    },

    async completeJob(job: ClaimedJob): Promise<void> {
      await database.indexJob.updateMany({
        where: { id: job.id },
        data: { status: "succeeded", lockedAt: null, lastError: null },
      });
    },

    /**
     * Retries with exponential backoff until `maxAttempts`; then the job and
     * the document are marked failed with a readable reason.
     */
    async failJob(
      job: ClaimedJob,
      error: unknown,
      options: { maxAttempts: number; backoffSeconds: number },
    ): Promise<"retry" | "failed"> {
      const message = describeFailure(error);
      if (job.attempts < options.maxAttempts) {
        const delay = options.backoffSeconds * 2 ** (job.attempts - 1);
        await database.$executeRaw`
          UPDATE index_jobs
          SET status = 'queued', locked_at = NULL, last_error = ${message},
              run_after = now() + make_interval(secs => ${delay}),
              updated_at = now()
          WHERE id = ${job.id}::uuid`;
        await database.document.updateMany({
          where: { id: job.documentId },
          data: { processingStatus: "pending" },
        });
        return "retry";
      }
      await database.indexJob.updateMany({
        where: { id: job.id },
        data: { status: "failed", lockedAt: null, lastError: message },
      });
      await database.document.updateMany({
        where: { id: job.documentId },
        data: { processingStatus: "failed", processingError: message },
      });
      return "failed";
    },

    /** Queues every document that is not indexed and has no active job. */
    async enqueueUnindexed(): Promise<number> {
      return database.$executeRaw`
        INSERT INTO index_jobs (id, document_id)
        SELECT gen_random_uuid(), d.id FROM documents d
        WHERE d.processing_status <> 'indexed'
        ON CONFLICT DO NOTHING`;
    },
  };
}
export type JobStore = ReturnType<typeof createJobStore>;
