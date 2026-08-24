// Alert checker for scheduled monitoring (cron / uptime robot / CI gate).
//
// Polls the two endpoints that already exist — /api/jobs?status=FAILED and
// /api/metrics — and exits non-zero when an alert condition holds, so any
// scheduler (crontab + mail, GitHub Actions, Healthchecks.io) can page on it:
//
//   SEED_USER_PASSWORD=... BASE_URL=http://localhost:3000 \
//     npx tsx scripts/check-alerts.ts
//
// Alert conditions (thresholds overridable via env):
//   - any FAILED job run (retry budget exhausted)            [always alerts]
//   - catalog p95 latency above ALERT_CATALOG_P95_MS (500)   [when sampled]
//   - DB pool acquire p95 above ALERT_POOL_WAIT_MS (2_000)
//   - 429 share of storefront requests above ALERT_429_RATIO (0.10)

import "dotenv/config";
import { prisma } from "../src/lib/db";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const TEST_PASSWORD = process.env.SEED_USER_PASSWORD;
if (!TEST_PASSWORD) throw new Error("SEED_USER_PASSWORD is required");

const CATALOG_P95_BUDGET = Number(process.env.ALERT_CATALOG_P95_MS ?? 500);
const POOL_WAIT_BUDGET = Number(process.env.ALERT_POOL_WAIT_MS ?? 2_000);
const RATE429_MAX_RATIO = Number(process.env.ALERT_429_RATIO ?? 0.1);

type Jar = { cookie?: string };

async function api(jar: Jar, method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(jar.cookie ? { cookie: jar.cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) jar.cookie = setCookie.split(";")[0];
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

async function main() {
  const jar: Jar = {};
  const login = await api(jar, "POST", "/api/auth", {
    action: "login",
    email: process.env.ALERT_ADMIN_EMAIL ?? "owner@melio.vn",
    password: TEST_PASSWORD,
  });
  if (login.status !== 200) throw new Error(`Alert checker cannot log in: HTTP ${login.status}`);

  const alerts: string[] = [];

  // ── 1. FAILED jobs (the endpoint ops already poll) ────────────────────────
  const jobs = await api(jar, "GET", "/api/jobs?status=FAILED");
  const runs = (jobs.data.runs as { id: string; kind: string; error: string | null; finishedAt: Date | null }[] | undefined) ?? [];
  if (runs.length > 0) {
    alerts.push(
      `JOB_FAILED: ${runs.length} job run(s) exhausted retries — ${runs
        .slice(0, 5)
        .map((r) => `${r.kind}(${r.id}): ${r.error?.slice(0, 120) ?? "unknown"}`)
        .join(" | ")}`
    );
  }

  // ── 2. Latency / pool / 429 thresholds from the metrics snapshot ──────────
  const metrics = await api(jar, "GET", "/api/metrics");
  if (metrics.status === 200) {
    type RouteRow = { route: string; p95Ms: number | null; rateLimited429: number; count: number };
    const routes = ((metrics.data.routes as RouteRow[]) ?? []).filter((r) => r.route === "GET /api/storefront");
    const catalog = routes[0];
    if (catalog && catalog.p95Ms != null && catalog.count >= 20) {
      if (catalog.p95Ms > CATALOG_P95_BUDGET)
        alerts.push(`CATALOG_P95: GET /api/storefront p95=${catalog.p95Ms}ms exceeds ${CATALOG_P95_BUDGET}ms budget (${catalog.count} samples)`);
      const ratio = catalog.count ? catalog.rateLimited429 / catalog.count : 0;
      if (ratio > RATE429_MAX_RATIO)
        alerts.push(`RATE_LIMIT_PRESSURE: ${(ratio * 100).toFixed(1)}% of storefront requests hit 429 (> ${(RATE429_MAX_RATIO * 100).toFixed(0)}%)`);
    }

    type PoolBlock = { acquireP95Ms: number | null; waiting: number; waitingHighWater: number };
    const poolStats = metrics.data.dbPool as PoolBlock;
    if (poolStats.acquireP95Ms != null && poolStats.acquireP95Ms > POOL_WAIT_BUDGET)
      alerts.push(`POOL_SATURATED: pool acquire p95=${poolStats.acquireP95Ms}ms > ${POOL_WAIT_BUDGET}ms (queue high-water=${poolStats.waitingHighWater}, now waiting=${poolStats.waiting})`);
  } else {
    console.warn(`WARN: /api/metrics returned HTTP ${metrics.status} — threshold checks skipped`);
  }

  if (alerts.length) {
    console.error(JSON.stringify({ level: "alert", alerts }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ level: "info", status: "ok", message: "No alert conditions" }));
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ level: "error", event: "check_alerts_failed", message: String(error) }));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
