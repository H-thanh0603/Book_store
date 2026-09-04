# Operations runbook — Melio Bookstore

## Deploy

```bash
npm ci
npx prisma migrate deploy     # apply pending migrations
npm run build
npm start                     # serves on :3000
```

Single-node is the default topology: the in-process scheduler (`src/instrumentation.ts`)
seeds nightly jobs and ticks every 5 min per server instance, so on one box nothing
needs coordinating. For ~10x traffic scale out as described in "Multi-instance".

## Multi-instance (~10x traffic)

Reference configs live in the repo root and `deploy/`:

| File | Purpose |
|---|---|
| `ecosystem.config.js` | PM2 cluster mode — N workers sharing port 3000 |
| `deploy/nginx.conf` | Reverse proxy / load balancer, real-IP handling, static caching |
| `deploy/pgbouncer.ini` | Connection pooling when workers × pool nears `max_connections` |

### 1. App instances (PM2 cluster)

```bash
npm run build && pm2 start ecosystem.config.js --env production
pm2 reload bookstore   # zero-downtime rolling restart on deploy
```

Node's cluster module gives every worker one shared listening socket — nginx points
at `127.0.0.1:3000` regardless of worker count. The app stays stateless by design:
sessions, rate-limit buckets, and job leases all live in Postgres.

**Scheduler election:** only the first cluster worker (`NODE_APP_INSTANCE=0`) runs the
in-process scheduler; others log `scheduler_disabled`. Force with
`JOB_SCHEDULER_ENABLED=false` (external cron drives `/api/jobs`) or `=true`.

### 2. Load balancer (nginx)

Use `deploy/nginx.conf`. Non-negotiables:

- Set `X-Real-IP` / `X-Forwarded-For` from `$remote_addr`, and run the app with
  `TRUST_PROXY_HEADERS=true` (see the reverse-proxy contract below).
- Never retry non-idempotent requests across instances (`proxy_next_upstream`
  excludes POST) — a retried checkout would double-create orders.
- Health probes hit `/api/health/live|ready` with `Cache-Control: no-store`.
- Behind Cloudflare, enable the commented `set_real_ip_from` + `real_ip_header
  CF-Connecting-IP` block so rate limiting keys off visitor IPs, not edge IPs.

### 3. Edge caching (CDN)

- `GET /api/storefront` ships `Cache-Control: public, max-age=15, s-maxage=30,
  stale-while-revalidate=60` — Cloudflare caches it keyed on the full query string.
  The response carries no auth/cookies, so no `Vary` surprises beyond encoding.
- `/_next/static/*` is content-hashed and Next.js already serves it
  `public, max-age=31536000, immutable`; nginx re-pins it at the edge (see
  `deploy/nginx.conf`). Do not re-declare Cache-Control under `/_next/*` in
  `next.config.ts` — Next warns that breaks dev behavior.
- Everything else (admin APIs, checkout POST) stays uncacheable; do not enable
  "Cache Everything" page rules beyond `/api/storefront*` and static paths.
- Purge path `/api/storefront*` after catalog-wide edits if instant freshness matters;
  otherwise the ≤30s TTL is the freshness contract.

### 4. Read replica

Set `READ_REPLICA_URL` (and optional `DB_POOL_MAX_READ`). Hot read paths route to
the replica through the guarded client `prismaRead` in `src/lib/db.ts`: storefront
catalog, dashboard, analytics, product browse/search, customer lookup, audit-log list.
Writes always go to the primary; `prismaRead` throws on any write op so misuse fails
loudly. Unset the variable → those reads transparently use the primary again.

Caveats: replicas lag by seconds — never use `prismaRead` for read-after-write flows,
and keep interactive transactions on `prisma` (their inner reads must see their own
uncommitted writes).

### 5. PgBouncer (when connections run out)

Trigger point: `DB_POOL_MAX × instances + ops headroom` approaches Postgres
`max_connections` (default 100). Example: 8 workers × 10 = 80 — time for PgBouncer.

- Point app `DATABASE_URL` at `:6432` (see `deploy/pgbouncer.ini`),
  `pool_mode = transaction`. Prisma over node-pg uses unnamed statements, which are
  compatible; session features (LISTEN/NOTIFY, SET, temp tables) are not available
  behind transaction pooling — this app uses none in request paths.
- Keep `max_client_conn` ≥ total app-side pool capacity; shrink per-worker pools if
  needed (`DB_POOL_MAX=5`) — that's the whole point of pooling.

## Scheduled jobs

| Job kind | What it does | Schedule |
|---|---|---|
| `replenishment.generate` | Recomputes replenishment suggestions (trend, supplier lead time, balancing) | nightly |
| `loss.scan` | Loss-prevention rules over last 30 days | nightly |

- Visibility: `GET /api/jobs?status=FAILED&kind=loss.scan` (admin.config).
- Retry a failed run: `POST /api/jobs {"action":"retry","runId":"..."}`.
- Force one tick now: `POST /api/jobs {"action":"tick"}`.
- Run any job on demand: `POST /api/jobs {"action":"run","kind":"replenishment.generate"}`.

Retries: 3 attempts with exponential backoff (2^n minutes, capped at 60).

## Integrations

1. Register provider: `POST /api/integrations {"action":"register_provider","provider":"shopee","kind":"marketplace","webhookSecret":"<32+ random chars>"}`
2. Point the provider's webhook at `POST /api/integrations/webhook?provider=<name>`
   with `X-Signature: hex(hmac_sha256(rawBody, webhookSecret))`.
3. Queue catalog/stock pushes: `POST /api/integrations {"action":"queue_sync","provider":"...","target":"catalog|stock|orders"}`.
4. Reconcile marketplace orders for a window: `action:"reconcile"`.

Webhooks are idempotent per `eventId`; replays return `duplicate:true`.
Credentials/secrets are write-only (never in GET responses).

## Backups

Postgres logical backup, nightly, keep 14 days:

```bash
pg_dump --format=custom "$DATABASE_URL" > "backup-$(date +%F).dump"
find backups/ -name '*.dump' -mtime +14 -delete
```

Restore: `pg_restore --clean --dbname "$DATABASE_URL" backup-YYYY-MM-DD.dump`.

A backup is only as good as its last restore. Run the drill automatically in CI
and before every major release:
`./scripts/ops/restore-drill.sh /path/to/backup.dump`
It restores into a throw-away database `$DB_RESTORE_DRILL=<dbname>`, runs
`prisma migrate deploy` to confirm migration parity, checks row-counts on the
core tables, then drops the scratch database. A CI failure here fails the build.

## Checkout admission control

- Per-IP rate limit: `storefront-checkout`, 10/min (`MAX_CONCURRENT_CHECKOUTS`
  is a *separate* global cap on in-flight checkouts, default 20).
- When the global cap is reached, new checkouts wait up to
  `CHECKOUT_QUEUE_WAIT_MS` (default 5000) before returning
  `409 RATE_LIMITED` with `Retry-After`.
- Multi-instance: the counter is in-process today. At ≥3 instances replace it
  with an edge/Redis atomic counter or an admission-control header so the cap is
  shared instead of multiplied.

## Monitoring

- Liveness probe: `GET /api/health/live` (200 = process up).
- Readiness probe: `GET /api/health/ready` (live DB round-trip; 503 = not ready).
- Failed jobs: alert on `GET /api/jobs?status=FAILED` non-empty (admin.config).
- Loss alerts: `GET /api/loss-prevention` (reports.financial.view).
- Audit trail: `GET /api/audit-logs`.
- Multi-instance: alert on PM2 worker restarts (`pm2 describe bookstore` restart count)
  and on PgBouncer `SHOW POOLS` cl_waiting > 0 sustained.

## Reverse-proxy contract (`TRUST_PROXY_HEADERS`)

Rate limits and audit identity key off the client IP, taken from `X-Real-IP` /
the first hop of `X-Forwarded-For` only when trusting proxies.

| Deployment | Setting | Effect |
|---|---|---|
| App exposed directly (no proxy) | `TRUST_PROXY_HEADERS=false` (default) | All clients share one limiter bucket per namespace — safe but coarse |
| Behind nginx/Cloudflare/ALB that overwrites XFF | `TRUST_PROXY_HEADERS=true` | Correct per-client limiting; spoofed headers impossible because the proxy rewrites them |

Never set `true` on a directly-exposed server: attackers could rotate fake
`X-Forwarded-For` values to bypass login/checkout rate limits entirely.

## SMTP mail / password reset

Password reset (`POST /api/auth {action:"request_reset"|"reset_password"}`) emails a
single-use link via SMTP (Nodemailer). Configuration:

- `SMTP_HOST`, `SMTP_PORT` (587 STARTTLS or 465 implicit TLS), `SMTP_USER`,
  `SMTP_PASS`, `MAIL_FROM`.
- **Unconfigured in dev**: the link is logged server-side
  (`mail_unconfigured_fallback`) instead of sent — handy for local testing.
- **Production must configure SMTP.** Without it, requests still return the
  generic OK but no mail goes out and an `reset_mail_failed`-style error is
  logged — users cannot reset until this is fixed.

Token policy: 256-bit random, stored SHA-256-hashed, 30-minute expiry, single
use (atomic claim), all sessions revoked on successful reset, rate-limited per
IP and per account. Verify with `npm run test:reset`.

## Timezone

**Storage is UTC, always.** Datetime columns are `timestamp without time zone`
holding UTC wall-clock values; the app forces `timezone=UTC` on every pooled
connection and the database itself (`ALTER DATABASE ... SET timezone TO 'UTC'`).
Never run raw SQL sessions in another timezone against these tables — a psql
session in `Asia/Ho_Chi_Minh` writes +07-naive values that silently disagree
with every Prisma-written row by 7 hours.

Reporting windows ("today", "this month") follow the business timezone from
`APP_TIMEZONE` (default `Asia/Ho_Chi_Minh`). Set it explicitly in production so
dashboards never depend on the host clock settings.
