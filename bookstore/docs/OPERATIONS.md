# Operations runbook — Melio Bookstore

## Deploy

```bash
npm ci
npx prisma migrate deploy     # apply pending migrations
npm run build
npm start                     # serves on :3000
```

Single-node assumption: the in-process scheduler (`src/instrumentation.ts`) seeds
nightly jobs and ticks every 5 min per server instance. Run exactly ONE instance,
or disable the scheduler and drive `/api/jobs` from external cron.

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

## Monitoring

- Health probe: `GET /login` (200 = app up).
- Failed jobs: alert on `GET /api/jobs?status=FAILED` non-empty (admin.config).
- Loss alerts: `GET /api/loss-prevention` (reports.financial.view).
- Audit trail: `GET /api/audit-logs`.
