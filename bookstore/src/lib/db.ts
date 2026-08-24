import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { observePoolAcquire } from "./metrics";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pool?: pg.Pool;
  readPool?: pg.Pool;
};

// ponytail: pass an external pg.Pool — PrismaPg's internal pool config mangles SASL password in 7.9.1
function parseMax(raw: string | undefined, label: string): number {
  const max = Number(raw ?? "10");
  if (!Number.isInteger(max) || max < 1 || max > 100)
    throw new Error(`${label} must be an integer from 1 to 100`);
  return max;
}

function createPool(connectionString: string, max: number) {
  const pool = new pg.Pool({
    connectionString,
    max,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    // All datetime columns are `timestamp without time zone` written as UTC by
    // Prisma. Forcing the session timezone to UTC keeps SQL-side defaults
    // (now()), interval math and raw queries on the SAME timebase — otherwise
    // rows written by Prisma and rows touched by SQL defaults differ by the
    // server's TZ offset and every cross comparison silently skews.
    options: "-c timezone=UTC",
  });
  // Without this handler, an idle-client network error crashes the Node process.
  pool.on("error", (err) => {
    console.error(JSON.stringify({ level: "error", event: "pg_pool_idle_client_error", message: err.message }));
  });
  return pool;
}

/**
 * Time every checkout of a pool client so saturation is observable before it
 * becomes a 500 storm. pg has no acquire event, so we wrap `pool.connect()`
 * (the single entry point PrismaPg's adapter uses) and record how long the
 * caller waited plus how deep the queue was on arrival. Feeds /api/metrics.
 */
function instrumentPoolWait(pool: pg.Pool) {
  const original = pool.connect.bind(pool);
  const wrapped = async (...args: Parameters<typeof original>) => {
    const waitingAtArrival = pool.waitingCount;
    const started = Date.now();
    const client = await original(...args);
    observePoolAcquire(Date.now() - started, waitingAtArrival);
    return client;
  };
  // Keep the property shape pg users expect (sync overload still available).
  (pool as unknown as { connect: typeof wrapped }).connect = wrapped;
}

function createClient(pool: pg.Pool) {
  return new PrismaClient({ adapter: new PrismaPg(pool), log: ["error", "warn"] });
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

// ── Primary (reads + ALL writes) ────────────────────────────────────────────
const pool =
  globalForPrisma.pool ?? createPool(process.env.DATABASE_URL, parseMax(process.env.DB_POOL_MAX, "DB_POOL_MAX"));
globalForPrisma.pool = pool;
instrumentPoolWait(pool);

export const prisma =
  globalForPrisma.prisma ??
  (() => {
    const client = createClient(pool);
    globalForPrisma.prisma = client;
    return client;
  })();

// ── Read replica client (hot read paths only) ──────────────────────────────
// Route catalog/dashboard/analytics/browse queries here when a replica exists:
//   READ_REPLICA_URL=postgresql://...   (falls back to the primary pool if unset,
//                                        so every call site stays safe either way)
//
// WHY opt-in instead of a global $extends router on `prisma`: this codebase runs
// many interactive `$transaction(async tx => …)` blocks whose inner reads must see
// the SAME connection's uncommitted writes. A router hooking every read would hop
// those to the replica, breaking read-your-writes mid-transaction and silently
// widening race windows. Explicit routing keeps transactional flows on the primary.
//
// The $extends guard below FAILS LOUD if a write sneaks onto the read client —
// replicas are lagging and (often) physically read-only; silent split-brain is worse
// than an error. Replica staleness is seconds-scale: only route tolerance-tolerant reads.
const WRITE_OPS = /^(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)$/;

export const prismaRead = (() => {
  const replicaUrl = process.env.READ_REPLICA_URL;
  const readPool = replicaUrl
    ? (globalForPrisma.readPool ??
      (globalForPrisma.readPool = (() => {
        const p = createPool(replicaUrl, parseMax(process.env.DB_POOL_MAX_READ, "DB_POOL_MAX_READ"));
        instrumentPoolWait(p);
        return p;
      })()))
    : null;
  const base = readPool ? createClient(readPool) : prisma; // no replica → share the primary pool; guard still applies
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          if (WRITE_OPS.test(operation))
            throw Object.assign(
              new Error("prismaRead is read-only — send writes through `prisma` (primary)"),
              { status: 500, code: "INTERNAL" },
            );
          return query(args);
        },
      },
    },
  });
})();

if (process.env.NODE_ENV !== "production" && !globalForPrisma.prisma) {
  // already created above; noop guard for HMR clarity
}
