# ADR-0001: Run a separate Fastify API behind a single Next.js origin

- Status: Accepted
- Date: 2026-11-12
- Deciders/owner: agency-base implementation
- Related areas: deployment, security, `apps/web`, `apps/api`

## Context

The browser needs one origin so the session cookie is first-party and no CORS
configuration is required. Business rules (authentication, team scoping,
document integrity) must stay testable without a web framework.

## Options considered

### Option 1 — Business API in Next.js route handlers / server actions

- Benefits: one process to deploy.
- Costs/risks: business logic coupled to the presentation framework; harder to
  enforce module boundaries and to test against a real database in isolation.

### Option 2 — Separate Fastify API exposed on its own origin

- Benefits: clear backend ownership.
- Costs/risks: cross-origin cookies and CORS configuration; two public
  surfaces to secure.

### Option 3 — Separate Fastify API reached through Next.js rewrites

- Benefits: one external origin; API stays internal and framework-independent.
- Costs/risks: the rewrite target is fixed at build time; request body limits
  must be raised in Next.js.

## Decision

Option 3. `apps/web/next.config.ts` rewrites `/api/:path*` to
`API_INTERNAL_URL` (baked at build time) and sets
`experimental.proxyClientMaxBodySize` to 27 000 000 bytes so that the API's
26 000 000-byte request limit is the effective one. Fastify listens internally
(default `127.0.0.1:3001`). Client addresses are taken from forwarded headers
only for an explicit `TRUSTED_PROXIES` allowlist (default empty: socket
address). Because Next's rewrite proxy forwards `X-Forwarded-For` verbatim
without appending the peer, the web runs behind `apps/web/server.mjs`, which
sets that header to the real peer (or extends a trusted edge's chain), making
the web server an honest hop the API can trust. No business API lives in Next.js route
handlers or server actions. Unsafe methods require `Origin` equal to
`PUBLIC_ORIGIN`.

## Consequences

- Positive: single public origin; backend testable with Supertest.
- Accepted trade-offs: changing `API_INTERNAL_URL` requires a web rebuild; the
  web uses a small custom Node server around Next; per-IP limits are correct
  only when the trusted chain (`TRUSTED_PROXIES`, `WEB_TRUSTED_PROXIES`) matches
  the real network.
- Follow-up work: login rate-limit counters are per API process; a shared
  store is needed before running several API instances.

## Compliance and verification

`pnpm test:e2e` runs the compiled API and `next start` together and exercises
the rewrite (`apps/web/e2e/agency-acceptance.spec.ts`,
`security-boundaries.spec.ts`); `pnpm test:integration` covers API behavior;
`pnpm check:architecture` rejects direct cross-app imports.

## Supersedes / superseded by

None.
