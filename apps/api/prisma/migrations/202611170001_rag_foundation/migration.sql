-- RAG foundation: ADR-0006 (pgvector), ADR-0007 (document owner), ADR-0008 (job table).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE "document_processing_status" AS ENUM ('pending', 'processing', 'indexed', 'failed');
CREATE TYPE "index_job_status" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- A document belongs to exactly one owner: a deal or, directly, a team.
ALTER TABLE "documents" ALTER COLUMN "deal_id" DROP NOT NULL;
ALTER TABLE "documents"
  ADD COLUMN "team_id" UUID,
  ADD COLUMN "processing_status" "document_processing_status" NOT NULL DEFAULT 'pending',
  ADD COLUMN "indexed_at" TIMESTAMPTZ(3),
  ADD COLUMN "processing_error" TEXT,
  ADD COLUMN "pdf_representation" BYTEA;
ALTER TABLE "documents" ADD CONSTRAINT "documents_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_single_owner"
  CHECK (("deal_id" IS NOT NULL) <> ("team_id" IS NOT NULL));
-- Team collection documents are shared material: no contracts, amendments or parents.
ALTER TABLE "documents" ADD CONSTRAINT "documents_team_collection_shape"
  CHECK ("team_id" IS NULL OR ("parent_document_id" IS NULL AND "type" NOT IN ('contract', 'amendment')));
CREATE INDEX "documents_team_id_idx" ON "documents"("team_id");

CREATE TABLE "document_chunks" (
  "id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "page_start" INTEGER NOT NULL,
  "page_end" INTEGER NOT NULL,
  "section" TEXT,
  "content" TEXT NOT NULL,
  "embedding" vector(1024) NOT NULL,
  "embedding_model" TEXT NOT NULL,
  "content_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('simple', "content")) STORED,
  CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "document_chunks_pages_valid" CHECK ("page_start" >= 1 AND "page_end" >= "page_start")
);
CREATE UNIQUE INDEX "document_chunks_document_id_ordinal_key" ON "document_chunks"("document_id", "ordinal");
CREATE INDEX "document_chunks_content_tsv_idx" ON "document_chunks" USING GIN ("content_tsv");

CREATE TABLE "index_jobs" (
  "id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "status" "index_job_status" NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "run_after" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "index_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "index_jobs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- At most one active job per document.
CREATE UNIQUE INDEX "index_jobs_one_active_per_document" ON "index_jobs"("document_id") WHERE "status" IN ('queued', 'running');
CREATE INDEX "index_jobs_status_run_after_idx" ON "index_jobs"("status", "run_after");
