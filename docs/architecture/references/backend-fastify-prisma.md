# Backend Reference Library — Fastify / Prisma 7 / PostgreSQL 18

Use version-matched official documentation alongside local contracts and tests.
The backend is planned; its dependencies and implementation are not installed yet.

| Topic                         | Reference                                                                                                                                                     | Project guidance                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Application composition       | [Fastify plugins](https://fastify.dev/docs/latest/Reference/Plugins/)                                                                                         | Register feature plugins explicitly; understand encapsulation and dependency ownership. |
| HTTP endpoints and validation | [Fastify routes](https://fastify.dev/docs/latest/Reference/Routes/) and [validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) | Define request and response contracts and integrate Zod explicitly.                     |
| Error handling                | [Fastify errors](https://fastify.dev/docs/latest/Reference/Errors/)                                                                                           | Map errors consistently without exposing internals.                                     |
| Logging                       | [Fastify logging](https://fastify.dev/docs/latest/Reference/Logging/)                                                                                         | Use structured logging and exclude secrets and personal data.                           |
| Testing                       | [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/)                                                                                            | Use isolated request tests and database integration tests where appropriate.            |
| Persistence                   | [Prisma documentation](https://www.prisma.io/docs/)                                                                                                           | Manage client lifecycle, review migrations and test with a disposable database.         |
| Database constraints          | [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)                                                                        | Enforce critical invariants in the database where possible.                             |

Always enforce resource authorization server-side, verify tenant isolation, and
keep business rules independent of Fastify and Prisma.
