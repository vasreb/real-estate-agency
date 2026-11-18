# Synthetic agency archive and isolated database

The English Northbridge & Vale archive is **loaded**, including original file
bytes, in the task-owned PostgreSQL 18 database `agency_demo_archive` on
`127.0.0.1:55433`. Existing development/test databases and the application's
connection configuration were not changed.

> **Update 2026-11-18:** the database now runs in the container
> `agency-archive-demo-pgvector` (`pgvector/pgvector:pg18-trixie`, same port,
> roles and passwords as before). It was restored from a dump taken from the
> original container and carries the RAG tables, with all 2,400 documents
> indexed (7,345 chunks). The original container was removed; its data volume
> `agency-archive-demo-4ec9f2fd810d-data` is kept as a backup.

## Inspect the loaded data without exporting credentials

The current owned container is recorded in
`.omo/evidence/realistic-agency-archive/task-17-target.json`. For this execution:

```powershell
docker exec agency-archive-demo-pgvector psql -X --username agency_archive --dbname agency_demo_archive --command "SELECT count(*) FROM documents;"
```

This runs a read-only query over local container access. Do not inspect/copy the
container environment or print passwords to obtain an application connection.

Verified counts:

| Entity                                   |                                       Count |
| ---------------------------------------- | ------------------------------------------: |
| Teams / users / memberships              |                                 3 / 10 / 13 |
| Instructing clients / properties / deals |                               80 / 96 / 120 |
| Originals                                |                                       2,400 |
| PDF / DOCX                               |                                 2,160 / 240 |
| Amendments                               | 240 (238 linked, two explicitly unresolved) |
| Amendment signed / draft / unknown       |                               210 / 20 / 10 |

All 2,400 original database byte sequences and actual application API downloads
match the generated originals. A complete rerun performs zero writes, including
zero credential changes. An injected import fault rolled back all entity and
document tables. See `task-16-import.json`, `task-17-rollback.json` and
`task-17-import-verification.json` in the evidence directory.

All 2,400 originals also pass actual production POST upload validation and
byte-exact GET download in a separate scratch database. Member mutation (403),
referenced-parent deletion (409) and cross-deal parent refusal (400) are checked
there without main corpus mutations. Receipt: `task-17-upload-parity.json`.

## Credentials and application presentation

The initial isolated harness generated ten ephemeral account passwords in its
process and proved actual logins. **Those inputs were not retained or exported.**
The shareable archive contains only public user IDs/emails, never password hashes
or sessions. Existing credentials are never rotated by a rerun.

This database loading is not a claim that an already-running development web app
has switched to it. No root `.env` was loaded or edited. Interactive application
connection/account setup must be an explicit separate operation with intended
process-only credentials; do not recover secrets from container inspection or
silently reset the tested accounts. The API checks used the unchanged real
application composition root and routes, not a mock database or fabricated API.

With explicit additional user approval, a temporary SELECT-only PostgreSQL role
and one scoped QA session were used to browse the actual main archive. All 120
deals and 2,400 displayed document rows were checked, with byte-exact browser
downloads covering all 48 families. The temporary session/role were removed;
existing password hashes and session rows were preserved. This was a declared
authenticated QA fixture, not a claim that lost passwords were recovered or that
a persistent development application was switched to this database.

## Offline generation and verification

Commands run from the execution worktree root. Output directories must be fresh;
the tooling refuses overwrites and linked/escaping paths. The approved plan is
immutable; execution acceptance is recorded separately.

```powershell
pnpm --filter @agency/api exec tsx prisma/demo-archive/cli.ts inspect
pnpm --filter @agency/api exec tsx prisma/demo-archive/cli.ts build --output out/agency-demo-archive/v1
pnpm --filter @agency/api exec tsx prisma/demo-archive/cli.ts validate --input out/agency-demo-archive/v1
```

The existing `v1` directory will correctly cause a new build to refuse. Use a
fresh named owned output for reproduction, not a deletion/reset of unknown work.
Full generation requires a digest-matched representative review. Help, inspect,
plan and invocation-only build dry-run do not open a database.

The ZIP is an **intermediate pinned import transport**, not the user's end goal.
Its externally recorded SHA-256 is
`06dfe93c096d00f66853aa2f9d391378fe789e2e9bcfe106ec1db366763f8d83`.

```powershell
pnpm --filter @agency/api exec tsx prisma/demo-archive/cli.ts import --input out/agency-demo-archive-v1.zip --expected-sha256 06dfe93c096d00f66853aa2f9d391378fe789e2e9bcfe106ec1db366763f8d83 --dry-run
```

That is offline preflight only: zero DB calls and no claim to check database
conflicts. It requires an externally supplied expected digest, safe bounded ZIP
structure, canonical public metadata, exact file set/checksums and original bytes.
Checksums are integrity checks under the external pin, **not signatures or proof
of receipt authenticity**.

## Writing import safeguards

The writing form adds `--confirm agency_demo_archive`. Before connecting it also
requires explicit process environment inputs: the exact local `DATABASE_URL`,
`DEMO_ARCHIVE_CONTAINER`, `DEMO_ARCHIVE_APP_OFFLINE=true`, and
`DEMO_ARCHIVE_PASSWORD_01` through `_10` (at least twelve characters each).
Never put them into tracked files, logs, evidence or the ZIP.

The target must have the expected task label and PostgreSQL 18 image, a verified
loopback-only port mapping, and measured DB/WAL headroom. Production, remote
hosts, ordinary development databases and unexpected ports/roles always reject.
Prepare originals and password hashes before the write transaction. Stop the
demo application for offline import; racing application writes are unsupported.

The importer takes a corpus-specific transaction advisory lock, compares all
expected existing fields and bytes, inserts in dependency order, and commits
atomically. Exact partial rows can be completed. Any identity/email, metadata,
membership, original-byte or extra corpus-deal document conflict aborts; it does
not repair, update, delete, rotate credentials or touch sessions. Budgets are
300 seconds for the transaction and ten seconds for lock wait.

**Never run baseline `db:seed`, `db:test:prepare`, `db push`, `migrate reset`, DROP
or TRUNCATE against this database.** There is no automatic cleanup/reset command.
The fresh provisioning harness refuses an occupied port rather than replacing a
running service or reusing its volume. Do not rerun it against the now-occupied
55433 expecting it to reset anything. Existing baseline integration/E2E require
their separately guarded `agency_test` target on 55434.

## Existing-field mapping

`entities/*.json` maps only teams (id/name), users (id/email), memberships
(team_id/user_id/role), clients (id/name), properties (id/address) and deals
(id/number/type/client_id/property_id/team_id). Each document's `mapped` object
contains existing metadata columns; its original bytes map to `file_data`.
Date-only values are UTC date columns; `created_at` is deterministic historical
ingestion, not signature date. Rich property profiles, stages, actors,
signatories, sources and logical revisions remain manifest/generator data.

## Final checks and limitations

Every document is synthetic and **not for execution**. Signed means a simulated
signature marker, not real signature/identity verification. No licensed official
forms, valid bank instructions or copied personal data are supplied. Source and
delivery summaries are not a legally complete statutory service pack.

All 3,856 delivered PDF pages were independently parsed and rasterised. DOCX
packages, content, tables and relationships were checked. **Native Microsoft
Word/LibreOffice pagination, fonts and layout remain unverified.** The existing
Russian interface is intentionally unchanged; archive data is English.

Database import, all-original production uploads/downloads, all-deal main browser
checks, two byte-identical independent builds and measured resource budgets pass.
Lint, formatting, all-workspace typecheck/unit tests, architecture, contracts and
the separate baseline integration/E2E checks pass. The user-approved Husky repair
is limited to `tooling/prepare.mjs` and its hermetic worktree/no-Git test; it does
not alter Git configuration or weaken application assertions.

Recheck existing built artifacts (does not reset a database):

```powershell
pnpm exec node tooling/demo-archive/release.mjs --self-test
pnpm exec node tooling/demo-archive/release.mjs --verify-two-builds --evidence .omo/evidence/realistic-agency-archive/task-19-happy.json
python tooling/demo-archive/audit_release.py
```

The browser harness `pnpm exec node tooling/demo-archive/browser.mjs --suite browse`
requires the separate explicit temporary-access approval recorded in this
execution; it creates/removes only its own QA access and leaves corpus data and
existing passwords/sessions intact. Its short-lived web/API processes are closed
after verification. No long-running application configuration or root `.env` is
changed. Final agent review receipts are under
`.omo/evidence/realistic-agency-archive/final-F1.json`, `final-F2.json`,
`final-F3.md` and `final-F4.json`; technical verification is distinct from the
owner's formal acceptance. Native Office layout remains unverified, not waived.

## Image-only (scanned) originals

Eight deals (241 archive documents) and the South team seed contract are stored as
image-only PDFs, not text PDFs. The database was updated accordingly. See
[scanned-originals](demo-archive-scanned.md) for the list, selection rule, method
and known validator consequences.
