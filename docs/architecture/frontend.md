# Frontend Architecture

This template requires the stack below. Record target-project routes, aliases,
shared package ownership, and rendering decisions without replacing the
framework or architectural methodology.

## Application shape

- Framework/runtime: Next.js 16 App Router and React 19.
- Data fetching/cache: TanStack Query.
- Styling/components: Tailwind CSS 4 and shadcn/ui.
- Forms/schemas: React Hook Form and Zod 4.
- Tests: Vitest 4 and Playwright 1.
- Route entries: `apps/web/app/`.
- Screen implementations: `apps/web/src/_pages/`.
- Application providers/init: `apps/web/src/_app/`.
- Shared contracts and UI: `packages/contracts/` and `packages/ui/`.
- Alias: `@/*` resolves to `apps/web/src/*`.
- Routes (`apps/web/app/`, thin): `/login`, `/deals`, `/deals/[id]`,
  `not-found.tsx`; `/` redirects to `/deals`.
- Slices: `src/_app/{providers,shell}`, `src/_pages/{login,deals,deal-detail}`,
  `src/widgets/app-header`, `src/features/{auth,documents}`,
  `src/entities/{deal,document}`, `src/shared/{api,lib}`.
- API client: `openapi-fetch` in `src/shared/api/client.ts`, typed from
  `@agency/contracts` ([ADR-0005](decisions/0005-single-contract-source.md)).

## Code organization

Required approach: Feature-Sliced Design (FSD). Dependency direction:
`_app` > `_pages` > `widgets` > `features` > `entities` > `shared`.
`widgets` is optional. Record aliases and public API conventions in the
repository instructions. Keep one-off logic local and do not create speculative
slices.

## State ownership

| State type           | Source of truth  | Location/library                                                                   | Cache/invalidation policy                                                                                                                |
| -------------------- | ---------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Server state         | API (PostgreSQL) | TanStack Query, keys `["deals"]`, `["deal", id]`                                   | `staleTime` 0, no persistence; 4xx not retried; 401 cancels queries, clears the cache and goes to `/login`; login/logout clear the cache |
| URL/navigation state | Route params     | Next.js router (`/deals/[id]`)                                                     | No filters, search or pagination (spec)                                                                                                  |
| Form state           | React Hook Form  | `loginSchema` from contracts; `documentFormSchema` in `features/documents` (Zod 4) | Local to the form                                                                                                                        |
| Ephemeral UI state   | Component        | Local `useState` (upload panel open, editing id, dialog open)                      | Discarded with the component                                                                                                             |

## Rendering, caching, and runtime boundaries

Decision: [ADR-0004](decisions/0004-dynamic-server-gates-with-client-query.md).

- `/login`: server shell with a client form.
- `/deals` and `/deals/[id]`: `force-dynamic` server gates in
  `src/shared/api/server.ts` (server-only, `cache: "no-store"`, forwards only
  the `agency_session` cookie). 401 calls `redirect('/login')`; 400/404 call
  `notFound()` before any output, yielding a real HTTP 404. The gate result
  seeds client components through TanStack Query `initialData`.
- No `loading.tsx` or Suspense boundary is placed above the gates.

Record route-specific rendering decisions where they materially affect
indexability, latency, authentication, caching, or data exposure. Respect
server/client boundaries and keep secrets out of client bundles.

## UI and accessibility

Document the design-system source, responsive expectations, keyboard/focus
behavior, semantic control conventions, and visual verification approach.
