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
