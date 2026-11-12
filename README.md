# Real estate agency — deals and documents

Internal application: employees see the deals of their teams with client,
property and documents; team admins upload, edit and delete document originals.
Product behavior: [docs/agency-base-spec.md](docs/agency-base-spec.md).

## Stack

- `apps/web` — Next.js 16 (App Router, React 19, TanStack Query, FSD), the only
  external origin; `/api/*` is rewritten to the internal API.
- `apps/api` — Fastify 5, Prisma 7 + PostgreSQL 18 (originals in `bytea`),
  Pino, Zod 4.
- `packages/contracts` — Zod schemas and endpoint descriptors; generated
  OpenAPI 3.1 and TypeScript paths. `packages/ui`, `packages/config` — shared UI
  primitives and TypeScript settings.

## Local setup

Requires Node 24, pnpm 10.28.2 and Docker. Copy `.env.example` to `.env` and
replace every placeholder password.

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm db:up
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

The development seed creates two teams, an admin and a member of the first team,
a member of the second, three deals and a contract with a linked amendment.
Passwords come from `SEED_*_PASSWORD` in `.env`.

## Verification

```bash
pnpm db:test:up
```

```bash
pnpm verify
```

`pnpm verify` = `db:validate` + `check` (lint, format, typecheck, architecture,
contract drift, unit tests) + `test:integration` (real PostgreSQL) +
`test:e2e` (production builds + Playwright). See
[docs/architecture/quality-gates.md](docs/architecture/quality-gates.md). CI
(`.github/workflows/ci.yml`) runs the same command.

## Documentation

- Architecture: [docs/architecture/](docs/architecture/)
- Contracts and data: [docs/architecture/contracts-and-data.md](docs/architecture/contracts-and-data.md)
- Operations, backup/restore: [docs/operations.md](docs/operations.md)
