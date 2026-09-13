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

### First boot on a production box (R4)

```bash
# 1. WAL archiving (postgresql.conf + reload) — see "Point-in-time recovery".
# 2. PM2 apps + log rotation:
pm2 start ecosystem.config.js --env production   # bookstore + bookstore-worker
pm2 install pm2-logrotate
pm2 save && pm2 startup
# 3. Offsite backups + healthcheck (see "Backups"):
#    15 3 * * *  cd /srv/bookstore && ./scripts/ops/backup-offsite.sh
# 4. Weekly self-audit (pages when configuration drifts):
#    0 6 * * 1  cd /srv/bookstore && ./scripts/ops/prod-checklist.sh
# 5. Fill the production .env: DATABASE_URL, INTEGRATION_ENCRYPTION_KEY,
#    SMTP_HOST/USER/PASS, SENTRY_DSN or ERROR_WEBHOOK_URL,
#    GHTK_TOKEN/GHTK_SHOP_ID or VTP_USERNAME/VTP_PASSWORD,
#    CARRIER_WEBHOOK_SECRET, RCLONE_REMOTE.
# 6. Run ./scripts/ops/prod-checklist.sh — 0 failures before go-live.
```

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

**Offsite backup (nightly cron, required in production):**

```bash
# .env / crontab
DATABASE_URL=postgresql://bookstore:...@localhost:5432/bookstore
RCLONE_REMOTE=s3:bookstore-backups          # rclone config'd S3/B2/GDrive target
HEALTHCHECK_URL=https://hc-ping.com/<uuid>    # healthchecks.io — pages when the cron dies
HEALTHCHECK_URL_FAIL=https://hc-ping.com/<uuid>/fail

15 3 * * *  cd /srv/bookstore && ./scripts/ops/backup-offsite.sh
```

`backup-offsite.sh` dumps custom-format, verifies the PGDMP magic header,
uploads via rclone, prunes remote copies at `BACKUP_RETENTION_DAYS` (30)
and keeps a small local mirror (`BACKUP_LOCAL_KEEP_DAYS`, 3). The
healthcheck URL is pinged on success — a cron that silently dies must page
someone, not get discovered at the next incident. Without `RCLONE_REMOTE`
the script refuses to lie: it warns that the dump is LOCAL ONLY.

A same-box pg_dump is not a backup — one disk failure takes the database
and its backup together.

### Verifying the backup cron (weekly, 2 minutes)

```bash
rclone lsl "$RCLONE_REMOTE" --max-depth 1 | tail -3   # newest dump < 30h old?
./scripts/ops/prod-checklist.sh                        # §2 checks this + WAL freshness
```

If the healthcheck pings stopped, check cron mail / `journalctl -u cron` on
the box before assuming the database is the problem. A red weekly
`backup-drill` workflow pages on-call (see "Automatic restore drill").

## Release pipeline: dev → staging → production

Staging is mandatory (see `docs/STAGING.md`): every release is tagged,
smoke-tested on staging (`lint`, `tsc`, `test:storefront`, `smoke-agent`,
one POS + one online + one refund click-through), then deployed here.

### Rollback (app-level, no DB touch)

```bash
./scripts/ops/rollback.sh <last-healthy-sha>   # checkout + build + pm2 reload
```

Migrations are forward-only — rollback never reverses them. Data repair
means restore-to-new-DB + reconcile (RUNBOOK.md "Rollback").

### Point-in-time recovery (WAL archiving)

The nightly dump caps recovery at RPO ~24h. To close the gap to minutes,
enable WAL archiving on the production Postgres (one-time server setup):

```ini
# postgresql.conf
wal_level = replica
archive_mode = on
archive_command = '/srv/bookstore/scripts/ops/wal-archive.sh %p %f'
```

```bash
# env for wal-archive.sh (same box as Postgres)
WAL_SPOOL_DIR=/var/lib/bookstore/wal
RCLONE_REMOTE=s3:bookstore-backups/wal   # off-box copy; without it segments stay LOCAL ONLY
```

- `wal-archive.sh` spools every segment locally first (Postgres depends on
  this — it must succeed), then best-effort uploads off-box. It never fails
  `archive_command` over the network, but logs loudly on upload failure.
- Monitor: alert if spool size grows unbounded (archiver stuck) or if the
  newest remote segment is older than 30 minutes.
- PITR restore: take the latest base dump, `pg_restore` into a fresh DB,
  then replay archived segments with `recovery_target_time`. Full procedure
  lives in the RUNBOOK "disaster recovery" section.

### RPO / RTO commitments

| Tier | RPO | RTO | Mechanism |
|------|-----|-----|-----------|
| Committed (with WAL archiving on) | ≤ 15 min | ≤ 2 h | nightly dump + WAL replay |
| Fallback (dump only) | ≤ 24 h | ≤ 4 h | nightly dump, `pg_restore --clean` |

### Automatic restore drill

A CI scheduled workflow (`.github/workflows/backup-drill.yml`, weekly)
seeds a scratch database, dumps it, and runs `restore-drill.sh` — a red
drill fails the workflow and must page the on-call before the next release.

### SEC-004 backfill (multi-org production)

Migration `20260912060000_sec004_org_scope` assigns pre-existing catalog
rows to the oldest org (stores follow their region — always correct).
Single-org deployments need nothing. **Multi-org databases: before going
live, reassign products/variants to their owning org**, e.g.:

```sql
UPDATE "Product" SET "orgId" = '<org-B>' WHERE ...;
UPDATE "ProductVariant" v SET "orgId" = p."orgId" FROM "Product" p WHERE p.id = v."productId";
```

Verify no two orgs share a code/sku afterwards:
`SELECT code, COUNT(DISTINCT "orgId") FROM "Store" GROUP BY code HAVING COUNT(DISTINCT "orgId") > 1;`
(same shape for `ProductVariant` on `sku`).

## SLA tiers

Commitments per subscription plan (WS3.3 — put the tier in the customer contract):

| Tier | Uptime/mo | p95 checkout | Support response | Backup |
|------|-----------|--------------|------------------|--------|
| FREE/TRIAL | best-effort | — | community | nightly dump |
| PRO | 99.5% | < 3s | 1 business day | dump + WAL (RPO ≤ 15 min) |
| ENTERPRISE | 99.9% | < 2s | 4 business hours, on-call phone | dump + WAL + offsite |

Exclusions: payment-gateway / T-VAN / shipping-carrier outages, customer
network, force majeure. Planned maintenance windows (announced 72h ahead)
don't count against uptime.

### On-call flow

1. Alert fires (healthchecks.io / cron mail / red backup-drill workflow).
2. Acknowledge in 15 min (Enterprise) / 2h (Pro): `/api/health/ready`,
   `JobRun` FAILED rows, `pm2 logs --lines 200`.
3. Mitigate first (rollback to last SHA, disable integration), diagnose second.
4. Post-mortem within 48h for any data-loss or >30-min outage: timeline,
   root cause, action items with owners. File under `docs/incidents/`.

Restore: `pg_restore --clean --dbname "$DATABASE_URL" backups/bookstore-<stamp>.dump`.

A backup is only as good as its last restore. Run the drill automatically in CI
and before every major release:
`./scripts/ops/restore-drill.sh /path/to/backup.dump`
(with `DATABASE_URL` pointing at the maintenance `postgres` DB — needs CREATEDB)
It restores into a throw-away scratch database, then runs `prisma migrate
deploy` to confirm migration parity, checks row-counts on the core tables,
and drops the scratch database. Two Postgres quirks it handles explicitly:
restoring into a FRESH db (no `--clean` — dropping inherited partition
constraints always errors) and pgvector not being a trusted extension (with
a non-superuser URL the drill excludes `ProductEmbedding` — embeddings are
derived data, re-embeddable from Product rows — and says so loudly).
A CI failure here fails the build.

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

## Housekeeping — demo dataset policy (R5)

Canonical demo data = `prisma/seed.ts` (+ `seed-agent2.ts`) only. Research
imports (`scripts/scrape_tiki.py` → `var/tiki_books.json` →
`scripts/import-tiki.ts`) must NEVER run against the demo/staging database
they pollute the catalog with scraped rows (240 TKI-* variants once lived
next to the 278 curated ones).

If it happens anyway: `./scripts/ops/purge-tiki.sh` (dry-run by default,
`CONFIRM=YES` to delete, refuses production). It deletes every TKI-*
variant and its dependent rows across all ledger tables, but KEEPS variants
referenced by OrderItem/PosTransactionItem (history is never deleted) and
reports them.

## Housekeeping — duplicate orgs (seed history)

Phase-1 seed tạo org MỖI LẦN CHẠY (không dedupe), nên DB dev cũ có thể
chứa vài org `Nhà Sách Melio` trùng tên. Seed hiện tại đã `findFirst`
theo name (idempotent), nhưng các org rác từ trước đó vẫn nằm lại: TRIAL,
không user, không store, slug dạng `org-<uuid>` (backfill từ migration
`20260829080000_signup_trial`).

Nhận diện bản chính: org có users/stores/subscription ACTIVE. Dọn rác
(trước khi xoá, kiểm lại 2 subquery đầu — nếu org “rác” có store, nó
không phải rác):

```sql
-- audit: org nào đang có gì?
SELECT o.id, o.slug, o.status,
  (SELECT count(*) FROM "User" u WHERE u."orgId"=o.id) AS users,
  (SELECT count(*) FROM "Store" s WHERE s."regionId" IN
     (SELECT id FROM "Region" r WHERE r."orgId"=o.id)) AS stores
FROM "Organization" o;

-- dọn org rác (đổi IN-list theo audit ở trên):
BEGIN;
DELETE FROM "Customer" WHERE "orgId" IN ('<org-rác-1>', '<org-rác-2>');
DELETE FROM "Region"   WHERE "orgId" IN ('<org-rác-1>', '<org-rác-2>');
DELETE FROM "Organization" WHERE "id" IN ('<org-rác-1>', '<org-rác-2>');
COMMIT;
```

FK RESTRICT sẽ chặn nếu còn bảng con nào tham chiếu — đừng `ON DELETE
CASCADE` tay; xử lý từng báo lỗi rồi xoá tiếp. Slug của org chính cũng
nên đổi từ placeholder `org-<uuid>` (backfill) thành slug thật
(`UPDATE ... SET slug='nha-sach-melio'`) — không có route nào phụ thuộc
slug hiện tại.

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
