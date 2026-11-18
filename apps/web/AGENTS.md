# Frontend Agent Instructions

Scope: `apps/web/`. Root `AGENTS.md` applies too. Required stack: Next.js 16
App Router, React 19, TanStack Query, Tailwind CSS 4, shadcn/ui, React Hook
Form + Zod 4, Vitest 4, and Playwright 1.

## Rendering decision

- For each new route, determine whether server rendering is required before
  selecting or implementing a rendering strategy. Do not silently choose SSR,
  SSG, ISR, or CSR when the decision affects product behavior or data fetching.
- Record the decision in the feature specification or route metadata.
- When server rendering is selected, prefer the framework's native server
  component/rendering model and keep client-side interactive areas small.
- If the chosen strategy cannot satisfy the requirements, explain the blocker
  and resolve the architecture before switching rendering approaches.
- Do not change rendering or data-fetching policy for unrelated existing pages.

## FSD — strict boundaries, pragmatic extraction

- `apps/web/app/` is the thin Next.js App Router entry (route segments,
  layouts, loading/error boundaries). Keep actual screen implementation in
  `apps/web/src/_pages/`, and application providers/init in
  `apps/web/src/_app/`.
- FSD layers: `_app` > `_pages` > `widgets` > `features` > `entities` >
  `shared`. Imports may depend only on lower layers; separate slices on the
  same layer may not import each other's internals.
- Use a slice's public API (`index.ts`) when crossing slice boundaries. Use
  relative imports within a slice.
- Do not manufacture FSD slices or layers for one-off components or anticipated
  future reuse. Keep simple local UI/state close to its parent until a genuine
  business responsibility or reusable feature warrants extraction.
- A `widgets` layer is optional; it is not a mandatory destination for every
  composite component.
- Keep presentational UI free of nontrivial business rules and unrelated
  network orchestration. Split large components by responsibility, not
  arbitrary line counts.
- Respect server/client module boundaries. Never pass secrets or server-only
  dependencies through client exports.

## Data and state

- Use typed API contracts/generated clients from the approved contract
  package; never invent incompatible DTOs or edit generated files manually.
- TanStack Query owns interactive server state: use stable query keys
  (including filters/identity), deliberate `staleTime`, targeted invalidation
  after mutations, and coherent loading/error handling.
- Avoid manual `fetch` in effects and duplicating query cache data into
  unrelated global/local state without a reason.
- For user-approved server rendering, assess server fetching/prefetch and
  hydration only where useful and compatible with the framework's server
  component model. Do not introduce it on unapproved pages.
- Prefer derived values and event handlers over avoidable effects; effects
  synchronize with external systems.

## UI and forms

- Reuse existing UI primitives and design-system compositions before
  introducing new ones. Follow the project's theme tokens rather than
  arbitrary colors, spacing, or typography.
- Implement relevant loading, empty, error, success, and disabled states;
  responsive layouts, semantic controls, keyboard access, visible focus, and
  accessible dialogs.
- Use React Hook Form + Zod 4 for nontrivial forms, with typed schemas,
  validation, and field errors. Keep trivial controlled inputs simple where
  appropriate.
- Treat design references as visual guidance, not as architectural authority.
  Do not copy generated application architecture or mock/no-op behavior.

## Tests and verification

- Use Vitest 4 + Testing Library for important UI behavior and logic; use
  Playwright 1 for critical user journeys.
- Test visible behavior rather than private implementation details.
- Use approved screenshots/baselines for visual regression when appropriate.
- Run the project's existing relevant lint, typecheck, architecture checks,
  and focused tests. Use browser automation for impacted critical user
  journeys; report precisely what ran and what did not.

## References

- Frontend reference library:
  `docs/architecture/references/frontend-next-fsd.md`.
- For framework APIs, prefer version-matched installed documentation when
  available; otherwise consult the official documentation for the installed
  major version.
- Follow root `AGENTS.md`. Local architecture/contracts and the recorded page
  rendering decision outweigh external examples.

## Framework-generated instructions

Some frameworks generate or update agent guidance files. Before removing or
editing generated sections, verify their source and whether the framework will
recreate them. Prefer the installed version's bundled documentation when the
framework provides it.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
