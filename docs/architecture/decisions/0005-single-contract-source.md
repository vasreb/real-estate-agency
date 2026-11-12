# ADR-0005: Single contract source with generated OpenAPI and types

- Status: Accepted
- Date: 2026-11-12
- Deciders/owner: agency-base implementation
- Related areas: `packages/contracts`, `apps/api`, `apps/web`

## Context

API and web must agree on request and response shapes without hand-maintained
duplicates.

## Options considered

### Option 1 — Hand-written types in each app

- Benefits: no tooling.
- Costs/risks: drift.

### Option 2 — Hand-edited OpenAPI as the source

- Benefits: standard format.
- Costs/risks: separate runtime validation schemas are still needed.

### Option 3 — Zod 4 schemas as canonical source, generated OpenAPI 3.1

- Benefits: one source for runtime validation and documentation; generated
  client types.
- Costs/risks: a generation step and drift check to maintain.

## Decision

Option 3. `packages/contracts/src/{schemas,operations}.ts` is canonical.
`pnpm contracts:generate` writes `openapi.json` and `src/generated/paths.ts`
(openapi-typescript); the web app calls the API through `openapi-fetch` in
`apps/web/src/shared/api/client.ts`. `pnpm contracts:check` regenerates and
compares at byte level. The `Origin` header is not an OpenAPI parameter: it was
replaced by an operation description because browsers set `Origin` themselves.

## Consequences

- Positive: one contract; drift is caught mechanically.
- Accepted trade-offs: generated files are never hand-edited.
- Follow-up work: none.

## Compliance and verification

`pnpm contracts:check` (part of `pnpm check` and `pnpm verify`).

## Supersedes / superseded by

None.
