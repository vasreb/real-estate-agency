# System Architecture Overview

## Status

- Owner: agency-base implementation
- Last reviewed: 2026-11-12
- Status: Accepted

## System purpose and constraints

- Stack: TypeScript/Node.js 24/pnpm; Next.js 16, React 19, and FSD; Fastify 5,
  Prisma 7, and PostgreSQL 18. All of it is implemented.
- Purpose and workflows: see `../agency-base-spec.md`. Agency users log in,
  list the deals of their team, open a deal, and manage its documents
  (add, edit metadata, delete, download the original).
- Runtime constraints: Next.js is the single external origin; the API listens
  internally. Operations are described in `../operations.md`.
- Security and limits: `Origin` must equal `PUBLIC_ORIGIN` for unsafe methods
  (403); session cookie `agency_session` (HttpOnly, SameSite=Lax, Path=/,
  Secure on https) with a fixed 8-hour TTL; login throttle of 10 attempts per
  IP+email and 100 per IP per 15 minutes (10 000 tracked keys); uploads of at
  most 25 000 000 bytes per file, 26 000 000 bytes per request, 2 concurrent
  per API instance; responses are `Cache-Control: private, no-store`; records
  of other teams return 404, not 403.
- Explicit non-goals (not implemented): registration, password reset, MFA,
  CRUD for reference data, search/filter/pagination, external storage,
  antivirus scanning, real deployment, high availability or SLAs.

## System context

```text
browser --HTTPS--> web (Next.js, single origin)
                     | rewrite /api/:path*  (API_INTERNAL_URL)
                     v
                   api (Fastify, internal 127.0.0.1:3001 by default)
                     v
                   PostgreSQL 18 (data, sessions, document originals)
```

The browser trusts only the web origin. The API is not published externally.

## Components and ownership

| Component                     | Responsibility                                                                        | Owns data/state                       | Public interfaces                           | Owner                      |
| ----------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------- | -------------------------- |
| `apps/web`                    | UI (FSD), server gates, rewrite to the API                                            | TanStack Query cache, forms, UI state | Pages `/login`, `/deals`, `/deals/[id]`     | agency-base implementation |
| `apps/api` module `auth`      | Argon2id passwords, hashed sessions, cookie, login/logout, throttle                   | users' credentials and sessions       | `modules/auth/index.ts`, `/api` routes      | agency-base implementation |
| `apps/api` module `deals`     | Team-scoped deal list/detail, `getAccessibleDealScope`                                | deal reads                            | `modules/deals/index.ts`, `/api` routes     | agency-base implementation |
| `apps/api` module `documents` | Document metadata, transactional create/update/delete, file read, PDF/DOCX validation | documents and originals               | `modules/documents/index.ts`, `/api` routes | agency-base implementation |
| `packages/contracts`          | Canonical Zod 4 schemas and operations, generated OpenAPI/types                       | API contract                          | `@agency/contracts`                         | agency-base implementation |
| `packages/ui`                 | Shared UI primitives                                                                  | none                                  | `@agency/ui`                                | agency-base implementation |
| `packages/config`             | Shared strict TypeScript config                                                       | none                                  | tsconfig presets                            | agency-base implementation |
| PostgreSQL 18                 | Persistence                                                                           | all data, sessions, `bytea` originals | Prisma (API only)                           | agency-base implementation |

## Runtime and deployment view

- Processes/services: `web` (Next.js) and `api` (Fastify). `compose.production.yaml`
  publishes only `web`; `migrate` is an explicit compose profile.
- Databases and object stores: PostgreSQL only; originals are stored in
  `bytea`. No object storage.
- Queues/schedulers: none.
- External providers: none.
- Environment separation and secrets: configuration is read from environment
  variables validated in `apps/api/src/infrastructure/config.ts`; `API_INTERNAL_URL`
  is baked into the web build. Integration tests use a separate database
  `agency_test` (port 5433).

## Cross-cutting decisions

- [ADR-0001: Separate Fastify API behind a single Next.js origin](decisions/0001-separate-fastify-api-behind-single-nextjs-origin.md)
- [ADR-0002: Store document originals in PostgreSQL](decisions/0002-store-document-originals-in-postgresql.md)
- [ADR-0003: Parent-link integrity in the database](decisions/0003-parent-link-integrity-in-database.md)
- [ADR-0004: Dynamic server gates with client-side TanStack Query](decisions/0004-dynamic-server-gates-with-client-query.md)
- [ADR-0005: Single contract source](decisions/0005-single-contract-source.md)

## Quality attributes and verification

| Attribute       | Requirement                                                         | Verification                                                                                                               |
| --------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Security        | Origin check, session cookie, throttle, team isolation, upload caps | `pnpm test:integration`; `pnpm test:e2e` (`security-boundaries.spec.ts`)                                                   |
| Reliability     | Transactional document writes; DB-enforced parent links             | `pnpm test:integration`                                                                                                    |
| Performance     | Only the stated upload/request limits; no other targets defined     | Limits covered by integration tests; no load testing exists                                                                |
| Maintainability | Module boundaries, no cycles, contract in sync                      | `pnpm check:architecture`, `pnpm contracts:check`, `pnpm typecheck`, `pnpm lint`; aggregate `pnpm check` and `pnpm verify` |

CI (`.github/workflows/ci.yml`) is configured to run `pnpm verify`; its remote
execution has not been observed.
