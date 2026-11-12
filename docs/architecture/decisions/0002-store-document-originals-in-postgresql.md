# ADR-0002: Store document originals in PostgreSQL `bytea`

- Status: Accepted
- Date: 2026-11-12
- Deciders/owner: agency-base implementation
- Related areas: `documents` module, data ownership, backup, operations

## Context

Documents (PDF/DOCX) are attached to deals. The specification excludes external
storage providers. Metadata and file must not drift apart.

## Options considered

### Option 1 — Filesystem or object storage plus metadata rows

- Benefits: smaller database; streaming-friendly.
- Costs/risks: add/delete is not transactional across two stores; a second
  system to back up and operate; outside the specification.

### Option 2 — PostgreSQL `bytea` in the metadata row

- Benefits: one transaction for add/update/delete; one backup (`pg_dump`);
  no extra infrastructure.
- Costs/risks: database size and memory per read grow with files; requires a
  size cap and care not to load file bytes on list queries.

### Option 3 — defer/do nothing

Documents would not be implementable in the first release.

## Decision

Option 2. Originals live in the `file_data` `bytea` column of the same row as
the metadata. Files are capped at 25 000 000 bytes and requests at 26 000 000
bytes, with at most 2 concurrent uploads per API instance. File type is
validated as PDF or DOCX in `modules/documents/infrastructure/files`. Metadata
reads use explicit projections that never select `file_data`; only the file
read operation does.

## Consequences

- Positive: transactional integrity; simple backup and restore.
- Accepted trade-offs: large rows; the upload concurrency limit is per API
  instance; no antivirus scanning is implemented.
- Follow-up work: revisit if file sizes or volume outgrow the cap.

## Compliance and verification

`pnpm test:integration` covers create/update/delete, file read, and size/type
validation; `docs/operations.md` describes operations.

## Supersedes / superseded by

None.
