# Module Boundaries and Dependency Rules

## Ownership model

Organize modules around business capabilities or other stable ownership
boundaries. Every module should state:

- the behavior and data it owns;
- its public API;
- what it may depend on;
- which invariants it protects;
- which tests prove its behavior and boundaries.

| Module/capability    | Owns                                                                                                                          | Public API                   | May depend on                                                                         | Must not depend on                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `auth` (api)         | Passwords (Argon2id), hashed sessions, cookie, login/logout routes, request authenticator                                     | `modules/auth/index.ts`      | `infrastructure/*` shared adapters, contracts                                         | `deals`, `documents` internals                                                      |
| `deals` (api)        | Team-scoped deal list/detail, `getAccessibleDealScope`                                                                        | `modules/deals/index.ts`     | shared infrastructure (receives `authenticate` via options from the composition root) | `documents` (receives `listDocumentMetadata` via options from the composition root) |
| `documents` (api)    | Metadata reads, transactional create/update/delete, file read, PDF/DOCX validation (`infrastructure/files`), multipart routes | `modules/documents/index.ts` | shared infrastructure (receives `authenticate` via options from the composition root) | `deals` (receives `getAccessibleDealScope` via options from the composition root)   |
| `web` FSD layers     | UI, server gates, client state                                                                                                | slice `index.ts` files       | lower layers only: `_app` > `_pages` > `widgets` > `features` > `entities` > `shared` | other apps; upper layers                                                            |
| `packages/contracts` | Zod schemas, operations, generated OpenAPI/types                                                                              | `@agency/contracts`          | `zod`                                                                                 | apps                                                                                |

The composition root is `apps/api/src/app.ts` (`createApp(config, { database,
now, logDestination })`); `src/server.ts` owns the Prisma client and
disconnects it on close. Shared technical adapters live in
`apps/api/src/infrastructure/` (config, errors, logging, database, security).
Domain code imports neither Prisma nor Fastify. There is no `deals` <->
`documents` import in either direction.

Enforcement: `tooling/eslint-architecture-plugin.mjs`, ESLint boundaries,
dependency-cruiser no-cycles, and fixtures in `tooling/test-architecture.mjs`,
all run by `pnpm check:architecture`.

## Public APIs

- Treat module internals as private.
- Export only interfaces or operations with real external consumers.
- Import another module through its documented entry point.
- Do not expose persistence models or implementation details as a shortcut.
- Review public API changes for all known callers and compatibility needs.

## Dependency direction

Document the direction that applies to this repository. Example for a layered
backend capability:

```text
transport/presentation -> application -> domain
infrastructure -------> application/domain contracts
composition root ------> wires implementations
```

Example for a layered frontend:

```text
application -> pages -> features -> domain/entities -> shared
```

These are examples, not universal layer names. Replace them with the selected
architecture. Reject cycles and dependencies that bypass module APIs.

## Layering policy

- Start with the smallest structure that preserves ownership and testability.
- Add domain/application/infrastructure layers only when they protect a real
  policy or change boundary.
- Avoid generic shared business modules and speculative abstractions.
- Document exceptions in the owning code and, for consequential exceptions, an
  ADR.

## Boundary-change checklist

- Does the owning capability remain clear?
- Are reads/writes performed by the correct owner?
- Are public APIs narrow and sufficient?
- Are dependencies acyclic and directed as documented?
- Are contracts and downstream consumers updated?
- Is there a test that fails if the forbidden dependency is reintroduced?
