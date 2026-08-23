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
