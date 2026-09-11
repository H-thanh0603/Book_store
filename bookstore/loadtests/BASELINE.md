# Baseline hiệu năng — local benchmark 2026-09-11

Số liệu tham chiếu đầu tiên, đo trên máy dev (PG 18 native, 518 products, 57 orders,
5 stores, 115 customers) sau các bản fix POS search / Redis lease semaphore /
fuzzy guard / SQL GROUP BY reports. Chạy lại sau mỗi thay đổi lớn schema/index
để so sánh — nếu số tệ hơn baseline đáng kể mà không có giải thích, điều tra
trước khi merge.

## Cách chạy lại

```bash
# 1. Server với chế độ benchmark (bỏ per-IP rate limit CHỈ trên /api/storefront)
LOADTEST_MODE=1 npm run start

# 2. k6 (cài: xem README.md)
BASE_URL=http://localhost:3000 CATALOG_VUS=50 CHECKOUT_VUS=10 DURATION=1m \
  k6 run loadtests/k6-catalog-checkout.js

# Quy mô production-gate đầy đủ (1000/50/3m) — chạy trên môi trường staging
BASE_URL=https://staging... CATALOG_VUS=1000 CHECKOUT_VUS=50 DURATION=3m \
  k6 run loadtests/k6-catalog-checkout.js
```

`LOADTEST_MODE=1` chỉ tắt rate limit của route public storefront — mọi route
khác vẫn giữ nguyên. Quên tắt? `scripts/ops/check-alerts.ts` sẽ alert
`LOADTEST_MODE` ngay lần cron đầu tiên.

## Kết quả baseline (50 catalog VUs + 10 checkout VUs, 1m, local)

| Chỉ số | Giá trị | Ngưỡng |
| --- | --- | --- |
| Catalog p95 | **5.4 ms** | < 500 ms |
| Catalog avg | 2.58 ms | — |
| Checkout p95 | **35.6 ms** | — |
| Checkout avg | 26.2 ms | — |
| Checkout 5xx | **0 / 478** | = 0 |
| 409 stock conflict | 9 (đúng hành vi: giành hàng cuối) | — |
| http_req_failed | 0.15% | < 2% |
| Throughput | 34.4 req/s, 2 885 iterations | — |

k6 exit 0 — mọi threshold pass.

## EXPLAIN ANALYZE hot queries (cùng máy, cùng ngày)

| Query | Execution | Ghi chú |
| --- | --- | --- |
| Storefront catalog exact-tier (`ILIKE` + sku EXISTS, LIMIT 100) | 1.1 ms | seq scan 518 rows, sẽ index khi catalog lớn |
| Refund queue scan (`WebPayment` CAPTURED + REFUND_REQUIRED) | 0.03 ms | index `[status, refundStatus]` |
| POS product search (`name ILIKE`, LIMIT 200) | 0.6 ms | — |
| Order theo idempotency key (`externalId`) | 0.03 ms | — |
| Rate limit bucket lookup | 0.01 ms | PK lookup |

Reports GROUP BY (Part 8): 0.26 ms — mọi hop index-served.

## Bugs benchmark đã bắt (ghi lại để không tái diễn)

1. **P2002 → 500 trên customer upsert** (97.9% checkout 5xx ở lần chạy đầu):
   hai checkout đồng thời cùng (orgId, email) thua unique race và crash trần.
   Khách thật gặp mỗi khi mở 2 tab cùng lúc. Fix: recovery path đọc lại theo
   CẢ HAI unique key (orgId,phone) rồi (orgId,email).
2. **Rate limiter làm k6 vô nghĩa** (97.6% 429): mọi VU chung 1 IP → 60 req/min.
   Không phải bug — limiter đúng; benchmark cần `LOADTEST_MODE=1`.

Chuẩn đối chiếu: benchmark full-scale (1000 VUs) nên chạy trên staging với DB
production-sized và Redis thật — local baseline chỉ để bắt regression tương đối.
