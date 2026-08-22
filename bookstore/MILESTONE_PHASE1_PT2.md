# Phase 1 Milestone Report (Part 2 — tasks 9–15)

## Completed
- Tested full HTTP flow 1: PO create → approve → receive → warehouse inventory +N (verified 283→293, +10).
- Tested flow 3 (transfer 2 stores): NH→TD qty5, sequential transitions REQUESTED→APPROVED→PICKING→IN_TRANSIT→RECEIVED→COMPLETED; source −5, destination +5, exactly one TRANSFER_IN movement.
- Tested flow 4 (customer + loyalty): real sale with customerId → loyalty earned = floor(total / 10000); history recorded as EARN with txn refId.
- Concurrency test: 4 parallel sales, stock=3 → 3 succeeded, 4th blocked INSUFFICIENT_STOCK; final stock=0, no negative.
- Security self-audit (§112): all routes authorized; store-scoping enforced (cashier NH blocked from TD); fixed anonymous order bypass.
- Loyalty rate moved to SystemConfig `loyalty.vndPerPoint` (spec §101).

## Database Changes
- Added `SystemConfig` row `loyalty.vndPerPoint = 10000` (seeded in prisma/seed.ts, also inserted live).
- No schema/migration change (SystemConfig model already existed).

## APIs Added
- `getSystemConfig<T>(key, fallback)` helper in `src/lib/api.ts` — reads SystemConfig JSON with in-memory cache + fallback.
- (Security) `POST /api/orders` now requires authenticated user (removed anonymous bypass).

## UI Added
- None (tasks 3–8 UI pages remain out of scope for this batch — APIs exist and are HTTP-tested).

## Tests
- All flows verified via real HTTP calls against running dev server (port 3000) + psql inventory assertions:
  - Sale → inventory −qty, over-sell blocked. ✓
  - PO → receive → inventory +qty. ✓
  - Transfer → source −qty, dest +qty (after double-count fix). ✓
  - Customer sale → loyalty earn + history. ✓
  - Concurrency: 2+ sales same SKU, no negative stock. ✓
- `tsc --noEmit` passes (exit 0).

## Security Considerations
- **Fixed (High):** `POST /api/orders` allowed unauthenticated order creation + stock reservation (`requireAuthSafe` swallowed auth failure). Now uses strict `requireAuth` → 401 when not logged in.
- **Confirmed safe:** store-scoping in `requirePermission(code, storeId)` blocks cross-store sale/shift; all mutating routes call requirePermission/requireAuth; transactions atomic; ledger-first inventory (UPDATE ... RETURNING) prevents lost updates; apiError hides raw DB errors.
- **Minor (not fixed):** audit log missing for PO create/approve and shift close (sale receive, transfer, goods-receipt are logged).

## Known Issues
1. **Transfer double-count bug (FIXED):** `transfers/route.ts` applied TRANSFER_IN on both RECEIVED and COMPLETED → destination counted twice. Fixed to apply only at RECEIVED. (Re-tested clean: single movement.)
2. **BigInt crash (FIXED):** non-integer money (e.g. amount=1.5) threw "Cannot convert ... to a BigInt" (INTERNAL, leaked). Added `toMoney()` guard in `src/lib/api.ts`, used in pos/purchase-orders/orders routes → clean VALIDATION.
3. Loyalty `getSystemConfig` caches in-process; changing config requires server restart to take effect (acceptable for §101 config cadence).
4. UI pages (Products, Inventory, PO mgmt, Transfers, Customers/Loyalty, Audit viewer) not built — APIs ready.

## Next
- Build the 6 missing UI pages (tasks 3–8).
- Add audit logging for PO create/approve + shift close.
- Promote `getSystemConfig` cache to DB-listen/periodic refresh if config changes at runtime.
- Add automated test suite (currently manual HTTP + psql).
