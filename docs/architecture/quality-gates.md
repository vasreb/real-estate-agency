# Architecture and Quality Gates

Architectural rules are useful only when their important parts can be checked.
Use the same package scripts locally and in CI.

## Bundled enforcement for the required stack

The template includes the following executable checks:

- `eslint.config.mjs` applies TypeScript, Next.js, FSD, and backend boundary
  lint rules.
- `tooling/eslint-architecture-plugin.mjs` rejects backend deep imports,
  domain-to-infrastructure/framework dependencies, and direct cross-app imports.
- `tooling/test-architecture.mjs` checks forbidden and allowed imports with
  temporary fixtures and verifies cycle detection.
- `.dependency-cruiser.cjs` rejects circular dependencies.
- Root `package.json` defines `pnpm check:architecture`, the aggregate
  `pnpm check`, and the full `pnpm verify`.

The architecture fixtures prove these rules on representative code shapes.
They do not replace application-specific authorization, data-integrity, or
behavior tests.

## Recommended layers of enforcement

1. **Type system:** strict compiler settings and generated contract types.
2. **Lint rules:** dependency direction, public API use, forbidden imports, and
   framework-specific constraints.
3. **Dependency graph:** cycles and prohibited module/layer edges.
4. **Architecture fixtures:** deliberately illegal examples must fail; valid
   examples must pass.
5. **Behavior tests:** unit, integration, contract, database, and end-to-end
   tests for actual behavior and invariants.
6. **CI:** runs the repository's documented scripts on pull requests and
   protected branches.
7. **Review:** verifies ownership, security, compatibility, migration, and
   operational implications that tools cannot prove.

## Check matrix

| Rule/invariant                   | Automated check                                  | Positive case              | Negative case                     | CI command                               |
| -------------------------------- | ------------------------------------------------ | -------------------------- | --------------------------------- | ---------------------------------------- |
| No module cycles                 | dependency-cruiser                               | acyclic graph              | circular fixture                  | `pnpm check:architecture`                |
| Public API only                  | ESLint architecture rule                         | module index import        | cross-feature deep import         | `pnpm check:architecture`                |
| Layer dependency direction       | FSD and boundary lint                            | lower-layer import         | upward/same-layer private import  | `pnpm check:architecture`                |
| Domain/framework isolation       | ESLint architecture rule                         | pure domain import         | framework/ORM import              | `pnpm check:architecture`                |
| Contract generation is stable    | `packages/contracts/scripts/generate.ts --check` | generated output unchanged | temp-dir drift fixture fails      | `pnpm contracts:check`                   |
| Team isolation / 404 for foreign | API integration + E2E                            | own team 200               | foreign deal/document 404         | `pnpm test:integration`, `pnpm test:e2e` |
| Parent link and delete integrity | PostgreSQL constraints + races                   | same-deal contract link    | foreign/self parent, RESTRICT 409 | `pnpm test:integration`                  |
| Upload bounds through the proxy  | API + E2E boundary suites                        | 25 000 000-byte PDF 201    | +1 byte / chunked 413, fake 415   | `pnpm test:e2e`                          |

## Negative-control policy

For each important import restriction, include a fixture or isolated test that
proves an illegal dependency is rejected. Also include at least one valid
dependency so a misconfigured rule that rejects everything cannot pass.

Fixtures must be temporary or isolated from production source. They must be
cleaned up even when the test fails.

## CI parity

CI should invoke the same package-manager scripts developers use locally. Avoid
hidden validation commands that have no local equivalent. Report configured
gates separately from checks actually executed for a change.

## Feature verification

For each feature, select relevant checks rather than blindly running every
expensive suite after every edit. Critical boundaries still require integration
or end-to-end evidence at the appropriate milestone.

## Commands in this repository

| Command                 | What it runs                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `pnpm check`            | lint, format:check, typecheck, check:architecture, contracts:check, test:unit         |
| `pnpm test:integration` | `db:test:prepare` (guarded reset of `agency_test`) + API Jest integration suites      |
| `pnpm test:e2e`         | production builds, test DB prepare, compiled API + `next start`, Playwright, teardown |
| `pnpm verify`           | `db:validate` + `check` + `test:integration` + `test:e2e`; CI runs exactly this       |

Local hooks (Husky, only when a Git repository exists): `pre-commit` runs
`lint-staged` (Prettier + ESLint on staged files); `commit-msg` runs
commitlint with Conventional Commits. Hooks are fast feedback, not a
substitute for `pnpm verify`. CI: `.github/workflows/ci.yml` (Node 24,
pnpm 10.28.2, PostgreSQL 18 services, frozen lockfile, Chromium, `pnpm verify`,
Playwright artifacts on failure). A configured workflow is not evidence of a
passing remote run.
