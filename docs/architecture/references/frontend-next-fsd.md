# Frontend Agent Reference Library — Next.js 16 / React 19 / FSD

> **Read by need, not in bulk.** Consult only the relevant rows. Local code,
> approved rendering decisions, repository instructions, and shared API
> contracts are authoritative. External repositories are examples, not rules.
> Verify every reference against the versions installed in the target project.

## How to use

1. Identify the concrete question or implementation risk.
2. Read relevant local code and this project's architectural rules first.
3. Open one or two links matching the task. Prefer official documentation and
   match installed major versions.
4. Apply a specific pattern, then validate with lint/typecheck/tests; document
   important exceptions.
5. For each new route, resolve rendering requirements before settling its
   rendering strategy. If server rendering is approved, prefer Server
   Components where appropriate; ask before changing approach if they cannot
   satisfy the requirements.

## Next.js, rendering, and App Router

| When                                | Reference                                                                                                                              | Apply/check                                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Working on Next.js APIs/routing     | [Next.js guidance for AI coding agents](https://nextjs.org/docs/app/guides/ai-agents)                                                  | Prefer version-matched installed docs where available; do not rely on stale examples.                     |
| Layouts, routes, navigation, errors | [Next.js App Router](https://nextjs.org/docs/app) · [Layouts and pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages) | Keep framework route entries thin when the selected architecture places screens elsewhere.                |
| Approved server rendering           | [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)                               | Favor Server Components where suitable; isolate client interactivity.                                     |
| Hydration/query prefetch            | [TanStack Query: Advanced SSR](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr)                             | Use only with an approved rendering strategy and a concrete reason; check serialization/cache boundaries. |
| Caching and fresh data              | [Next.js caching](https://nextjs.org/docs/app/guides/caching)                                                                          | Distinguish rendering, data caching, and client query caching; record freshness policy.                   |

## Feature-Sliced Design

| When                            | Reference                                                                                                                                     | Apply/check                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| New slice, layer, or dependency | [FSD layers](https://feature-sliced.design/docs/reference/layers) · [FSD public API](https://feature-sliced.design/docs/reference/public-api) | Lower-layer direction, slice isolation, public exports; avoid accidental deep imports. |
| Next.js folder arrangement      | [FSD with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs)                                                                | Keep framework routing separate from FSD app/page layers where needed.                 |
| FSD agent guidance              | [Official FSD skill](https://github.com/feature-sliced/skills)                                                                                | Consult relevant guidance; do not create unnecessary features, entities, or widgets.   |
| Validate imports                | [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries)                                                            | Run local boundary checks and a deliberate forbidden-import test when changing rules.  |

## React, TanStack Query, and API contracts

| When                        | Reference                                                                                                                                                                                                                           | Apply/check                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Effects/state data flow     | [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) · [Managing State](https://react.dev/learn/managing-state)                                                                                     | Derive state during render; use effects for external synchronization.               |
| Query caching and freshness | [TanStack Query: Important Defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)                                                                                                              | Choose `staleTime` intentionally; avoid accidental refetch loops.                   |
| Query keys/filtering        | [Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys) · [Dependent Queries](https://tanstack.com/query/latest/docs/framework/react/guides/dependent-queries)                                       | Key by all request inputs; avoid waterfalls where possible.                         |
| Mutation/cache consistency  | [Invalidations from Mutations](https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations) · [Query Invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation) | Invalidate precise affected keys; do not mirror server state in ad-hoc stores.      |
| Query architecture patterns | [Practical React Query](https://tkdodo.eu/blog/practical-react-query) · [Query Key Factory](https://tkdodo.eu/blog/effective-react-query-keys)                                                                                      | Community patterns; verify against the installed version.                           |
| Generated API clients       | [Orval docs](https://orval.dev/) · [OpenAPI specification](https://spec.openapis.org/oas/latest.html)                                                                                                                               | Source API types from approved contracts; do not manually modify generated outputs. |

## UI design, forms, and accessibility

| When                      | Reference                                                                                                                                                 | Apply/check                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Components and theming    | [shadcn/ui](https://ui.shadcn.com/docs) · [Tailwind theme variables](https://tailwindcss.com/docs/theme/)                                                 | Reuse primitives and tokens; avoid styling drift.                       |
| Form validation           | [React Hook Form](https://react-hook-form.com/) · [Resolvers](https://github.com/react-hook-form/resolvers) · [Zod](https://zod.dev/)                     | Use typed schemas, useful field errors, and correct input/output types. |
| Accessibility             | [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/) · [React DOM common components](https://react.dev/reference/react-dom/components/common) | Prefer semantic HTML; test keyboard and focus behavior.                 |
| Browser-visible UI states | [Testing Library guiding principles](https://testing-library.com/docs/guiding-principles/)                                                                | Test behavior from the user's perspective.                              |

## Testing and browser QA

| When                 | Reference                                                                                                                    | Apply/check                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Unit/component tests | [Vitest](https://vitest.dev/guide/) · [Testing Library React](https://testing-library.com/docs/react-testing-library/intro/) | Test observable behavior and edge states.            |
| E2E journeys         | [Playwright best practices](https://playwright.dev/docs/best-practices)                                                      | Prefer user-visible assertions and stable selectors. |
| Visual regression    | [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots)                                                  | Use reviewed baselines and stable test fixtures.     |

## Validation map

- Layer imports: architecture lint and negative dependency fixtures.
- Rendering strategy: recorded decision per route and checks matching the chosen
  server/client model.
- Query state: tests for correct keys, freshness, and mutation invalidation.
- UI/forms: lint, types, focused component tests, accessibility states, and
  browser automation for critical journeys.
- Design-led work: compare the rendered UI with the approved reference; reading
  generated source alone is not visual verification.

## Real-world repositories — inspiration, not project standards

- [ByteDance DeerFlow frontend AGENTS.md](https://github.com/bytedance/deer-flow/blob/main/frontend/AGENTS.md):
  practical Next/React agent instructions; check which conventions match the
  target codebase.
- [Hasir Dashboard AGENTS.md](https://github.com/protohasir/dashboard/blob/master/AGENTS.md):
  a detailed modern Next/React stack example; do not duplicate its length or
  project-specific details.
- [FSD official agent skill](https://github.com/feature-sliced/skills): use as
  a topical reference.
- [TanStack Query repository](https://github.com/TanStack/query): official
  source and examples; prefer documentation matching the installed release.
