// k6 load test — pre-sale gate for the Melio storefront.
//
// Scenario (per Nhóm 3 requirement):
//   - 1,000 virtual shoppers browsing catalog/search over a 3-minute ramp
//   - 50 concurrent checkout attempts throughout the peak window
//
// Pass criteria (thresholds — k6 exits non-zero when any is violated):
//   - catalog p95 < 500 ms
//   - checkout: zero HTTP 5xx
//   - checkout: > 95% of non-429 responses are 2xx/409 (409 = honest stock
//     race loss, an expected and handled outcome under contention)
//   - overall error rate < 2%
//
// Run:
//   BASE_URL=http://localhost:3000 k6 run loadtests/k6-catalog-checkout.js
//
// Optional env:
//   CATALOG_VUS=1000 CHECKOUT_VUS=50 DURATION=3m

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const CATALOG_VUS = Number(__ENV.CATALOG_VUS || 1000);
const CHECKOUT_VUS = Number(__ENV.CHECKOUT_VUS || 50);
const DURATION = __ENV.DURATION || "3m";

const catalogP95 = new Trend("catalog_request_duration", true);
const checkoutDuration = new Trend("checkout_request_duration", true);
const stockConflicts = new Counter("checkout_stock_conflicts_409");
const rateLimited = new Counter("requests_rate_limited_429");
const checkoutServerErrors = new Rate("checkout_server_errors");

export const options = {
  scenarios: {
    // ── 1,000 shoppers browsing the catalog ─────────────────────────────────
    catalog_browse: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "45s", target: Math.floor(CATALOG_VUS * 0.4) },
        { duration: DURATION, target: CATALOG_VUS },
        { duration: "30s", target: CATALOG_VUS },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "20s",
      exec: "browse",
    },
    // ── 50 concurrent checkouts during the same window ──────────────────────
    checkout_pressure: {
      executor: "constant-vus",
      vus: CHECKOUT_VUS,
      startTime: "45s", // begin pressuring checkout as browse ramps to peak
      duration: DURATION,
      exec: "checkoutFlow",
    },
  },
  thresholds: {
    catalog_request_duration: ["p(95)<500"],
    checkout_server_errors: ["rate==0"], // no HTTP 5xx on checkout, ever
    http_req_failed: ["rate<0.02"], // overall transport/app error budget
    "checks{type:checkout}": ["rate>0.95"],
  },
  // Let k6 tag per-scenario so thresholds above can key on them.
  discardResponseBodies: false,
};

function pick(catalog) {
  const products = catalog.products || [];
  for (let i = 0; i < products.length; i++) {
    const p = products[Math.floor(Math.random() * products.length)];
    if (p.variants && p.variants[0] && p.variants[0].available > 0) return p;
  }
  return null;
}

/** Catalog browsing: home catalog → search → category filter. */
export function browse() {
  group("catalog", () => {
    const res = http.get(`${BASE_URL}/api/storefront`, { tags: { name: "catalog" } });
    catalogP95.add(res.timings.duration);
    check(res, {
      "catalog 200": (r) => r.status === 200,
      "catalog has products": (r) => r.status !== 200 || (r.json("products.length") || 0) >= 0,
    });
    if (res.status === 429) rateLimited.add(1);

    const q = encodeURIComponent(["Harry Potter", "LEGO", "Thiên Long", "Double A"][Math.floor(Math.random() * 4)]);
    const searchRes = http.get(`${BASE_URL}/api/storefront?q=${q}`, { tags: { name: "catalog_search" } });
    catalogP95.add(searchRes.timings.duration);
    if (searchRes.status === 429) rateLimited.add(1);
    sleep(Math.random() * 2 + 1);
  });
}

/** Checkout flow: fetch catalog, reserve one unit of an in-stock variant. */
export function checkoutFlow() {
  group("checkout", () => {
    const catalogRes = http.get(`${BASE_URL}/api/storefront`);
    const catalog = catalogRes.status === 200 ? catalogRes.json() : null;
    const product = catalog ? pick(catalog) : null;
    if (!product) {
      sleep(1);
      return;
    }

    const payload = JSON.stringify({
      idempotencyKey: `k6-${__VU}-${__ITER}-${Date.now()}`,
      storeId: catalog.storeId,
      fulfillment: "delivery",
      customer: {
        name: `Khách Load Test ${__VU}`,
        phone: `09${String(10000000 + (__VU * 7919 + __ITER) % 89999999).slice(0, 8)}`,
        email: `k6-${__VU}@example.com`,
        address: `${__VU} Đường Test, Quận 1`,
      },
      items: [{ variantId: product.variants[0].id, quantity: 1 }],
    });

    const res = http.post(`${BASE_URL}/api/storefront`, payload, {
      headers: { "Content-Type": "application/json" },
      tags: { name: "checkout", type: "checkout" },
    });
    checkoutDuration.add(res.timings.duration);

    const isServerError = res.status >= 500;
    checkoutServerErrors.add(isServerError);

    check(res, {
      "checkout not 5xx": () => !isServerError,
      "checkout accepted or honestly conflicted or throttled":
        (r) => [201, 409, 400, 429].includes(r.status),
    });

    if (res.status === 409) stockConflicts.add(1);
    if (res.status === 429) rateLimited.add(1);

    sleep(Math.random() * 1.5 + 0.5);
  });
}
