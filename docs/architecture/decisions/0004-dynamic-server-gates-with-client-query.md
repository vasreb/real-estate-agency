# ADR-0004: Dynamic server gates with client-side TanStack Query

- Status: Accepted
- Date: 2026-11-12
- Deciders/owner: agency-base implementation
- Related areas: `apps/web` rendering, authentication, caching

## Context

`/deals` and `/deals/[id]` show private data. An unauthenticated user must be
redirected and an unknown or foreign deal must produce a real HTTP 404 before
any response body is streamed. Private data must not be cached by shared
layers.

## Options considered

### Option 1 — Client-only fetching behind a loading shell

- Benefits: simple.
- Costs/risks: status is always 200; a 404 or redirect appears only after
  hydration.

### Option 2 — Fully server-rendered pages

- Benefits: correct status codes.
- Costs/risks: mutations and refreshes still need client state.

### Option 3 — Dynamic server gate, then client components with `initialData`

- Benefits: correct status and redirect, with a client cache for interaction.
- Costs/risks: one extra server-side API call per navigation.

## Decision

Option 3. The two routes are `force-dynamic`. A server-only helper in
`apps/web/src/shared/api/server.ts` calls the API with `cache: "no-store"` and
forwards only the `agency_session` cookie. 401 triggers `redirect('/login')`;
400/404 trigger `notFound()` before any output. There is no `loading.tsx` or
Suspense boundary above the gates. The result seeds TanStack Query via
`initialData`. `/login` is a server shell with a client form.

## Consequences

- Positive: real 404 and redirect; no private caching.
- Accepted trade-offs: no static rendering of these routes.
- Follow-up work: none.

## Compliance and verification

Playwright specs in `apps/web/e2e/` (`pnpm test:e2e`) and Vitest tests in
`apps/web` (`pnpm test:unit`).

## Supersedes / superseded by

None.
