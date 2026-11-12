# Fastify Backend Agent Instructions

Scope: `apps/api/**`. Root `AGENTS.md` applies too. Planned stack: Fastify,
Prisma 7 with PostgreSQL 18, Pino, Zod 4, Jest 30, and Supertest.

Follow the installed major versions; check version-specific APIs before
implementing or upgrading. Do not switch frameworks or libraries without an
approved architecture decision.

## Source of truth (in descending order)

1. Feature acceptance criteria and approved API contracts.
2. Existing repository architecture and ADRs.
3. This file and `docs/architecture/backend.md`.
4. Adjacent code and tests as implementation examples.

Do not bulk-read all docs. Read the relevant feature spec, neighboring module,
and task-specific docs only. Verify installed framework and ORM versions before
using their APIs.

## Architecture

- Organize code by business capability:
  `apps/api/src/modules/<feature>/`.
- A feature owns its handlers/controllers, application logic, domain policies,
  persistence mapping, and focused tests.
- Feature internals are private. Another feature may import **only** the
  feature's explicitly exported public entry point (`index.ts`) or an approved
  shared contract. Do not deep-import another feature's folders.
- The Fastify application factory is the composition root. Register plugins
  explicitly and inject dependencies through plugin options; avoid cycles.
- Controllers handle HTTP, validation, and DTO mapping; no ORM queries or
  substantive business decisions in controllers.
- Place nontrivial workflows in application services/use cases. Pure business
  rules live in domain code without framework or ORM imports. Simple CRUD can
  use Controller + Service + repository without ceremonial layers.
- ORM queries live in a feature-owned repository/data-access adapter. Do not
  use the ORM from controllers, domain code, or another feature's internals.
- Shared infrastructure handles technical concerns only; never hide domain
  logic in `common/`, `utils/`, or global singletons.
- Do not introduce CQRS, event sourcing, a generic base repository, an
  interface for every class, or new packages without demonstrated need.

## Contracts and security

- Use one approved API contract. Generate consumers; never modify generated
  clients directly.
- Validate and normalize request data. Do not expose database models or private
  fields in API responses; use explicit response DTOs/schemas.
- Enforce authorization **and resource/tenant scope** on the server for every
  read/write; never trust scope, role, or ownership supplied only by a client.
- For multi-step writes use transactions. Protect concurrent business state
  transitions with an appropriate database-level strategy, not only a
  read-before-write check.
- Use typed errors and consistent HTTP error mapping. Keep secrets and
  sensitive personal data out of logs.
- Schema changes require reviewed migrations. Never run destructive schema
  commands against a non-disposable database without explicit authorization.

## Changes and delegation

- Before editing, identify the owning module, public API, integration points,
  acceptance criteria, and tests.
- Edit only task-owned paths. If a contract or another module must change,
  coordinate with its owner before crossing file ownership.
- Prefer minimal targeted changes; do not refactor unrelated modules.
- Do not weaken tests, type checking, lint rules, architecture rules, or
  security checks to obtain a green result.
- Never claim a check passed unless it actually ran successfully.

## Validation

Use scripts actually present in this repository:

- Typecheck: `pnpm --filter @agency/api typecheck` (all workspaces:
  `pnpm typecheck`).
- Lint: `pnpm lint` (formatting: `pnpm format:check`).
- Architecture boundary checks and relevant focused tests:
  `pnpm check:architecture`; `pnpm --filter @agency/api test:unit`; DB-backed
  `pnpm test:integration` (disposable `agency_test` database); contract drift
  `pnpm contracts:check`.
- Database schema changes: validate the schema, generate the client, inspect
  migration SQL, and run DB-backed migration/integration tests against a
  disposable test database.
- New/changed HTTP endpoints: verify OpenAPI/contract agreement,
  authorization/tenant isolation, error cases, and relevant E2E tests.

Before reporting completion, list changed files, commands executed and
outcomes, acceptance criteria covered, and unverified behavior.

## Tooling and architecture gates

- Tooling follows root `AGENTS.md`: TypeScript 5.9, ESLint 10 flat config,
  Prettier 3, Husky 9, lint-staged, and commitlint.
- The documented architecture command enforces public APIs and domain
  isolation; never disable it to pass a task.
- Run lint, typecheck, architecture checks, and relevant tests before
  integration according to the repository workflow.
