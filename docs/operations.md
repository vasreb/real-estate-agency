# Operations runbook

This repository contains packaging and procedures only. Nothing here performs
a real deployment, and no paid external service is required.

## Topology

- One external origin: the Next.js server (`web`, port 3000) is the only
  published service. Browsers call relative `/api/...` URLs; Next rewrites
  them to the internal Fastify API.
- `api` (Fastify, port 3001) and `postgres` (PostgreSQL 18) are reachable only
  on the internal Compose network (`compose.production.yaml` resets their
  published ports).
- Originals are stored in PostgreSQL `bytea` together with their metadata; there
  is no object storage.

## Configuration

| Variable              | Where        | Notes                                                                                                                                                                                       |
| --------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_ORIGIN`       | api          | Exact external origin, e.g. `https://agency.example`. Unsafe requests (incl. login/logout) must send this exact `Origin`, else 403. With `https:` the session cookie gets `Secure`.         |
| `DATABASE_URL`        | api, migrate | PostgreSQL URL. Never point tests or seeds at it.                                                                                                                                           |
| `API_INTERNAL_URL`    | web (build)  | Baked into the `/api` rewrites at `next build` time (`routes-manifest.json`). Build the web image with the production value (`http://api:3001` in Compose); changing it requires a rebuild. |
| `SESSION_TTL_SECONDS` | api          | Fixed session lifetime, default 28 800 (8 h), no sliding extension.                                                                                                                         |
| `LOG_LEVEL`           | api          | Pino level. Logs never contain cookies, tokens, passwords, bodies or file bytes (also at `trace`, where `@fastify/multipart` logs request headers — they are redacted).                     |
| `POSTGRES_PASSWORD`   | postgres     | Choose a strong secret; there are no default production credentials.                                                                                                                        |
| `SEED_*_PASSWORD`     | dev only     | Development seed only. The seed refuses `NODE_ENV=production` / `APP_ENV=production`.                                                                                                       |
| `TEST_DATABASE_URL`   | tests only   | Must be `…/agency_test` on a local/test host and differ from `DATABASE_URL`; resets are refused otherwise.                                                                                  |

### Assistant and indexing worker

| Variable            | Where       | Notes                                                                                                                                                         |
| ------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | api         | Claude API key. Without both keys the `/api/chat` route is absent (404).                                                                                      |
| `VOYAGE_API_KEY`    | api, worker | Voyage AI key for query and document embeddings (ADR-0009). Document text is sent to the provider.                                                            |
| `ASSISTANT_MODEL`   | api         | Default `claude-haiku-5-5`; change it without touching the index. `ASSISTANT_MAX_STEPS` (20, the maximum) and `ASSISTANT_REQUESTS_PER_MINUTE` (20) bound use. |
| `EMBEDDING_MODEL`   | api, worker | Default `voyage-4`; `EMBEDDING_DIMENSIONS` must be 1024 to match `document_chunks.embedding`. A model change needs a re-index.                                |
| `OCR_LANGUAGES`     | worker      | Tesseract languages, default `eng` (the image also has `rus`; for example `eng+rus`).                                                                         |
| `WORKER_*`          | worker      | Poll interval, stale-job timeout, attempts and backoff; defaults are in `apps/api/src/infrastructure/worker-config.ts`.                                       |

Indexing runs in a separate container built from `apps/api/Dockerfile.worker`
(ADR-0008). PostgreSQL must be the `pgvector/pgvector:pg18-trixie` image
(ADR-0006). It is built on the same Debian release (13, glibc 2.41) as
`postgres:18`, so an existing `postgres:18` volume can be reused. Do not use
the plain `pgvector/pgvector:pg18` tag on such a volume: it is built on Debian
12 (glibc 2.36), and PostgreSQL reports a collation version mismatch (and text
indexes may be ordered wrongly) until `ALTER DATABASE ... REFRESH COLLATION
VERSION` and `REINDEX DATABASE` are run.

```bash
docker compose -f compose.yaml -f compose.production.yaml build worker
docker compose -f compose.yaml -f compose.production.yaml run --rm migrate
docker compose -f compose.yaml -f compose.production.yaml up -d worker
# queue every document that is not indexed yet, then exit
docker compose -f compose.yaml -f compose.production.yaml run --rm worker node apps/api/dist/worker.js --backfill
```

Failed documents show their reason on `/admin/documents` and can be re-queued
there. The reference-question run (`apps/api/src/eval.ts`, spec section 7)
needs the same keys and prints the five report sections. Reference questions
for the synthetic archive are in `docs/rag-eval/archive-questions.json`; the
file schema is `evalQuestionSchema`.

## Streamed answers

The assistant answers over `POST /api/chat/stream` as newline-delimited JSON
(`application/x-ndjson`): `status`, `delta` (provisional text), `reset`
(discard the provisional text), `final` (the checked answer with citations) and
`error`. The event schema is `chatStreamEventSchema` in `@agency/contracts`.
`POST /api/chat` returns the same answer as one JSON document and stays for
evaluation and scripts.

- Access, validation and rate limits are checked before the first byte, so
  they are ordinary HTTP errors (401, 404, 429); only later failures arrive as
  an `error` event, without provider details.
- A closed tab aborts the model request, so it stops costing money.
- The API sends `Cache-Control: private, no-store, no-transform` and
  `X-Accel-Buffering: no`. The Next rewrite passes the stream through
  unbuffered. Any proxy or TLS edge in front of the web server must not buffer
  or compress `/api/chat/stream` (nginx: `proxy_buffering off;`), otherwise the
  answer appears all at once at the end.

## Size of the model context

A search over a whole team can touch many deals. To keep one answer small
(measured with the Anthropic token counter, one `search_documents` result fell
from about 20 000 to about 9 000 tokens):

- Only the 8 best passages are returned, and amendments are expanded for the 4
  best-ranked contracts of a search.
- Every amendment is still listed with its status, dates and link, but only
  the 4 closest bring text (2 passages each). The others carry a short extract
  and `text_not_included`; the model reads one in full with `search_documents`
  and its `document_id` before relying on it.
- "Closest" uses three signals per passage of an amendment (`matched_by` in
  the result): similarity to the question; similarity to the contract passages
  the search found (stored embeddings, no extra embedding call), which finds
  the amendment that rewrites a clause even when the question is worded
  differently; and a citation of that clause's number ("clause 4.2", "section
  4.2", "paragraph 4.2", "article 4.2"), which ranks above any similarity. If
  the question matched only amendments, the contract passages closest to the
  question serve as the clause.
- When a request grows past 60 000 tokens, older search results of the same
  question are replaced by a short note (only the newest stays whole).
- Hard stops: `ASSISTANT_MAX_STEPS` (20) steps, and a single request over
  150 000 tokens ends the answer with a message that says which limit it was.

## Security-relevant behavior

- Cookie `agency_session`: host-only, `Path=/`, `HttpOnly`, `SameSite=Lax`,
  `Secure` when `PUBLIC_ORIGIN` is HTTPS; only a SHA-256 hash of the token is
  stored. Roles are read from `team_members` on every request.
- Authenticated responses carry `Cache-Control: private, no-store`; downloads
  add `X-Content-Type-Options: nosniff` and an `attachment` disposition.
- Login throttling is in memory per API instance: 10 attempts per IP+email and
  100 per IP within 15 minutes, at most 10 000 tracked keys (new keys get 429 at
  capacity). The counters live in each API process: running several API
  instances multiplies the effective limit and they do not share lockouts.
- Client IP for those limits comes from an explicit trusted chain, never from
  unconditional `trustProxy`:
  - Next's `/api` rewrites pass `X-Forwarded-For` through verbatim and do not
    add the peer address (verified against the built image), so Next alone is
    not a trustworthy hop. The web server is therefore `apps/web/server.mjs`:
    it replaces any client-supplied `X-Forwarded-For` with the real peer
    address, or — only when the peer is listed in `WEB_TRUSTED_PROXIES` (your
    TLS edge) — keeps the edge's chain and appends the edge address.
  - The API trusts forwarded addresses only from `TRUSTED_PROXIES` (IPs/CIDRs;
    catch-all ranges are rejected at startup). With an empty list the socket
    address is used, which is safe but makes every user behind one proxy share
    the per-IP budget.
  - Compose: `web` has the fixed internal address `172.30.0.10` and the API sets
    `TRUSTED_PROXIES=172.30.0.10`. If a TLS edge proxy fronts `web`, it must
    append the client address to `X-Forwarded-For` and its address as seen by
    `web` goes into `WEB_TRUSTED_PROXIES`. Without such an edge, publish `web`
    so that it sees real client addresses (Docker's userland proxy rewrites the
    source to the gateway address, which again collapses all users into one
    bucket).
  - `web` must not be reachable except through that edge, and the API must not
    be reachable except from `web`; otherwise forged headers could enter the
    trusted chain.
- Uploads: one PDF or DOCX per request, ≤ 25 000 000 bytes, request
  ≤ 26 000 000 bytes, at most two concurrent uploads per API instance (excess:
  429). Content is validated structurally (PDF in a worker with a heap cap and
  a 5 s timeout; DOCX as a bounded ZIP). This is not an antivirus.
- Next buffers proxied request bodies up to
  `experimental.proxyClientMaxBodySize` (set to 27 000 000 bytes in
  `apps/web/next.config.ts`). Keep it above the API request limit, otherwise
  large uploads are truncated by the proxy and hang until a timeout.

## Build and start

```bash
docker compose -f compose.yaml -f compose.production.yaml build api web
```

```bash
docker compose -f compose.yaml -f compose.production.yaml up -d postgres
```

```bash
docker compose -f compose.yaml -f compose.production.yaml run --rm migrate
```

```bash
docker compose -f compose.yaml -f compose.production.yaml up -d api web
```

Migrations are an explicit step (`prisma migrate deploy`); the API never
migrates or resets the database on startup. Terminate TLS in front of `web`
and publish only that port (`WEB_PUBLISH`, default `127.0.0.1:3000`).

Reference data (users, teams, members, clients, properties, deals) is created
only by the seed script; there is no admin CRUD. For a real environment,
prepare a reviewed, environment-specific data load instead of the development
seed.

## Backup and restore

Backups are logical dumps in custom format; `bytea` originals are included.

```bash
docker compose exec -T postgres pg_dump -U agency -Fc agency > agency-$(date +%F).dump
```

Restore into a new, empty database and verify before switching traffic:

```bash
docker compose exec -T postgres createdb -U agency agency_restore
```

```bash
docker compose exec -T postgres pg_restore -U agency -d agency_restore --no-owner --exit-on-error < agency-YYYY-MM-DD.dump
```

Verify that `SELECT id, encode(sha256(file_data),'hex'), parent_document_id
FROM documents ORDER BY id` is identical in the source and the restored
database. Never restore over the live database, and never remove the
`agency-data` volume.

`pnpm test:ops` rehearses exactly this against the disposable test service
(`agency_test` → `agency_test_restore`) and compares every original's hash and
parent link; `pnpm test:ops --negative` proves the refusals (missing
`PUBLIC_ORIGIN`, non-disposable restore targets, production seed).
`pnpm test:ops --build` additionally builds both images.

## Not provided

No SLA, high availability, horizontal scaling of throttling, external
storage, antivirus scanning, or automated deployment.
