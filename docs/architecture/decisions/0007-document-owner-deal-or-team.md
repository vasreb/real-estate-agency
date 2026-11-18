# ADR-0007: A document belongs to a deal or directly to a team

- Status: Accepted
- Date: 2026-11-17
- Deciders/owner: RAG assistant implementation
- Related areas: `documents` and `deals` modules, schema, access control

## Context

Market reports and other shared materials belong to a team, not to one deal.
Today `documents.deal_id` is required and the access team is derived from the
deal.

## Options considered

### Option 1 — `deal_id` or `team_id`, exactly one

- Benefits: honest model; access derivation stays simple.
- Costs/risks: queries and access checks must handle both owners.

### Option 2 — One service deal per team for shared files

- Benefits: no schema change.
- Costs/risks: fake deals appear in lists and numbering.

### Option 3 — defer/do nothing

No team collection.

## Decision

Option 1. `documents.deal_id` becomes nullable and `documents.team_id` is added.
A CHECK requires exactly one of them. Team-level documents cannot be
`contract` or `amendment` and have no parent. The composite parent foreign key
`(deal_id, parent_document_id)` stays for deal documents (ADR-0003); with a
null `deal_id` it is not enforced, and a CHECK forbids a parent there.

## Consequences

- Positive: shared documents are first-class; deal behaviour is unchanged.
- Accepted trade-offs: every access path must resolve the team from either owner.
- Follow-up work: owner-aware document repository and API (plan step 2).

## Compliance and verification

Schema integration tests for the CHECKs; access tests for both owners.

## Supersedes / superseded by

Extends ADR-0003 and ADR-0002; supersedes neither.
