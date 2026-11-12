# Contracts and Data Ownership

## Contract sources

- Public API contract: `packages/contracts/src/schemas.ts` (Zod 4 DTOs) and
  `packages/contracts/src/operations.ts` (eight endpoint descriptors: method,
  path, success status, request media, binary download, error statuses).
- Runtime validation schemas: the same Zod schemas, imported by `apps/api`
  route handlers and by `apps/web` forms. There is no second hand-written copy.
- Generated consumers/clients: `packages/contracts/openapi.json` (OpenAPI 3.1)
  and `packages/contracts/src/generated/paths.ts` (`openapi-typescript`),
  consumed by the browser `openapi-fetch` adapter.
- Generation and drift-check commands: `pnpm contracts:generate` writes both
  outputs; `pnpm contracts:check` regenerates into a temporary directory and
  compares bytes, failing on drift without Git and without touching sources.

Generated files must not be edited by hand. Changes start from their
authoritative source and regenerate consumers through documented commands.

### Contract rules

- JSON keys are snake_case. Errors are `{ code, message }` with codes
  `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`,
  `DOCUMENT_REFERENCED`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE`,
  `RATE_LIMITED`, `INTERNAL_ERROR`.
- Document metadata never contains `file_data`. `document_date` and
  `effective_from` are `YYYY-MM-DD`; `created_at` is an ISO datetime.
- Upload metadata (`createDocumentSchema`) is separate from the binary `file`
  part; only create defaults `status` to `unknown`.
- PATCH (`patchDocumentSchema`) is strict: omitted keys keep their value,
  `null` clears only `document_number`, `document_date`, `effective_from`,
  `parent_document_id`; `title` and `status` cannot be `null`; empty strings,
  read-only and unknown keys are rejected; `{}` is a valid no-op.
- Limits: title/document number ≤ 255 characters, email ≤ 254, password ≤ 1024
  bytes (not trimmed), file ≤ 25 000 000 bytes, request ≤ 26 000 000 bytes.
- The package is browser-safe: runtime sources import only `zod` and local
  modules (asserted in `src/schemas.test.ts`).

## Compatibility policy

- Owner: `@agency/contracts`; API and web are its only consumers and ship from
  the same workspace, so changes are made atomically with both consumers.
- Breaking changes: edit the Zod source, regenerate, and update API handlers and
  web callers in the same change; typecheck fails on stale consumers.
- No external consumers exist; no versioned coexistence or deprecation window
  is required for the first version.
- CI runs `pnpm contracts:check` (part of `pnpm check`).

## Data ownership

| Data/domain                         | Authoritative owner    | Read access             | Write access           | Consistency boundary                    |
| ----------------------------------- | ---------------------- | ----------------------- | ---------------------- | --------------------------------------- |
| users, sessions, team_members       | API `auth` module      | auth                    | auth; seed             | session row per login                   |
| teams, clients, properties, deals   | API `deals` module     | deals (team-scoped)     | seed only              | seed transaction                        |
| documents (metadata + `bytea` file) | API `documents` module | documents (team-scoped) | documents (team admin) | one transaction per create/patch/delete |

## Invariants

| Invariant                                | Enforcement                                                       | Regression test                            |
| ---------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| Deal number unique within a team         | DB unique `(team_id, number)`                                     | `apps/api/test/integration/schema.test.ts` |
| One membership per user and team         | DB composite PK `(team_id, user_id)`                              | `schema.test.ts`                           |
| Parent document belongs to the same deal | DB composite FK `(deal_id, parent_document_id)` → `(deal_id, id)` | `schema.test.ts`                           |
| Document is not its own parent           | DB CHECK                                                          | `schema.test.ts`                           |
| Only amendments have a parent            | DB CHECK                                                          | `schema.test.ts`                           |
| Parent is a contract                     | API transaction with `FOR KEY SHARE` lookup                       | documents integration tests                |
| Referenced contract cannot be deleted    | DB FK `ON DELETE RESTRICT` → 409                                  | `schema.test.ts`, documents tests          |
| Responses never include `file_data`      | strict response schemas, explicit projections                     | `packages/contracts/src/schemas.test.ts`   |

## Migrations and generated schemas

- Migration tool and command: Prisma 7 migrations in
  `apps/api/prisma/migrations/`; `pnpm db:migrate` runs `migrate deploy` only
  (never reset).
- Review/rollout policy: hand-reviewed SQL; constraints Prisma cannot express
  (CHECKs, composite self FK with RESTRICT) live in the migration SQL.
- Disposable test database: `agency_test` on port 5433, prepared by
  `pnpm db:test:prepare` behind an allowlist guard.
- Generated schema/client checks: `pnpm db:generate` before build/typecheck;
  generated Prisma client is not committed. `pnpm contracts:check` for API
  contracts.
