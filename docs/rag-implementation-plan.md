# Implementation Plan: RAG assistant

- Status: Implemented on branch `feat/rag-assistant`, not yet verified against the real model, Voyage and the full archive (see "Known unverified behavior")
- Related feature spec: `docs/agency-rag-spec.md`
- Architecture baseline/ADRs: ADR-0001 (separate Fastify API behind Next.js
  origin), ADR-0002 (originals in `bytea`), ADR-0003 (parent link in database),
  ADR-0005 (single contract source); new ADR-0006 to ADR-0009 (pgvector image,
  document owner, indexing worker and queue, Voyage embeddings).

## Goal and stop condition

An employee asks a question from the widget or from `/chat`, scoped to a team or
a deal, and gets an answer with clickable citations that open the right page of
the source PDF. Amendments are taken into account. An administrator can upload a
file to the team collection, see its processing status, reindex it, and delete it.

Done when: the 30–50 reference questions (spec §7) run with the report sections
defined there (retrieval, answer, citations, data isolation, cost and latency),
and the demo scenario in spec §7 works in the browser.

## Baseline and findings

Observed in the repository:

- `Document.dealId` is required and the composite FK
  `(deal_id, parent_document_id)` depends on it
  (`apps/api/prisma/schema.prisma`, `documents_parent_same_deal_fk`).
  Team-level documents need a schema change.
- `Property` has only `address`; `Deal` has no commission, tenant, or rate.
  There is no property API or page. Only `/api/deals`, `/api/deals/{id}` and the
  document routes exist.
- Deal number is unique per team (`@@unique([teamId, number])`); the seed reuses
  `2026-001` in different teams.
- Every Postgres image is `postgres:18` (`compose.yaml`,
  `compose.production.yaml`, `.github/workflows/ci.yml`). `pgvector` is not
  available there. The loaded demo database `agency_demo_archive` runs in its own
  `postgres:18` container (`docs/demo-archive.md`) and cannot get the extension
  in place.
- There is no queue, worker, OCR, text extraction, or DOCX conversion. The API
  only validates PDF structure (`pdf-lib`) and DOCX packages (`yauzl`,
  `fast-xml-parser`). No Anthropic SDK, Voyage client, or `assistant-ui`.
- Downloads use `attachment` only
  (`apps/api/src/modules/documents/presentation/content-disposition.ts`).
- Browser traffic reaches the API through Next rewrites
  (`apps/web/next.config.ts`). Streaming through them works (checked on
  2026-11-18 with the real model: events arrive in many chunks, no buffering).
- Demo archive: 2,400 originals (2,183 PDF, 217 DOCX after the scan change),
  242 image-only PDFs, 240 amendments (238 linked, 2 unresolved).

Assumptions (verify during the work):

- ~3,856 pages produce ~3–4M tokens for embeddings, well inside the Voyage free
  allowance. Rate limits without a payment method are unknown.
- Exact (non-indexed) vector search over ~10k chunks with a team filter is fast
  enough at 1024 dimensions.
- The minimum cacheable prompt length is unknown for the chosen Claude model.

## Components and ownership

Owners are not assigned yet. One owner integrates all changes (root `AGENTS.md`).

| Component                         | Outcome                                                                                      | Owner | Dependencies | Verification                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------- | ----- | ------------ | ------------------------------------------------------------------ |
| ADRs                              | Decisions on pgvector image, worker and queue, Voyage embeddings, document owner model       | TODO  | none         | Review; ADR index updated                                          |
| Database                          | Extension, owner change on `documents`, processing fields, `document_chunks`, `index_jobs`   | TODO  | ADRs         | `schema.test.ts`, migration SQL review, `pnpm test:integration`    |
| Contracts                         | OpenAPI and Zod schemas for team documents, teams, preview, reindex, chat                    | TODO  | Database     | `pnpm contracts:check`                                             |
| `documents` module                | Team collection, preview, reindex, job enqueueing on upload and delete, owner-aware access   | TODO  | Contracts    | Integration tests incl. tenant isolation, existing 403/404/409     |
| Worker (`apps/worker` or similar) | Text extraction, OCR, DOCX to PDF, chunking, embeddings, atomic chunk replacement            | TODO  | Database     | Unit tests per stage, fixtures for text, scan, DOCX, failure cases |
| `assistant` module                | Three tools, amendment check, citations, `POST /api/chat`, model config, history and caching | TODO  | Worker data  | Unit and integration tests, eval harness                           |
| Web                               | assistant-ui chat (widget and `/chat`), `/admin/documents`, citation preview, team selector  | TODO  | Contracts    | Vitest, Playwright, architecture check                             |
| Eval harness                      | Reference questions, report with the five sections of spec §7                                | TODO  | assistant    | Report reviewed; isolation checks pass                             |

## Decisions and open questions

Decided:

- Embeddings: Voyage (`voyage-4` or `voyage-4-lite`), 1024 dimensions, no vector
  index in v1 (exact search with team and deal filters).
- Queue: plain Postgres table with `FOR UPDATE SKIP LOCKED`, no new library.
- Document owner: `deal_id` or `team_id`, exactly one (`CHECK`). No new document
  type for market reports (`other`).
- `get_property` returns address and linked deals only.
- Chat history is held by the client and not stored in the database.

Open:

- Hypothesis: dropping old tool results between turns. Decide from eval results
  (token use against follow-up question quality). Owner: assistant module.
- Streaming through the Next proxy: resolved. `POST /api/chat/stream` returns
  NDJSON; the Next rewrite passes it through unbuffered. Keep any outer proxy
  from buffering (see `docs/operations.md`).
- Voyage limits without a payment method. Check before the full backfill.
- Final choice of `voyage-4` vs `voyage-4-lite`, by eval results.
- Whether the worker is a new workspace (`apps/worker`) or a second entry point
  of `apps/api`. Needs the ADR (root `AGENTS.md` forbids new packages without
  demonstrated need).
- Quality criteria for acceptance: deliberately not agreed with the customer for
  now; the eval report reports numbers without pass/fail thresholds.

## Ordered work

Each step is independently verifiable. Steps 2 and 3 can run in parallel after
step 1 if owners do not share files.

0. **ADRs.** Write four ADRs under `docs/architecture/decisions/` (pgvector
   image, worker and queue, Voyage embeddings, document ownership by deal or
   team). Update the ADR index. Acceptance: reviewed and approved before code.

1. **Database and infrastructure.**
   - Owned paths: `apps/api/prisma/**`, `compose*.yaml`, `.github/workflows/ci.yml`,
     `tooling/database.mjs`.
   - Switch all `postgres:18` images to a pgvector image. For the demo archive,
     start a new pgvector container and restore a dump. Never run `db:seed`,
     `migrate reset`, or `db push` against `agency_demo_archive`.
   - One reviewed migration: `CREATE EXTENSION vector`; `documents.deal_id`
     nullable, `team_id` added, `CHECK` for exactly one owner, parent FK kept
     for deal documents; processing state, last indexed time, error message,
     `pdf_representation bytea`; `document_chunks` with page range, clause or
     section, text, `vector(1024)`, embedding model ID, cascade delete, and a
     full-text search column; `index_jobs` table.
   - Acceptance: migration applies to a clean database and to a copy of the demo
     archive; existing integration tests still pass; demo archive importer
     (`apps/api/prisma/demo-archive/persistence/*`) is checked against the new
     schema.
   - Failure cases: a document with both or neither owner is rejected; deleting
     a document removes chunks; a contract with amendments still returns 409.

2. **Contracts and `documents` module.**
   - Owned paths: `packages/contracts/**`, `apps/api/src/modules/documents/**`,
     `apps/api/src/modules/deals/**` where owner awareness is needed.
   - Add `GET /api/teams`, `GET` and `POST /api/teams/{teamId}/documents`,
     `POST /api/documents/{id}/reindex`, `GET /api/documents/{id}/preview`
     (inline PDF; DOCX uses the PDF representation). Make existing reads,
     downloads and deletes owner-aware. Upload and delete enqueue jobs.
   - Acceptance: team admin only for writes (403 for members), foreign team and
     document return 404, collection documents cannot be `contract` or
     `amendment` and have no parent; existing deal document tests unchanged.
   - Run `pnpm contracts:check`; do not hand-edit generated paths.

3. **Worker pipeline.**
   - Owned paths: new worker workspace and Dockerfile, `compose*.yaml` service
     entry, `tooling/` helpers if needed.
   - Stages: claim job, extract text per page, OCR (scans and image areas;
     keep the signed original untouched, store derived text only), DOCX to PDF
     with LibreOffice, chunk by page, heading and clause, embed with Voyage,
     replace chunks in one transaction only on success, record error on failure.
   - Backfill command that enqueues all existing documents.
   - Acceptance: text PDF, image-only PDF (one of the eight scanned deals), and
     DOCX all produce correct page ranges; a failing document leaves previous
     chunks intact and shows the reason; retry works; deletion removes chunks.
   - Unverified until measured: OCR quality on the scanned set, indexing time.

4. **`assistant` module.**
   - Owned paths: `apps/api/src/modules/assistant/**`, `packages/contracts/**`
     for chat schemas, configuration for model and keys (`.env.example`).
   - Three tools with per-call argument and permission checks:
     `search_records`, `get_property`, `search_documents`. Hybrid search (text
     plus vector) filtered by team and deal.
   - Amendment verification inside `search_documents` as in spec §5, including
     unlinked amendments matched by contract number and date, and explicit gaps.
   - Citations from `search_result` blocks mapped to document and page.
   - `POST /api/chat`: step and context budget, client history limited to text
     and compact IDs, prompt caching on a stable prefix, model name in
     configuration, usage and latency logged.
   - Acceptance: question about another team returns nothing from it; ambiguous
     address leads to a clarifying question; deal number is resolved within the
     selected team; instructions inside documents are not followed.

5. **Web.**
   - Owned paths: `apps/web/src/**` (FSD slices for assistant chat, admin
     documents), `apps/web/app/chat`, `apps/web/app/admin/documents`.
   - assistant-ui adapter to `POST /api/chat`; widget button in the shell and
     `/chat` page sharing one component; team and deal selector; clickable
     citations opening the preview at the cited page.
   - Streaming through the Next rewrite: checked, works (see the risks list).
   - `/admin/documents`: list with status, upload, reindex, delete.
   - Acceptance: spec §7 demo scenario in the browser; architecture check
     passes; boundary tests updated if rules change.

6. **Evaluation.**
   - Owned paths: new eval directory under `apps/api/test/` or `tooling/`.
   - Write 30–50 questions on the demo archive with accounts, scope, expected
     answer and pages (text PDF, scan, DOCX, market report, current and future
     amendment, unresolved contradiction, foreign team).
   - Report the five sections from spec §7. Run Haiku and Sonnet on identical
     tools and on identical passages separately. Compare the old-tool-results
     hypothesis. Record token cost and latency.
   - Acceptance: report produced; isolation checks have zero leaks.

7. **Backfill and demo.** Run the backfill on the pgvector copy of the demo
   archive. Check Voyage limits first. Record indexing time, failures, and cost.

## Final verification

- Focused tests: documents integration tests (owner model, preview, reindex,
  isolation), worker stage tests, assistant tool tests, citation mapping tests.
- Architecture/type/lint gates: `pnpm check:architecture`, `pnpm typecheck`,
  `pnpm lint`, `pnpm format:check`, `pnpm contracts:check`.
- Build and end-to-end checks: `pnpm --filter @agency/api test:unit`,
  `pnpm test:integration` (disposable `agency_test` on a pgvector image),
  Playwright flows for chat, citation preview, and admin documents.
- Manual or operational checks: Docker build of the worker, full backfill,
  streaming through the proxy, demo run from the widget and `/chat`.
- Known unverified behavior: OCR quality, indexing time, Voyage rate limits,
  minimum cacheable prompt length, Haiku vs Sonnet quality, native Office
  pagination of DOCX conversion (LibreOffice output can differ from Word).
