# ADR-0009: Voyage embeddings, 1024 dimensions

- Status: Accepted
- Date: 2026-11-17
- Deciders/owner: RAG assistant implementation
- Related areas: retrieval, worker, privacy, configuration

## Context

The archive is English, the interface is Russian. The corpus is about 3 900
pages (3–4M tokens). Claude does not read embeddings; they only select passages.

## Options considered

### Option 1 — Voyage (`voyage-4` or `voyage-4-lite`)

- Benefits: multilingual, free allowance (200M tokens per account) covers
  indexing and re-indexing, recommended by Anthropic.
- Costs/risks: document text leaves the system; rate limits without a payment
  method are unknown.

### Option 2 — Local open-source model (for example `bge-m3`)

- Benefits: no external data flow, no usage cost.
- Costs/risks: another service to run and tune.

### Option 3 — defer/do nothing

No semantic search.

## Decision

Option 1 with `vector(1024)`. The embedding model ID is stored on every chunk,
so a model change re-indexes the corpus and queries switch after the new
embeddings are ready. The data is synthetic; real contracts need the
customer's consent to send text to the provider. A local model remains the
fallback.

## Consequences

- Positive: no infrastructure for embeddings.
- Accepted trade-offs: external dependency and provider terms.
- Follow-up work: choose `voyage-4` vs `voyage-4-lite` from evaluation results.

## Compliance and verification

Evaluation report (plan step 6); chunk rows carry the model ID.

## Supersedes / superseded by

None.
