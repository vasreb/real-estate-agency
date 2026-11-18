# ADR-0006: Use a pgvector-enabled PostgreSQL 18 image

- Status: Accepted
- Date: 2026-11-17
- Deciders/owner: RAG assistant implementation
- Related areas: `compose*.yaml`, CI, migrations, retrieval

## Context

The RAG assistant (`docs/agency-rag-spec.md`) stores embeddings next to the
documents and searches them with `pgvector`. The stock `postgres:18` image does
not include the extension.

## Options considered

### Option 1 — `pgvector/pgvector:pg18-trixie` image everywhere

- Benefits: same database, one backup, same transaction as documents and
  chunks; no extra service. The `-trixie` variant uses the same Debian release
  (13, glibc 2.41) as `postgres:18`, so existing volumes keep their collation
  and can be reused in place.
- Costs/risks: a non-official image to track. The plain `pgvector/pgvector:pg18`
  tag is built on Debian 12 (glibc 2.36): on a volume created by
  `postgres:18` PostgreSQL reports a collation version mismatch and text
  indexes may be ordered wrongly. This was found when the ops test recreated
  the test database container on the plain tag.

### Option 2 — Separate vector database

- Benefits: specialized features.
- Costs/risks: a second system to run and back up; chunks and documents can
  drift apart; tenant filtering must be duplicated.

### Option 3 — defer/do nothing

No semantic search.

## Decision

Option 1. All Postgres services (`compose.yaml`, CI) use
`pgvector/pgvector:pg18-trixie`. A migration runs `CREATE EXTENSION vector`. Embeddings
are `vector(1024)` with no vector index in the first version: exact search
with team and deal filters is enough for about 10 000 chunks and does not lose
results to post-filtering. HNSW is added when corpus size or latency requires it.

## Consequences

- Positive: transactional integrity between documents, chunks and embeddings.
- Accepted trade-offs: the extension is a hard dependency of the migrations;
  `CREATE EXTENSION` needs a privileged role (the compose `POSTGRES_USER` is).
- Follow-up work: move the loaded demo archive to a pgvector container with a
  dump and restore; it cannot get the extension in place. A restore into a
  fresh cluster also avoids any collation mismatch.

## Compliance and verification

`pnpm test:integration` runs the migration on a pgvector database.

## Supersedes / superseded by

None.
