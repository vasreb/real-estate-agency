# ADR-0003: Enforce document parent-link integrity in the database

- Status: Accepted
- Date: 2026-11-12
- Deciders/owner: agency-base implementation
- Related areas: `documents` module, PostgreSQL schema

## Context

A document may reference a parent document that must be a contract in the same
deal. Concurrent requests could otherwise delete or change a parent while a
child is being linked, or link across deals.

## Options considered

### Option 1 — Application-only validation

- Benefits: simple.
- Costs/risks: racy under concurrency; no protection against other writers.

### Option 2 — Composite foreign key plus CHECKs plus locked verification

- Benefits: the database rejects cross-deal links and deletion of a referenced
  parent.
- Costs/risks: more schema complexity; the error must be mapped explicitly.

### Option 3 — defer/do nothing

Leaves cross-deal and dangling links possible.

## Decision

Option 2. A composite FK `(deal_id, parent_document_id)` references
`(deal_id, id)` with `ON DELETE RESTRICT`, together with CHECK constraints.
Before writing, the server verifies in the transaction that the parent is a
contract, taking `FOR KEY SHARE` on it. A RESTRICT violation (SQLSTATE 23001)
is mapped to HTTP 409.

## Consequences

- Positive: integrity holds under concurrent requests.
- Accepted trade-offs: a parent with children cannot be deleted until the
  children are removed.
- Follow-up work: none.

## Compliance and verification

DB-backed tests in `pnpm test:integration` (documents module).

## Supersedes / superseded by

None.
