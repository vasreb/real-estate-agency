# Architecture Reference Library

This is a navigation index, not a mandatory reading list. The two stack
profiles below are required by this template; consult only the references
relevant to a task.

Required stack profiles adapted from the source repository:

- [Fastify + Prisma 7 + PostgreSQL 18 backend](backend-fastify-prisma.md)
- [Next.js 16 + React 19 + FSD frontend](frontend-next-fsd.md)

Keep these technologies in projects created from this template. Update pinned
versions only through an explicit stack decision.

## How agents should use references

1. Identify the concrete design or implementation question.
2. Read local instructions, contracts, and neighboring code first.
3. Open only the smallest number of relevant references, preferring official
   documentation.
4. Match the source to the installed version.
5. Record consequential decisions in an ADR.
6. Verify the result with local tests and architecture checks; a reference link
   is not evidence that code works.

## Reference index

| Topic/trigger                | Required reference source                                     | Local check                            |
| ---------------------------- | ------------------------------------------------------------- | -------------------------------------- |
| TypeScript / Node.js APIs    | TypeScript and Node.js official documentation                 | Typecheck: TODO                        |
| Next.js / React / FSD        | `frontend-next-fsd.md` and version-matched official docs      | Lint/typecheck/tests: TODO             |
| Fastify / Prisma             | `backend-fastify-prisma.md` and version-matched official docs | Lint/typecheck/integration tests: TODO |
| API schema and compatibility | OpenAPI spec and `packages/contracts/`                        | Generation/drift check: TODO           |
| Dependency-boundary tooling  | `eslint.config.mjs` and dependency-cruiser docs               | `pnpm check:architecture`              |
| Unit and browser automation  | Vitest, Jest/Supertest, and Playwright docs                   | `pnpm test` / E2E: TODO                |
| Security-sensitive behavior  | Official framework/database security guidance                 | Security tests: TODO                   |

Community repositories may illustrate a pattern but do not override project
contracts, installed versions, or security requirements.
