---
name: add-background-job
description: Use when adding a new background job to the bookstore scheduler — nightly or frequent cadence, JobRun ledger registration, idempotency and test requirements.
---

# Add a background job

The Postgres `JobRun` ledger is the only queue. Do not add Redis/BullMQ or a
second mechanism — retries, lease takeover and scheduling already exist in
`src/lib/jobs.ts`.

## Steps

1. **Write the job body** in a `src/lib/` module that owns the domain:

   ```ts
   export async function myThing(): Promise<{ created: number }> {
     // MUST be idempotent: the scheduler may run it twice (lease takeover).
     // Never throw for per-row issues — collect and continue; only throw when
     // the whole pass failed and a retry makes sense.
     return { created: n };
   }
   ```

   Return a small plain object — it is stored on the JobRun row and read by
   ops dashboards. Arrays collapse to `{count}`.

2. **Register it** in `src/lib/jobs.ts`:

   ```ts
   import { myThing } from "./my-module";
   // JOB_KINDS:
   "my.thing": myThing,
   ```

3. **Pick the cadence** — add the key to exactly one list:
   - `NIGHTLY`: once per day (pruning, exports, scans).
   - `FREQUENT`: once per 5-minute tick (reservations, polling, delivery).
   Job ids (`nightly:<kind>:<day>` / `freq:<kind>:<slot>`) make repeats
   idempotent — never enqueue from request paths; write a JobRun row only via
   `scheduleNightly` patterns.

4. **Test**: unit-test the body's logic colocated (`my-module.test.ts`); if the
   job is DB-only, add its script to the DB-only list in
   `scripts/tests/integration-suite.test.ts` and verify with
   `npm run test:integration`.

5. **Check discipline**: `npm run lint && npm run knip && npx tsc --noEmit`.
   New exports need call sites in the same PR.

## Anti-patterns

- In-process `setInterval`/`setTimeout` scheduling outside `jobs.ts`.
- A job that assumes it is the only runner (write conflict-safe: `updateMany`
  with status guards, unique constraints).
- Sleeping/polling loops — use the FREQUENT cadence instead.
