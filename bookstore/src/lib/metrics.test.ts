// Multi-instance metrics merge — verifies the delta/merge wire contract with
// a stubbed Redis (getRedis is driven via the module-global cache slot).
import { describe, it, expect, beforeEach } from "vitest";

// Fresh per-process state before every case.
const g = globalThis as unknown as {
  __dshRouteMetrics?: Map<string, unknown>;
  __dshMetricsFlushed?: Map<string, unknown>;
  redis?: unknown;
};

function reset() {
  g.__dshRouteMetrics = undefined;
  g.__dshMetricsFlushed = undefined;
}

type Wire = Record<string, string>;

function stubRedis(hash: Wire) {
  g.redis = {
    hset: async (_k: string, field: string, value: string) => { hash[field] = value; },
    hgetall: async () => ({ ...hash }),
    expire: async () => {},
    incr: async () => null,
    pexpire: async () => {},
  };
}

describe("metrics fleet merge", () => {
  beforeEach(reset);

  it("merged snapshot skips its own field (no double count) and adds other workers", async () => {
    const { observeRequest, snapshotMerged, snapshot } = await import("./metrics");
    const hash: Wire = {};
    stubRedis(hash);

    // This process: 10 fast requests to /api/x.
    for (let i = 0; i < 10; i++) observeRequest("/api/x", "GET", 200, 20);
    // Another worker already flushed: 5 requests, one 429.
    hash[`p99999`] = JSON.stringify({
      "GET /api/x": { count: 5, sumMs: 100, maxMs: 40, status429: 1, status5xx: 0, buckets: new Array(10).fill(5) },
    });
    // This process's OWN flushed delta must be ignored by snapshotMerged.
    hash[`p${process.pid}`] = JSON.stringify({
      "GET /api/x": { count: 10, sumMs: 200, maxMs: 20, status429: 0, status5xx: 0, buckets: new Array(10).fill(10) },
    });

    const merged = await snapshotMerged();
    const row = merged.routes.find((r) => r.route === "GET /api/x");
    expect(row).toBeDefined();
    expect(row!.count).toBe(15); // 10 local + 5 other worker, own delta not re-added
    expect(row!.rateLimited429).toBe(1);
    expect(row!.avgMs).toBe(20); // (200 + 100) / 15

    // Local-only snapshot stays untouched by remote data.
    const local = snapshot();
    expect(local.routes.find((r) => r.route === "GET /api/x")!.count).toBe(10);
  });

  it("flush writes only un-flushed deltas and marks them flushed", async () => {
    const { observeRequest, flushMetricsDeltas } = await import("./metrics");
    const hash: Wire = {};
    stubRedis(hash);

    for (let i = 0; i < 4; i++) observeRequest("/api/y", "POST", 200, 30);
    await flushMetricsDeltas();
    const first = JSON.parse(Object.values(hash)[0]!) as Record<string, { count: number }>;
    expect(first["POST /api/y"].count).toBe(4);

    // Two more requests then flush again: second delta must be 2, not 6.
    observeRequest("/api/y", "POST", 200, 30);
    observeRequest("/api/y", "POST", 500, 30);
    await flushMetricsDeltas();
    const second = JSON.parse(Object.values(hash)[0]!) as Record<string, { count: number; status5xx: number }>;
    expect(second["POST /api/y"].count).toBe(2);
    expect(second["POST /api/y"].status5xx).toBe(1);
  });

  it("corrupt remote fields are skipped, not thrown", async () => {
    const { observeRequest, snapshotMerged } = await import("./metrics");
    const hash: Wire = {};
    stubRedis(hash);
    observeRequest("/api/z", "GET", 200, 15);
    hash["p1"] = "not-json{";
    hash["p2"] = JSON.stringify({ "GET /api/z": { count: "junk", buckets: "no" } });
    const merged = await snapshotMerged();
    expect(merged.routes.find((r) => r.route === "GET /api/z")!.count).toBe(1);
  });
});
