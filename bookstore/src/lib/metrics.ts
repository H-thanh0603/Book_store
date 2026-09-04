// Lightweight, dependency-free in-process metrics for the storefront APIs.
//
// Why not Sentry/OTel today: this deployment runs a small number of single
// instances and the operator polls JSON endpoints. This module gives the three
// signals that matter before a sale window — request latency (p95), rejection
// rates (429), and DB pool wait time — without adding an exporter dependency.
// Swap `snapshot()` for an OTel exporter later; the call sites stay identical.
//
// All state is module-global so route handlers and the pg pool hooks (wired in
// db.ts / instrumentation) share one registry per process. When REDIS_URL is
// set, each process flushes its deltas to a shared Redis hash every 30s and
// snapshot() merges remote series in — a PM2 cluster then reports whole-fleet
// numbers instead of 1/N per polled worker.

const LATENCY_BUCKETS_MS = [10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000];

type RouteSeries = {
  count: number;
  sumMs: number;
  buckets: number[]; // cumulative counts, same length as LATENCY_BUCKETS_MS
  maxMs: number;
  status429: number;
  status5xx: number;
};

type PoolStats = {
  waitingHigh: number; // high-water mark of pool.waitingCount since boot
  waitingSamples: number[];
  acquires: number;
  acquireWaitSumMs: number;
  lastAcquireWaitMs: number;
};

const globalForMetrics = globalThis as unknown as {
  __dshRouteMetrics?: Map<string, RouteSeries>;
  __dshPoolStats?: PoolStats;
};

const routes: Map<string, RouteSeries> = (globalForMetrics.__dshRouteMetrics ??= new Map());
const pool: PoolStats = (globalForMetrics.__dshPoolStats ??= {
  waitingHigh: 0,
  waitingSamples: [],
  acquires: 0,
  acquireWaitSumMs: 0,
  lastAcquireWaitMs: 0,
});

function emptySeries(): RouteSeries {
  return { count: 0, sumMs: 0, buckets: new Array(LATENCY_BUCKETS_MS.length).fill(0), maxMs: 0, status429: 0, status5xx: 0 };
}

/** Record one completed API request. */
export function observeRequest(route: string, method: string, status: number, durationMs: number) {
  const key = `${method} ${route}`;
  const series = routes.get(key) ?? emptySeries();
  series.count += 1;
  series.sumMs += durationMs;
  if (durationMs > series.maxMs) series.maxMs = durationMs;
  for (let i = 0; i < LATENCY_BUCKETS_MS.length; i++) {
    if (durationMs <= LATENCY_BUCKETS_MS[i]) series.buckets[i] += 1;
  }
  if (status === 429) series.status429 += 1;
  if (status >= 500) series.status5xx += 1;
  routes.set(key, series);
}

/** Count error paths that bypass observeRequest (defensive; apiError calls it). */
export function recordHttpError(status: number, code: string) {
  const key = `error:${status}:${code}`;
  const series = routes.get(key) ?? emptySeries();
  series.count += 1;
  routes.set(key, series);
}

/** Sample pool queue depth + wait time. Called from db.ts pool hooks. */
export function observePoolAcquire(waitedMs: number, waitingAtArrival: number) {
  pool.acquires += 1;
  pool.acquireWaitSumMs += waitedMs;
  pool.lastAcquireWaitMs = waitedMs;
  // Keep a bounded ring of the last 200 samples (~recent behavior only).
  pool.waitingSamples.push(waitedMs);
  if (pool.waitingSamples.length > 200) pool.waitingSamples.shift();
  if (waitingAtArrival > pool.waitingHigh) pool.waitingHigh = waitingAtArrival;
}

function p95FromBuckets(series: RouteSeries): number | null {
  if (series.count === 0) return null;
  const target = Math.ceil(series.count * 0.95);
  for (let i = 0; i < series.buckets.length; i++) {
    if (series.buckets[i] >= target) return LATENCY_BUCKETS_MS[i];
  }
  return null;
}

function p95FromSamples(samples: number[]): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

export type MetricsSnapshot = {
  uptimeSec: number;
  routes: {
    route: string;
    count: number;
    avgMs: number;
    p95Ms: number | null;
    maxMs: number;
    rateLimited429: number;
    serverErrors5xx: number;
  }[];
  totals: { requests: number; rateLimited429: number; serverErrors5xx: number };
  dbPool: {
    configuredMax: number | null;
    total: number | null;
    idle: number | null;
    waiting: number;
    waitingHighWater: number;
    acquireP95Ms: number | null;
    acquireAvgMs: number | null;
    acquires: number;
  };
};

// ── Multi-instance merge (PM2 cluster) ───────────────────────────────────────
// Each process flushes its per-route DELTAS (since last flush) into its own
// field of a shared Redis hash; snapshotMerged() sums all fields plus local
// un-flushed data. Wire format per route: JSON RouteSeries with numeric fields.

const globalForFlush = globalThis as unknown as { __dshMetricsFlushed?: Map<string, RouteSeries> };
const flushed: Map<string, RouteSeries> = (globalForFlush.__dshMetricsFlushed ??= new Map());

type WireSeries = { count: number; sumMs: number; maxMs: number; status429: number; status5xx: number; buckets: number[] };

function deltaSince(s: RouteSeries, last: RouteSeries | undefined): RouteSeries {
  if (!last) return { ...s, buckets: [...s.buckets] };
  return {
    count: s.count - last.count,
    sumMs: s.sumMs - last.sumMs,
    maxMs: last.maxMs > 0 ? Math.max(0, s.maxMs - last.maxMs) : s.maxMs, // per-delta max; reader takes max of maxes
    status429: s.status429 - last.status429,
    status5xx: s.status5xx - last.status5xx,
    buckets: s.buckets.map((b, i) => b - (last.buckets[i] ?? 0)),
  };
}

function addSeries(a: RouteSeries, b: WireSeries): RouteSeries {
  return {
    count: a.count + b.count,
    sumMs: a.sumMs + b.sumMs,
    maxMs: Math.max(a.maxMs, b.maxMs),
    status429: a.status429 + b.status429,
    status5xx: a.status5xx + b.status5xx,
    buckets: a.buckets.map((v, i) => v + (b.buckets[i] ?? 0)),
  };
}

/** Push un-flushed local deltas to the shared Redis hash. No-op without Redis. */
export async function flushMetricsDeltas() {
  const { getRedis } = await import("./redis");
  const redis = getRedis();
  if (!redis) return;
  const deltas: Record<string, WireSeries> = {};
  for (const [route, s] of routes.entries()) {
    const last = flushed.get(route);
    if (!last || s.count > last.count || s.status429 > last.status429 || s.status5xx > last.status5xx) {
      deltas[route] = deltaSince(s, last);
    }
  }
  if (Object.keys(deltas).length === 0) return;
  try {
    await redis.hset("metrics:routes", `p${process.pid}`, JSON.stringify(deltas));
    // 10-minute TTL: a dead worker's stale deltas disappear shortly after it
    // stops flushing instead of counting forever.
    await redis.expire("metrics:routes", 600);
    for (const [route, s] of routes.entries()) flushed.set(route, { ...s, buckets: [...s.buckets] });
  } catch {
    // Best-effort; next flush retries the same deltas.
  }
}

/**
 * Whole-fleet snapshot: local live series + every worker's flushed deltas
 * (this process's own field included — its flushed portion is a delta of the
 * same local series, so local + remote is exactly once).
 * Falls back to the local snapshot without Redis.
 */
export async function snapshotMerged(): Promise<MetricsSnapshot> {
  const { getRedis } = await import("./redis");
  const redis = getRedis();
  if (!redis) return snapshot();
  let remoteFields: Record<string, string> = {};
  try {
    remoteFields = await redis.hgetall("metrics:routes");
  } catch {
    return snapshot();
  }
  const merged = new Map(routes);
  // Skip OWN field: the local map already holds this process's full series
  // (flush copies, never resets) — adding our flushed delta would double-count.
  const own = `p${process.pid}`;
  for (const [field, raw] of Object.entries(remoteFields)) {
    if (field === own) continue;
    let perRoute: Record<string, WireSeries>;
    try {
      perRoute = JSON.parse(raw);
    } catch {
      continue;
    }
    for (const [route, wire] of Object.entries(perRoute)) {
      if (typeof wire?.count !== "number" || !Array.isArray(wire.buckets)) continue;
      merged.set(route, addSeries(merged.get(route) ?? emptySeries(), wire));
    }
  }
  return snapshotFromMap(merged);
}

export function snapshot(): MetricsSnapshot {
  return snapshotFromMap(routes);
}

function snapshotFromMap(map: Map<string, RouteSeries>): MetricsSnapshot {
  let totalRequests = 0;
  let total429 = 0;
  let total5xx = 0;
  const routeRows = [...map.entries()]
    .filter(([route]) => !route.startsWith("error:"))
    .map(([route, s]) => {
      totalRequests += s.count;
      total429 += s.status429;
      total5xx += s.status5xx;
      return {
        route,
        count: s.count,
        avgMs: s.count ? Math.round(s.sumMs / s.count) : 0,
        p95Ms: p95FromBuckets(s),
        maxMs: Math.round(s.maxMs),
        rateLimited429: s.status429,
        serverErrors5xx: s.status5xx,
      };
    })
    .sort((a, b) => b.count - a.count);

  const pgPool = (globalThis as unknown as { pool?: { totalCount: number; idleCount: number; waitingCount: number; options?: { max?: number } } }).pool;

  return {
    uptimeSec: Math.round(process.uptime()),
    routes: routeRows,
    totals: { requests: totalRequests, rateLimited429: total429, serverErrors5xx: total5xx },
    dbPool: {
      configuredMax: pgPool?.options?.max ?? null,
      total: pgPool?.totalCount ?? null,
      idle: pgPool?.idleCount ?? null,
      waiting: pgPool?.waitingCount ?? 0,
      waitingHighWater: pool.waitingHigh,
      acquireP95Ms: p95FromSamples(pool.waitingSamples),
      acquireAvgMs: pool.acquires ? Math.round(pool.acquireWaitSumMs / pool.acquires) : null,
      acquires: pool.acquires,
    },
  };
}
