# Architecture Documentation Index

Keep the documents consistent with the implementation. Prefer one
authoritative statement of each contract or invariant.

- [System overview](overview.md) — system shape, components, and external edges.
- [Module boundaries](module-boundaries.md) — ownership, public APIs, and
  allowed dependency direction.
- [Frontend architecture](frontend.md) — required Next.js/React/FSD baseline.
- [Backend architecture](backend.md) — Fastify/Prisma baseline.
- [Contracts and data ownership](contracts-and-data.md) — API/schema ownership
  and compatibility.
- [Quality gates](quality-gates.md) — executable architectural checks.
- [References](references/README.md) — task-indexed documentation links.
- [ADRs](decisions/README.md) — accepted decisions that are costly to reverse:
  - [0001 Separate Fastify API behind a single Next.js origin](decisions/0001-separate-fastify-api-behind-single-nextjs-origin.md)
  - [0002 Document originals in PostgreSQL](decisions/0002-store-document-originals-in-postgresql.md)
  - [0003 Parent-link integrity in the database](decisions/0003-parent-link-integrity-in-database.md)
  - [0004 Dynamic server gates with client-side TanStack Query](decisions/0004-dynamic-server-gates-with-client-query.md)
  - [0005 Single contract source](decisions/0005-single-contract-source.md)

Feature-level behavior belongs in feature specifications. Keep this directory
focused on cross-cutting decisions and rules.
