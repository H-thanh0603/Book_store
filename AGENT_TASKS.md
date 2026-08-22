# Work split for Agents 1–4

## Shared rules

1. Read `bookstore/AGENTS.md` before editing. Use CodeGraph first when locating code.
2. Do not commit or push. Report changed files, verification commands, and remaining blockers.
3. Do not edit another agent's owned files. Add a short note in your handoff if a shared change is needed.
4. Run the smallest relevant test plus `npm run build` from `bookstore/` before handoff.
5. Agent 1 must finish P0 fixes before agents 2–4 modify shared APIs.

## Agent 1 — P0 security, data integrity, and quality gate

**Owns:** `bookstore/src/lib/auth.ts`, `src/lib/api.ts`, `src/lib/orders.ts`, `src/app/api/{inventory,orders,transfers,purchase-orders,fulfillment,returns,dashboard}/`, `src/app/api/audit-logs/`, tests under `bookstore/scripts/`.

**Deliverables:**

1. Centralize store-scoped authorization/query filtering. A scoped Store A role must never read or mutate Store B data, including when `storeId` is omitted.
2. Validate order customer/store/location ownership and fulfillment delivery transitions.
3. Make returns safe: reject cumulative over-returns; create a real refund/payment ledger or leave the return in a non-refunded state until a refund is recorded.
4. Add audit logs for every sensitive mutation, starting with PO create/approve, shift close, fulfillment, returns, counts, gift cards, and integration actions.
5. Remove all current ESLint errors; add automated HTTP/database checks for authorization, return limits, idempotency, and inventory concurrency.

**Done when:** `npm run lint`, `npm run build`, and the new focused test commands pass. Include an HTTP proof that a Store A session receives `403` for Store B list and mutation attempts.

**Do not touch:** catalog/UI pages, promotions, Phase 3 services, Prisma schema unless a refund ledger migration is essential.

## Agent 2 — Catalog, stores, suppliers, purchasing, and inventory operations

**Owns:** product/store/supplier/purchase/inventory APIs and pages, refs API, seed data, catalog/purchasing/inventory migrations. Do not edit `auth.ts`, `orders.ts`, POS, or Phase 3 APIs.

**Deliverables:**

1. Implement CRUD/detail pages and APIs for stores, categories, attributes, brands, authors, publishers, products, variants, and barcodes.
2. Add supplier CRUD, supplier-product/price history, purchase request, PO detail, supplier confirmation, invoice/payable, and close/cancel workflow.
3. Build inventory movement, adjustment approval, count review, low-stock, aging, shelf/bin, and import/export flows.
4. Add product images/upload validation and full-text search or a documented PostgreSQL search fallback.
5. Make seed data idempotent and meet the spec baseline: 100–500 products, 20 suppliers, and 100 customers.

**Done when:** every new route has permission checks, a real data flow is exercised, `npm run build` passes, and the seed can run twice without duplicate/unique failures.

**Do not touch:** nav, customer/POS/order pages, Phase 3 models/services, Agent 1 owned files.

## Agent 3 — POS, customers, orders, promotions, and Phase 2 experience

**Owns:** `src/app/{pos,customers}/`, new pages for orders/returns/promotions/gift-cards/shipping/counts, `src/app/nav.tsx`, and APIs for customers, POS, promotions, gift cards, and online checkout. Consume `lib/orders.ts`; do not change it.

**Deliverables:**

1. Build customer profile, addresses, consent/preferences, loyalty history, expiry/bonus/adjustment, tier, and birthday rewards.
2. Complete POS: hold/resume, receipt/invoice, refund/exchange, and manager-approved price override.
3. Build promotion builder, coupons, campaigns, SKU/brand/tier targeting, and per-customer redemption limits.
4. Build the customer ordering path: catalog, cart, checkout, payment state, click & collect, picking/packing, shipping, and returns UI.
5. Complete gift-card lifecycle, consignment settlement, supplier-return credit note, count review UI, and Phase 2 analytics/report UI.

**Done when:** the seven business flows in spec §114 can be run from the UI or documented HTTP calls, with no payment amount supplied by the client trusted as source of truth.

**Do not touch:** Agent 1 files, catalog/purchasing/inventory files owned by Agent 2, or Phase 3 APIs owned by Agent 4.

## Agent 4 — Phase 3 automation, reporting, mobile, and production operations

**Owns:** `src/lib/{replenishment,recommendations,loss-prevention}.ts`, `src/app/api/{replenishment,recommendations,integrations,warehouse-tasks,mobile,loss-prevention,analytics}/`, PWA/mobile pages, reporting pages, CI/deployment/monitoring docs/config.

**Deliverables:**

1. Add a scheduled-job worker/cron with retries for replenishment, loss scans, integration jobs, notifications, and failed-job visibility.
2. Improve forecast/replenishment with supplier lead time, pending PO, seasonality, forecast history/accuracy, store balancing, and approval-backed PO/transfer suggestions.
3. Implement real marketplace/accounting connector interfaces: provider credentials, signed webhooks, catalog/stock/order sync, tax/account mapping, and reconciliation.
4. Complete advanced WMS: task items, bin-level picking, putaway, wave picking, packing labels, and mobile scanner workflows.
5. Expand loss prevention, reports, observability, CI, staging, backups, performance/load tests, accessibility, and deploy runbooks.

**Done when:** scheduled work is observable and retryable, integrations are idempotent and webhook-safe, mobile workflows work on a phone, and CI runs lint, unit, integration, and E2E suites.

**Do not touch:** Agent 1 security core, Agent 2 catalog/purchasing files, Agent 3 customer/POS/checkout pages, or `nav.tsx`.

## Integration order

1. Merge Agent 1 first.
2. Merge Agent 2 and Agent 3 after resolving any schema/API contracts with Agent 1.
3. Merge Agent 4 last because it consumes the completed transaction and reporting data.

## Explicitly not assigned

Do not implement full ERP, payroll, Kubernetes, microservices, event streaming, warehouse robotics, or production-grade ML. They are out of scope in the master spec.
