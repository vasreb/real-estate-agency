# ADR-0008: Background indexing worker with a PostgreSQL job table

- Status: Accepted
- Date: 2026-11-17
- Deciders/owner: RAG assistant implementation
- Related areas: new worker, `documents` module, deployment

## Context

Indexing needs OCR, DOCX to PDF conversion (LibreOffice), text extraction,
chunking and embedding. These are heavy, slow and need system packages that
the API image should not carry.

## Options considered

### Option 1 — Separate worker container and a plain job table

- Benefits: no new library; one database; jobs survive restarts; the API image
  stays small.
- Costs/risks: polling and retry logic written by us.

### Option 2 — Queue library (for example `pg-boss`) or Redis

- Benefits: ready retries and scheduling.
- Costs/risks: a new dependency or service for a small workload.

### Option 3 — Run conversion inside the API process

- Benefits: no new deployable.
- Costs/risks: blocks requests, bloats the API image.

## Decision

Option 1. `index_jobs` is a table; the worker claims rows with
`SELECT ... FOR UPDATE SKIP LOCKED`, retries failed jobs with a delay and
records the error. At most one active job per document is enforced by a partial
unique index. The worker image contains OCRmyPDF, Tesseract and LibreOffice.
Chunks are replaced in one transaction only after success. Originals are never
modified; derived PDFs and text are stored separately.

## Consequences

- Positive: simple operations and a clear failure state per document.
- Accepted trade-offs: custom queue code; LibreOffice output can differ from
  native Word pagination.
- Follow-up work: none. The worker is a second entry point of `apps/api`
  (`src/worker.ts`, module `modules/indexing`) built into its own image
  (`apps/api/Dockerfile.worker`), so it reuses the Prisma client and
  configuration instead of adding a workspace.

## Compliance and verification

Unit tests for claiming, retry and failure; integration tests for atomic chunk
replacement.

## Supersedes / superseded by

None.
