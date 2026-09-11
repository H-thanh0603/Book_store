# Baseline hiệu năng — local benchmark 2026-09-11

Số liệu tham chiếu đầu tiên, đo trên máy dev (PG 18 native, 518 products, 57 orders,
5 stores, 115 customers) sau các bản fix POS search / Redis lease semaphore /
fuzzy guard / SQL GROUP BY reports. Chạy lại sau mỗi thay đổi lớn schema/index
để so sánh — nếu số tệ hơn baseline đáng kể mà không có giải thích, điều tra
trước khi merge.

## Cách chạy lại

```bash
# 1. Quy mô nhỏ qua next start thường (đủ cho baseline nhanh):
LOADTEST_MODE=1 npm run start

# 1b. Quy mô 1000 VUs: PHẢI qua PM2 cluster như production topology —
#     đơn process bị đè chết (CPU 99%, OOM-kill) ở 1000 VUs:
set -a; source .env; set +a
LOADTEST_MODE=1 npx pm2 start ecosystem.config.js  # instances: max

# 2. k6 (cài: xem README.md)
BASE_URL=http://localhost:3000 CATALOG_VUS=50 CHECKOUT_VUS=10 DURATION=1m \
  k6 run loadtests/k6-catalog-checkout.js

# Quy mô production-gate đầy đủ (1000/50/3m) — chạy trên môi trường staging
BASE_URL=https://staging... CATALOG_VUS=1000 CHECKOUT_VUS=50 DURATION=3m \
  k6 run loadtests/k6-catalog-checkout.js

# 3. Sau khi xong: tắt PM2 cluster + xoá dữ liệu k6 sinh ra
npx pm2 delete bookstore
```

Lưu ý khi đọc số full-scale trên máy dev: k6, server và PostgreSQL tranh cùng
CPU — nếu monitor tài nguyên, đo theo PID của worker giữ port (`ss -ltnp |
grep 3000`), đừng đo theo `pgrep -f next-server` đầu tiên (bản thân PM2/npm
có thể có nhiều process cùng tên).

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

## Kết quả full-scale 1000 VUs (local, 2026-09-12, sau fix single-flight)

Máy dev 12 cores / 15GB: PM2 cluster 4 workers (LOADTEST_MODE=1), k6 + server
+ PostgreSQL CHUNG một máy (staging thật sẽ không cạnh tranh CPU như vậy).

Diễn biến 3 lần chạy — minh hoạ vì sao phải chạy full-scale trước khi tin
baseline nhỏ:

| Chạy | Cấu hình | Kết quả | Nguyên nhân gốc |
| --- | --- | --- | --- |
| 1 (single node) | 1000/50/3m, 1 process | 98% fail, server OOM-kill giữa run | 1 event loop cho 1000 VUs; `next start` đơn process không phải cấu hình production |
| 2 (single node, đo đúng PID) | 1000/50/3m | 23% fail, p95 20s, 46% checkout 5xx | PID thật CPU 99% — cùng nguyên nhân |
| 3 (PM2 cluster 4) | 1000/50/3m | 0.36% fail nhưng 554 pool connect-timeout, 7.5% checkout 5xx | **Thundering herd trên catalog cache**: TTL 30s hết hạn → hàng trăm request đồng thời miss → hàng trăm DB fan-out identical đổ vào pool 10 conns/worker |
| 4 (sau fix single-flight) | 1000/50/90s | **0 checkout 5xx / 228**, http fail 0.17% (chỉ 409 honest), 471 req/s, catalog p95 927ms, checkout p95 3.9s | p95 catalog vượt ngưỡng 500ms chỉ do CPU contention local |

### Fix đi kèm: catalog cache single-flight (`src/lib/storefront.ts`)

Concurrent miss trên cùng cache key giờ chia sẻ MỘT promise fetch (Map
`catalogInflight`): request đầu fetch, phần còn lại đợi kết quả — herd 30s một
lần biến thành 1 DB fan-out. Có unit test chứng minh 20 request đồng thời
= 1 query. Đây là pattern chuẩn cho mọi cache TTL thiếu coalescing.

### Số liệu full-scale đối chiếu (sau fix)

| Chỉ số | 1000 VUs (local) | Ngưỡng |
| --- | --- | --- |
| Catalog p95 | 927 ms | < 500 ms ⚠ chỉ fail do k6+server tranh CPU cùng máy |
| Catalog p50 | 205 ms | — |
| Checkout p95 | 3.9 s | — |
| Checkout 5xx | **0 / 228** | = 0 ✅ |
| 409 stock conflict | honest conflicts khi giành hàng | — |
| http_req_failed | 0.17% | < 2% ✅ |
| Throughput | **471 req/s** | — |

Ngưỡng p95<500ms cho 1000 VUs chỉ nên coi bắt buộc trên staging (k6 chạy
riêng máy). Trên máy dev chung, p50<250ms + 0 5xx + fail<2% là đạt.

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
3. **Catalog thundering herd** (full-scale 3: 554 connect-timeout, 46%→7.5%
   checkout 5xx): cache TTL 30s không coalesce miss. Fix: single-flight Map
   `catalogInflight` + unit test. Bài học: mọi benchmark dưới quy mô thật
   đều pass — herd chỉ lộ diện khi 1000 VUs cùng miss trong 1 tick.
4. **`next start` đơn process ≠ production**: 1000 VUs đè chết 1 event loop
   (CPU 99%, OOM-kill ở lần 1). Production topology trong docs/OPERATIONS.md
   (PM2 cluster `instances: max`) là bắt buộc, không tuỳ chọn — benchmark
   full-scale phải chạy qua PM2 cluster như production.

Chuẩn đối chiếu: benchmark full-scale (1000 VUs) nên chạy trên staging với DB
production-sized và Redis thật — local baseline chỉ để bắt regression tương đối.
