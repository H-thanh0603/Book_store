// Lightweight, dependency-free in-process metrics for the storefront APIs.
//
// Why not Sentry/OTel today: this deployment runs a small number of single
// instances and the operator polls JSON endpoints. This module gives the three
// signals that matter before a sale window — request latency (p95), rejection
// rates (429), and DB pool wait time — without adding an exporter dependency.
// Swap `snapshot()` for an OTel exporter later; the call sites stay identical.
//
// All state is module-global so route handlers and the pg pool hooks (wired in
// db.ts / instrumentation) share one registry per process.

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

export function snapshot(): MetricsSnapshot {
  let totalRequests = 0;
  let total429 = 0;
  let total5xx = 0;
  const routeRows = [...routes.entries()]
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
