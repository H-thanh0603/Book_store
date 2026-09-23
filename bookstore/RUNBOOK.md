# Production Runbook

## Deploy

1. Backup database and record the application commit SHA.
2. Run `npx prisma migrate deploy` from the release artifact.
3. On the first encrypted-secret rollout only, run `npm run security:encrypt-integrations` with the production encryption key.
4. Start the new release and wait for `/api/health/ready` to return `200`, then route traffic and smoke-test login/catalog.

Never run `prisma migrate dev` or `prisma db seed` in production.

## Backup and restore drill

Backup with credentials supplied by the platform secret manager:

```bash
pg_dump --format=custom --no-owner --file=bookstore.dump "$DATABASE_URL"
```

Restore into a new empty database, never over the live database:

```bash
createdb bookstore_restore_test
pg_restore --exit-on-error --no-owner --dbname="$RESTORE_DATABASE_URL" bookstore.dump
```

After restore, point a temporary app instance at the restored database and require readiness plus the read-only smoke checks. Run this drill at least quarterly and record duration/result outside the repository.

## Rollback

1. Stop routing new traffic to the failed release.
2. Redeploy the previously recorded application SHA.
3. Prefer a forward-fix migration. Do not reverse a migration after new-version writes unless its migration-specific recovery procedure proves data-safe.
4. If data corruption occurred, restore to a new database and reconcile transactions created after the backup before switching traffic.

## Incident triage

1. Capture the response `x-request-id`, UTC time, route and affected order/payment number.
2. Search structured logs by `requestId`; never paste session cookies, passwords, addresses or provider secrets into tickets.
3. Check `/api/health/ready`, PostgreSQL connections/locks and failed or expired `JobRun` rows.
4. Disable the affected integration or route traffic back to the last healthy release before making an untested data repair.

## Alerts required before launch

- Readiness failures for 2 consecutive minutes.
- API 5xx rate above 2% for 5 minutes.
- PostgreSQL pool saturation or connection failures.
- `JobRun` failures/exhausted retries and jobs running beyond their lease.

Wire the built-in checker to any scheduler that can page (crontab + mail,
Healthchecks.io, GitHub Actions schedule):

```bash
SEED_USER_PASSWORD=<ops-account-password> BASE_URL=https://bookstore.example.com \
  npm run ops:check-alerts   # exits non-zero on: FAILED JobRun, catalog p95, DB pool wait, 429 share
```

## Rotating the integration encryption key

When `INTEGRATION_ENCRYPTION_KEY` must be replaced (suspected leak, staff
offboarding, periodic policy):

1. Generate a new base64 32-byte key (`openssl rand -base64 32`). Do NOT restart the app yet.
2. Re-seal every provider secret under the new key:
   `OLD_INTEGRATION_ENCRYPTION_KEY=<current> INTEGRATION_ENCRYPTION_KEY=<new> npm run security:rotate-integration-key`
3. Update `INTEGRATION_ENCRYPTION_KEY` to the NEW value in the process manager / secret store, then `pm2 reload bookstore`.
4. Verify an inbound webhook still verifies (or re-trigger a signed test event).

The old key is safe to discard only after step 4 passes.

## Rotating other long-lived secrets

Any secret that has left the machine (shared `.env`, screenshot, laptop loss)
must be treated as burned and rotated the same day:

- `GEMINI_API_KEY` / `LLM_API_KEY` — revoke in the provider console
  (Google AI Studio / TokenRouter), mint a replacement, update the secret
  store, `pm2 reload bookstore`. Concierge/merchant degrade to 503+canned
  replies while unset — no data loss.
- `AGENT_CART_SECRET` — set a new 32+ char random value in the secret store
  and reload. In-flight handoff links signed with the old value stop working
  (users re-add items); no other surface is affected.
- `CARRIER_WEBHOOK_SECRET` / provider webhook secrets — update both sides;
  verify with a signed test event before discarding the old value.
- Staff/session compromise — `UPDATE "Session" SET "expiresAt" = now() WHERE
  "expiresAt" > now();` (or truncate via ops) forces re-login everywhere.

## Redis in production (multi-worker deployments)

`ecosystem.config.js` runs `instances: "max"`. Without a shared store,
per-process fallbacks apply: login/rate-limit buckets live per worker
(limits multiplied by worker count) and the checkout semaphore over-admits
slots under contention. For any multi-worker deployment set `REDIS_URL` in
the secret store BEFORE go-live — the code falls back gracefully, but the
safe limits are only guaranteed with Redis present. Single-worker boxes may
omit it (document the choice in HANDOVER.md).

## Release changelog (template)

Every production deploy records one entry in `docs/CHANGELOG.md` (create on
first use):

```markdown
## 2026-09-12 — <short title>
- App SHA: <git sha> · Migrations: <names or "none">
- Changes: <1 line each, user-visible first>
- Rollback: <forward-fix plan or "redeploy <previous SHA>">
- Verified: <smoke checks run + by whom>
```
