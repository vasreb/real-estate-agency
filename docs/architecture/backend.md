# Backend architecture contract (Fastify + Prisma 7 + PostgreSQL 18)

This document is a project-adjustable policy for the required backend stack.
Its goal is to make the modular monolith enforceable, not to mandate full Clean
Architecture for every CRUD method.

## Project implementation

- Fastify 5 in `apps/api`; composition root `src/app.ts`
  (`createApp(config, { database, now, logDestination })`), server lifecycle
  `src/server.ts`. Listens internally (default `127.0.0.1:3001`) with
  `trustProxy: false` ([ADR-0001](decisions/0001-separate-fastify-api-behind-single-nextjs-origin.md)).
- Modules: `auth`, `deals`, `documents` under `src/modules/`; cross-module
  wiring happens only in the composition root. `src/modules/_capability-template`
  is a skeleton for new capabilities.
- Persistence: PostgreSQL 18 via Prisma 7. Originals are `bytea`
  ([ADR-0002](decisions/0002-store-document-originals-in-postgresql.md)); parent
  links are database-enforced
  ([ADR-0003](decisions/0003-parent-link-integrity-in-database.md)).
- Contracts: `@agency/contracts`
  ([ADR-0005](decisions/0005-single-contract-source.md)).
- Tests: Jest 30 unit tests and DB-backed integration tests against
  `agency_test` (`pnpm test:integration`).

## Required backend stack

- HTTP framework: Fastify (select and pin a supported major when bootstrapping).
- Database/ORM: PostgreSQL 18 with Prisma 7.
- Logging: Pino.
- Request and schema validation: Zod 4, integrated explicitly with Fastify.
- Testing: Jest 30 + Supertest.

## Module ownership and public imports

Each business feature lives at `<backend-root>/modules/<feature>/`. Example:

```text
modules/<feature>/
  index.ts                      # public exports ONLY
  <feature>.plugin.ts
  presentation/                 # controllers and DTO mappings
  application/                  # use cases / orchestration
  domain/                       # pure business rules
  infrastructure/               # feature-owned Prisma repositories
  tests/
```

**Other features may import only `<module-alias>/<feature>` (resolving to
`<feature>/index.ts`)**, not `<module-alias>/<feature>/infrastructure/*`,
handlers, entities, or Prisma repositories. The application factory composes
Fastify plugins; expose only intended cross-feature APIs via `index.ts`.

Recommended dependency direction within a complex feature:

- `presentation -> application`
- `application -> domain` and injected persistence port, where a port adds real
  value
- `infrastructure -> domain` / port implementation
- `domain -> none of Fastify, Prisma, HTTP framework`

Avoid service-to-service cycles between business features. When feature A needs
feature B, expose a narrow read/service API or restructure shared ownership.
Avoid creating a generic `shared` business module.

## DTO, domain and persistence separation

- Request DTOs validate HTTP inputs. Response DTOs declare the public contract;
  never return raw Prisma entities.
- Persisted records are not domain objects by default. Map DB records
  explicitly when business semantics require it.
- Prisma is not a domain-layer dependency. Use repositories/data-access
  adapters inside each owning feature.
- Select only fields needed; paginate collections; prevent N+1 and
  unrestricted scans.
- Maintain one Prisma schema/migration history managed by an authorized
  backend owner; coordinate concurrent schema changes.

## Integrity and authorization

- Derive tenant/resource scope from the authenticated server context; test
  attempts to access another tenant's records.
- DB unique/check/exclusion constraints should enforce essential invariants
  where supported.
- Use transactions and concurrency-safe techniques for booking overlaps,
  inventory reservations and financial state transitions.
- Validate money and timezone semantics in specs; never use float for monetary
  arithmetic without an explicit strategy.
- Use idempotency for external callback/webhook processing and retryable
  critical writes where appropriate.

## Enforcement policy

- REQUIRED: ESLint + typescript-eslint with TypeScript strict settings.
- REQUIRED: file-level architectural import restrictions
  (`eslint-plugin-boundaries` for files within a single Fastify app).
- REQUIRED: unit/integration/contract tests run in CI. Add a negative boundary
  fixture or temporary illegal import to prove forbidden dependencies cause
  lint to fail.
- RECOMMENDED: dependency-cruiser for cycle reports, if needed beyond the
  boundaries plugin.
- OPTIONAL: Nx `@nx/enforce-module-boundaries` only when features are actually
  Nx libraries/projects; it does not enforce independence between arbitrary
  sibling folders inside one Nx project.
- REQUIRED: CI uses the same package-manager scripts that agents run locally;
  do not create a separate validation path only CI knows about.

## Definition of done for feature changes

1. Approved behavior and contract preserved; no accidental public API
   expansion.
2. Module ownership and import restrictions satisfied.
3. Validation, auth, tenant isolation and critical integrity verified.
4. Focused tests pass; relevant typecheck, lint and architecture commands pass.
5. Database migrations reviewed (if changed); no destructive command run
   against real data.
6. Report includes commands and outcomes, modified files and remaining risks.
