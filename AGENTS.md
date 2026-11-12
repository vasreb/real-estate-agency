# Project Instructions

This repository uses TypeScript, Node.js 24 LTS, and pnpm 10.28.2.

This is an architecture skeleton, not an implemented application. The product
specification is `docs/agency-base-spec.md`. The selected architecture uses a
separate Fastify API. The stack below is planned, not installed application
dependencies.

## Stack

- `apps/web`: Next.js 16 App Router, React 19, TanStack Query, Tailwind CSS 4,
  shadcn/ui, React Hook Form + Zod 4, Vitest 4, Playwright 1; Feature-Sliced
  Design (FSD).
- `apps/api`: Fastify, Prisma 7 / PostgreSQL 18, Pino, Zod 4, Jest 30 + Supertest.
- Shared packages: `packages/contracts` for API contracts and `packages/ui`
  for shared UI primitives.
- Tooling: TypeScript 5.9, ESLint 10 flat config, Prettier 3, Husky 9,
  lint-staged, and commitlint with Conventional Commits.

Read the lockfile and package manifests before relying on version-specific APIs.

## References

- Follow the nearest scoped `AGENTS.md`.
- Architecture: `docs/architecture/`.
- Product behavior: `docs/agency-base-spec.md`.
- Read only task-relevant documents; repository code and approved contracts
  outrank external examples.

## Architecture

- Respect module boundaries; run the documented architecture check after
  structural or import changes.
- Use one approved API/schema source; do not hand-edit generated code.
- Keep business logic outside presentation layers; reuse existing components
  and patterns; avoid unrelated refactoring.
- Use scoped file ownership for parallel work; one owner integrates changes.

## Git

- Check the working tree before edits and preserve unrelated work.
- Use short-lived, clearly scoped branches and isolated worktrees for
  overlapping changes where appropriate.
- Follow the repository's commit convention.
- Do not stage unrelated files, rewrite history, commit, or push without
  authorization.

## Verification

- Run the repository's lint, typecheck, architecture checks, and relevant tests.
- Hooks are fast feedback, not a substitute for CI or tests.
- Report actual commands and results; never claim checks passed unless they ran.

## Agent workflow

For architectural or cross-module changes, identify the owning capability,
public API, callers, contracts, acceptance criteria, and tests before editing.
Read only task-relevant references. Record material assumptions and costly to
reverse decisions. Keep changes scoped, update boundary tests when rules change,
and report any behavior that remains unverified.
