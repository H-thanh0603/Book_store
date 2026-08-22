# Agent 4 handoff — Phase 3 automation, reporting, mobile, operations

## Changed files (all uncommitted, per shared rules)

### New
- `bookstore/src/lib/jobs.ts` — job runner: run ledger, retry w/ backoff, nightly seed
- `bookstore/src/instrumentation.ts` — in-process scheduler (5-min tick, register hook)
- `bookstore/src/app/api/jobs/route.ts` — GET list / POST run|retry|tick
- `bookstore/src/app/api/integrations/webhook/route.ts` — HMAC-SHA256 signed inbound webhook
- `bookstore/src/app/reports/page.tsx` — jobs + loss-alert reporting UI
- `bookstore/docs/OPERATIONS.md` — deploy/jobs/integrations/backup runbook
- `.github/workflows/ci.yml` — lint + tsc + test:phase3 + build on Postgres 16

### Modified
- `bookstore/prisma/schema.prisma` — +JobRun, +WarehouseTaskItem, +IntegrationProvider, Order.externalId, WarehouseTask.waveId
- `bookstore/prisma/migrations/20260822153900_agent4_jobs_wms/`
- `bookstore/prisma/migrations/20260822160800_agent4_integration_providers/`
- `bookstore/prisma/migrations/20260822162000_agent4_order_external_id/`
- `bookstore/src/lib/replenishment-formula.ts` — prior-window trend blend (backward compatible)
- `bookstore/src/lib/replenishment.ts` — supplier lead time/cost, trend, store balancing annotation
- `bookstore/src/app/api/replenishment/route.ts` — ACCEPTED materializes draft transfer or pending_approval PO + audit log
- `bookstore/src/app/api/integrations/route.ts` — providers CRUD (secrets write-only), queue_sync, reconcile
- `bookstore/src/app/api/warehouse-tasks/route.ts` — task items, create_wave, pack_labels, scan flow, ledger-backed complete
- `bookstore/src/app/api/mobile/route.ts` — waveId filter, items in tasks payload
- `bookstore/scripts/test-phase3.ts` — trend-blend formula cases

## Verification performed

- `npx tsx scripts/test-phase3.ts` — pass (formula v2 incl. backward compat)
- `npm run lint` / `tsc --noEmit` — clean for all Agent 4 files; remaining errors are Agent 1/3 owned files (`dashboard/route.ts`, `promotions/page.tsx`, `lib/pos.ts`)
- `npm run build` — pass, `/reports` route present
- Live DB: `runJob('loss.scan')` SUCCEEDED; `scheduleNightly()` idempotent; `tickScheduler()` ran both nightly jobs SUCCEEDED
- HTTP (dev server): provider register OK; GET never returns credentials/webhookSecret; unsigned/bad-signature webhook → 401; signed valid order → 202; replay same eventId → `duplicate:true`; `queue_sync catalog` → PENDING job with real payload
- WMS HTTP: PICK task with bin items created → wave assigned → pack_labels lists lines → scan applies TRANSFER_OUT movement to ledger → auto-complete on last item; manual COMPLETED applies remaining qty; INSUFFICIENT_STOCK correctly blocks picking stock that isn't there

## Notes for other agents

- **Agent 1**: `/api/jobs`, webhook route use your `requirePermission`. Replenishment accept writes audit via your `audit()`. No changes made to your files.
- **Agent 2**: replenishment accept creates POs via `createPurchaseOrder` (central warehouse + latest supplier price) and transfers via `createTransfer` (`requestedBy: "replenishment"`). If you add cheapest-supplier routing, replace the ponytail block in `api/replenishment/route.ts`.
- **Agent 3**: nav link for `/reports` not added — I don't own `nav.tsx`. Suggest adding `["/reports", "Báo cáo"]`.
