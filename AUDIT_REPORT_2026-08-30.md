# PRODUCTION READINESS AUDIT — Melio Bookstore (2026-08-30)

Audit toàn diện: kiến trúc, database, backend/API, frontend, security, concurrency, DevOps, observability, testing.
Mọi kết luận dựa trên code thực tế (file:line). Người audit không sửa code — đây là báo cáo đánh giá.

Đối tượng: `bookstore/` — Next.js 16.3.2 (App Router, React 19), Prisma 7 + PostgreSQL (PgBouncer transaction mode),
Redis (ioredis, cache-only), PM2 cluster, nginx, VNPay/MoMo/ZaloPay, e-invoice T-VAN, subscription billing, multi-org.

---

## 1. Executive Summary

Hệ thống này **không phải prototype**. Nhiều hạ tầng production-grade đã có sẵn và làm đúng:
idempotency key trên mọi đường tiền, `SELECT FOR UPDATE` trên ledger kho, BigInt cho tiền tệ,
CHECK constraints ở tầng SQL, partitioning cho InventoryMovement, rate-limit Postgres-backed,
keyset pagination cho AuditLog, pgvector HNSW cho search, liveness/readiness tách biệt,
restore-drill script, k6 load test, 38 file unit test.

**Nhưng** cuộc audit đã tìm ra một nhóm lỗi **thất thoát tiền và hỏng dữ liệu** ở lớp business logic,
cùng một nhóm lỗi **isolation chéo tenant**. Ba lỗi nghiêm trọng nhất:

1. **Đơn hàng bị hủy sau khi đã nhận tiền** — settle cổng thanh toán không bao giờ chuyển trạng thái
   Order (không có state PAID), job expiry hủy mọi order CONFIRMED quá hạn kể cả khi đã capture tiền,
   và WebPayment vẫn bị flip PAID vô điều kiện. Khách trả tiền → order CANCELLED → kho đã release → không có đường refund.
2. **Hóa đơn subscription bị đánh PAID dù thanh toán VNPay thất bại** — org hết hạn vẫn hoạt động vô thời hạn, không thu được tiền.
3. **State machine của Transfers hoàn toàn không có claim** — double-ship trừ kho 2 lần,
   `receivedQty` không validate (tạo kho từ hư không / kho âm), cancel sau ship làm mất hàng trong transit.

Kèm theo: 4 lỗ hổng tenant-isolation (webhook secret leak, export PII không quyền, e-invoice IDOR,
reports/revenue không lọc org), billing suspension không bao giờ được enforce, POS chỉ load 25 sản phẩm
(quét barcode sản phẩm thứ 26 sẽ "không tìm thấy").

**Verdict: ❌ NO — chưa thể đưa lên production đa-tenant ngay bây giờ.**
Sau khi fix nhóm P0 (ước tính 1–2 tuần), hệ thống đạt mức **⚠️ YES — phù hợp production quy mô nhỏ**.
Overall Production Readiness Score: **58/100**.

---

## 2. System Architecture Overview

```
Cloudflare → nginx (HSTS, no POST retry) → PM2 cluster (instances: max, port 3000)
  ├─ src/proxy.ts          — CSRF (x-csrf-check + Origin), session gate, request-id, request log
  ├─ src/app/api/**        — 75 route.ts, mỏng: validate → gọi lib → ok()/apiError()
  ├─ src/lib/*             — service layer (~8.7k LOC): pos, orders, storefront, promotions,
  │                          inventory, vnpay/momo/zalopay, einvoice(+jobs), webhook-bus,
  │                          billing, reports, jobs, rate-limit, throttle, metrics, auth...
  ├─ src/lib/db.ts         — pg Pool → Prisma adapter; primary + prismaRead (replica, chặn write fail-loud)
  ├─ PostgreSQL (+ PgBouncer transaction mode) — 83 models, 30 migrations (Prisma + raw SQL)
  ├─ Redis                 — cache-only (config 30s, catalog 30s, reports 5min); down = fallback, không chết
  ├─ Job system            — DB-backed (JobRun + lease 30min), tick 5 phút, chỉ PM2 worker 0
  └─ nginx upstream: 127.0.0.1:3000; Postgres/Redis cùng 1 box
```

- **Layering sạch**: không có lib→app import ngược; không component nào chạm Prisma; mọi page là client component fetch qua `/api`.
- **Multi-tenant**: orgId từ session; 3 cơ chế enforce (withOrg / withOrgViaStore / resolveStoreScope) — nhưng **không central**, ~45/75 route đã migrate, phần còn lại là nợ có chủ đích (`org-scope.ts:56-64`) và đang rò rỉ (mục 4).
- **Không có queue/message broker** — job chạy trong process app qua DB ledger; chưa cần Kafka/BullMQ ở quy mô này, nhưng thấy những chỗ phải chuyển sang worker riêng khi tăng tải.

---

## 3. Production Readiness Score

| Category            | Score /10 | Severity | Ghi chú |
|---------------------|----------:|----------|---------|
| Architecture        | 7.0       | 🟢       | Layering + service layer chuẩn; tenant enforcement không central |
| Backend/API         | 6.5       | 🟡       | Idempotency/claim rất tốt; thiếu zod, offset pagination, export OOM |
| Frontend            | 6.0       | 🟡       | Code-split tốt, offline POS tốt; POS 25 products, không RSC/SEO |
| Database            | 7.0       | 🟡       | BigInt, CHECK, partition, trigram, pgvector; unique toàn cục, vài index thiếu |
| Scalability         | 6.0       | 🟡       | Multi-instance gần sẵn sàng; reports JS-reduce, fuzzy scan, unbounded tables |
| Security            | 5.0       | 🟠       | AuthN/AuthZ cơ bản tốt; 4 lỗi tenant isolation, SSRF, IP spoof |
| Performance         | 6.0       | 🟡       | Cache đúng chỗ; export/reports/fuzzy là bomb chờ nổ |
| Reliability         | 6.0       | 🟡       | Degradation tốt; job stall 30', không circuit breaker |
| Data integrity      | 5.5       | 🟠       | Ledger POS/kho/PO tốt; transfers/counts/gift-card corrupt được |
| Testing             | 6.0       | 🟡       | 38 file unit + 14 integration; **không có CI**, billing 0 test |
| DevOps              | 4.5       | 🟠       | Runbook tốt nhưng 100% manual, không CI, không log rotation |
| Observability       | 4.5       | 🟠       | Metrics + alert script tự viết; không Sentry, không APM |
| Disaster recovery   | 4.0       | 🟠       | pg_dump nightly cùng box, RPO ~24h, không offsite/WAL |
| Maintainability     | 7.0       | 🟢       | Docs nội bộ trung thực, comments kỷ luật |

### **Overall Production Readiness Score: 58/100**

---

## 4. Critical Issues — P0

### SEC-001 — Cross-tenant webhook takeover: đọc HMAC secret, đổi URL, rotate secret của org khác
- **Location:** `src/app/api/webhooks/[id]/route.ts:18,40,49,63,79-82`
- **Problem:** Route legacy không scope org nào cả. GET trả full row **kể cả cột `secret`** (route mới `webhooks/endpoints/[id]` có `withOrg` đúng). PATCH đổi URL org khác, DELETE xóa org khác, `rotate-secret` trả secret mới cho attacker, `rearm-delivery` re-arm delivery bất kỳ.
- **How it fails:** Staff org A (có `webhooks.read`) iterate id → đọc signing secret org B → ký webhook hợp lệ, đánh cắp event stream.
- **Fix:** Xóa route hoặc thêm `withOrg` + `select` không trả secret. Effort: Low.

### MONEY-001 — Paid-after-cancel: capture tiền trên đơn đã hủy, không đường refund
- **Location:** `src/lib/vnpay.ts:104-111`, `momo.ts:134-139`, `zalopay.ts:114-119` (settle không transition — `updateMany` set `status:"CONFIRMED"` = no-op); `src/lib/order-expiry.ts:35-50` (expiry chỉ nhìn `Order.status`, không nhìn `WebPayment.status`); `momo.ts:141-149` flip WebPayment PAID bất kể claim; `src/lib/storefront.ts:228-231` tạo payment URL mới cho order CANCELLED.
- **How it fails:** Khách thanh toán MoMo deeplink → TTL 60' hết → expiry hủy order + release kho → IPN tới muộn → tiền bị capture, order CANCELLED, không refund, không compensation. Ngược lại: settle xong, expiry vẫn hủy đơn PAID.
- **Root cause:** **Không có state PAID trong Order state machine.**
- **Fix:** Thêm transition `CONFIRMED → PAID` (claim `updateMany`), settle phải claim thành công mới flip WebPayment; expiry skip order có WebPayment PAID/PENDING; chặn tạo payment URL cho CANCELLED; thêm đường refund/compensation. Effort: Medium.

### MONEY-002 — Hóa đơn subscription bị PAID dù thanh toán thất bại
- **Location:** `src/lib/vnpay.ts:139-141` (`settleVnpayResponse` trả `ok:true` kể cả khi gateway báo lỗi), `src/app/api/payments/vnpay/ipn/route.ts:29-33`, `src/lib/billing.ts:105-114` (`settleBillingPayment` chỉ check `status !== "PAID"`, không check `wp.status`).
- **How it fails:** Owner mở checkout billing → thanh toán fail/cancel tại VNPay → IPN với ResponseCode≠00 vẫn `result.ok` → invoice PAID → org không bao giờ bị suspend, tiền = 0.
- **Fix:** `settleBillingPayment` gate trên `wp.status === "PAID"`; sửa contract `ok` của settle. Effort: Low.

### DATA-001 — Transfers state machine không có claim: mất/c CREATE kho, double-ship
- **Location:** `src/app/api/transfers/[id]/route.ts` — ship `:37-38,52-54,80` (check status ngoài tx, update không có `where status`, decrement `reserved` mà không ai từng increment → reserved âm), receive `:89-91,109` (`receivedQty` hoàn toàn không validate: âm → trừ kho đích, > quantity → tạo kho từ hư không; concurrent receive → double increment), cancel `:166,181-184` (cancel được transfer IN_TRANSIT → hàng in-transit mất vĩnh viễn).
- **Impact:** Data corruption kho, oversell, mất hàng. So sánh: PO lifecycle (`purchase-orders/lifecycle/route.ts`) làm đúng 100% — transfers chưa được migrate sang pattern đó.
- **Fix:** Rewrite với `updateMany` status claims + `lockBalance/applyMovement` + validate receivedQty. Effort: Medium.

---

## 5. High Priority Issues — P1

### SEC-002 — Export PII không phân quyền, không scope org
`src/app/api/export/route.ts:142` — chỉ `requireAuth()`; `fetchCustomers` (:112-121) bỏ qua storeScope, không lọc org: tên/SĐT/email/điểm chi tiêu của 10.000 khách cross-org. Bất kỳ account cashier nào cũng lấy được toàn bộ customer base. Thêm: query `orders take:1000` × 10.000 customers + build XLSX in-request → OOM/30s+ response. **Fix:** `requirePermission` + org filter + chuyển export sang job.

### BILL-001 — Billing suspension không bao giờ được enforce
`src/lib/auth.ts:218-224` định nghĩa `requireOrgActive()` — **zero call site**. Không route nào, không page nào check SUSPENDED. Plan limits (`maxStores`, `maxUsers`, features) cũng không được check server-side ở bất kỳ đâu. Org hết trial/nợ vẫn chạy POS vô thời hạn.

### SEC-003 — E-invoice IDOR chéo tenant
`src/app/api/invoices/[id]/route.ts:11-15`, `[id]/cancel/route.ts:16`, list `:19-27` — không lọc orgId dù cột tồn tại. Org A đọc và **cancel hóa đơn đỏ** của org B.

### DATA-002 — Báo cáo stockOnHand crash runtime (select cột không tồn tại)
`src/lib/reports.ts:161-176` — select `quantity` từ InventoryBalance và `price` từ ProductVariant: **cả hai không tồn tại trong schema**. Report chết 100% khi gọi. Toàn bộ reports.ts còn load mọi Order/OrderItem trong kỳ rồi reduce JS (mục 14).

### INV-001 — Stock count: double-post + snapshot sai lệch
`src/app/api/inventory/counts/[id]/route.ts:54-61,98-101` — post không claim DRAFT→POSTED (2 post đồng thời = adjust 2 lần); diff tính từ snapshot lúc tạo count thay vì live balance (snapshot 10, bán 3, đếm 7, diff −3 → onHand = 4 thay vì 7); `update_items` (:34-41) mutate item theo bare id không scope count; cancel (:110-115) không check status. Fix đúng: `onHand := countedQty` qua `applyMovement` + claim.

### MONEY-003 — Gift card adjust lost-update (hoàn lại tiền đã tiêu)
`src/app/api/gift-cards/[id]/route.ts:22,25-47` — đọc balance ngoài tx, ghi **absolute** balance: concurrent với POS redeem → re-credit số tiền vừa tiêu. Write + ledger row không cùng transaction.

### POS-001 — closeShift TOCTOU: sale rơi vào ca đã đóng
`src/lib/pos.ts:38-41` — check shift OPEN bằng `findUnique` thường, không claim; `closeShift` (:396-435) snapshot transactions trước khi claim CLOSED → sale commit sau snapshot không được đếm vào expectedCash, variance sai.

### PRICE-001 — Giá tương lai bị tính hôm nay
`src/lib/pos.ts:51-54`, `orders.ts:46-48` — lọc chỉ `validTo > now`, **thiếu `validFrom <= now`**, lấy newest theo `validFrom desc`: price list hiệu lực tuần sau bị charge ngay hôm nay, trong khi storefront catalog lọc đúng (`storefront.ts:74`) → khách thấy giá cũ, bị charge giá mới. Bug deterministic.

### RET-001 — Returns: over-return race + return trên đơn CANCELLED tạo kho từ hư không
`src/app/api/returns/route.ts:27-40` — cumulative guard read-then-write (2 concurrent returns vượt tổng); :21-23 không check order status — return đơn CANCELLED (kho đã release) + receive → cộng kho 2 lần + refund tiền cho hàng chưa từng giao.

### EINV-001 — E-invoice phát hành trùng (không unique) + row SENDING kẹt vĩnh viễn
`src/lib/einvoice.ts:229-231` read-then-write, schema không có unique `(orderId)` dù comment `schema.prisma:1329` tuyên bố idempotent. 2 concurrent P2002 recovery (`pos.ts:229-238`) → 2 DRAFT → **2 hóa đơn thuế cho 1 sale**. `einvoice-jobs.ts:65` crash trong window SENDING → row kẹt (issue chỉ nhận DRAFT, poll chỉ nhận PENDING); ERROR là terminal, không retry — comment `vnpay.ts:129-130` sai. Refund sale cũng không cancel/adjust hóa đơn đã phát hành.

### OPS-001 — Không có CI
Không `.github/`, không pipeline. 38 unit test + 14 integration script + restore drill + k6 **toàn bộ chạy tay**. OPERATIONS.md:127 nói "chạy drill trong CI" — aspirational. Coverage thresholds trong vitest.config không bao giờ được enforce.

### FE-001 — POS và Orders chỉ thấy 25 sản phẩm đầu tiên
`src/app/pos/page.tsx:83-85`, `orders/page.tsx:63-65` — fetch `/api/products` không page param → default page 1, take 25 (`api/products/route.ts:45-46`). Grid POS, search, **barcode scan matching** (`pos/page.tsx:335-344`) đều chạy trên 25 items: quét barcode sản phẩm #26 → "không tìm thấy" một cách âm thầm. SW precache `public/sw.js:160` request `?limit=500` — param không tồn tại.

### SEC-004 — Uniques toàn cục gây rò rỉ tenant qua phone
`prisma/schema.prisma:655` `Customer.phone @unique` (toàn cục) + `storefront.ts:236-241` upsert khách theo phone → khách của org A bị gắn vào order của org B. Tương tự `ProductVariant.sku`, `Store.code` global. Cần `@@unique([orgId, ...])` hoặc nullable orgId + partial unique.

---

## 6. Medium Issues — P2

| ID | Vấn đề | Location | Impact |
|----|--------|----------|--------|
| SEC-005 | IDOR store-scope: gift-cards/[id] (adjust tiền), transfers/[id], promotions/[id], suppliers/[id], inventory/counts/[id], payments/[provider]/create | các route [id] tương ứng | staff manipulate tài nguyên chéo org |
| SEC-006 | SSRF: đăng ký webhook URL chỉ check regex `^https?://` | `webhooks/endpoints/route.ts:44`, `webhook-bus.ts:137-147` | probe nội bộ 169.254.169.254, localhost:5432 (blind) |
| PAY-001 | ZaloPay IPN không check amount (VNPay check ở vnpay.ts:91, MoMo momo.ts:127) | `zalopay.ts:107-110` | settle số tiền bất kỳ |
| PAY-002 | MoMo/ZaloPay IPN route bị session gate chặn (PUBLIC_PATHS thiếu `/api/payments/[provider]`) → callback gateway 401, đơn không bao giờ settle | `proxy.ts:8-14,104-112` | fail-closed; rủi ro team "fix" bằng cách mở route |
| PAY-003 | Payment webhooks emit với `orgId:"default"` hardcode | `vnpay/ipn/route.ts:39`, `[provider]/ipn/route.ts:22,41,56` | org thật không nhận event; lộ orderId sang org default |
| SEC-007 | Rate-limit IP spoofable: `cf-connecting-ip`/`true-client-ip` được tin kể cả khi `TRUST_PROXY_HEADERS≠true` | `rate-limit.ts:18-23` | bypass mọi limiter public (login, signup, checkout) |
| SEC-008 | `/api/reports/revenue` không lọc org (raw SQL chỉ lọc storeId optional) | `reports/revenue/route.ts:26-90` | admin org A thấy revenue mọi org |
| PERF-001 | MoMo/ZaloPay create + VNPT T-VAN fetch **không timeout** | `momo.ts:66`, `zalopay.ts:70`, `einvoice.ts:135,146,163` | external hang = request hang / lease job bị giữ |
| SCALE-001 | Reports load toàn bộ Order/OrderItem kỳ rồi reduce JS (4 builders) | `reports.ts:54-188` | O(10⁷) rows qua 1 Node process; cache 5' chỉ làm chậm lại |
| SCALE-002 | Unbounded growth: AuditLog (JSON before/after, không prune), WebhookDelivery (không prune), InventoryMovement partitioned nhưng **không có job detach/drop** | instrumentation.ts:29 | 100M rows → disk + index bloat |
| SCALE-003 | Fuzzy search tier: `SIMILARITY` per-word full-table scan khi exact miss | `storefront.ts:122-135` | query vô nghĩa → multi-second scan; DoS vector ở 1M products |
| SCALE-004 | Missing index `ProductVariant.productId` (bảng duy nhất bị sweep FK bỏ sót) | migrations | EXISTS per-product scan ở admin search (`products/route.ts:55-72`) |
| SCALE-005 | Dashboard low-stock: computed predicate `(onHand-reserved)<=5` full scan | `dashboard/route.ts:35-41` | chết ở 10⁷ balances |
| SCALE-006 | Checkout semaphore per-process (20/worker), không shared ở ≥3 instances | `throttle.ts:7-17` | cap thực tế = 20×N |
| REL-001 | Worker-0 chết giữ lease → mọi job stall ≤30'; mất worker-0 vĩnh viễn → stall mãi | `instrumentation.ts:11-16`, `jobs.ts:29,47-50` | reservation expiry/e-invoice/webhook dừng |
| REL-002 | Webhook delivery không có claim per-row (comment mô tả code không tồn tại); attempts lost-update | `webhook-bus.ts:88-113,157,169,183` | duplicate delivery khi lease expire / 2 scheduler instances |
| REL-003 | Không circuit breaker; DB down = mỗi request chờ 5s connect timeout | `db.ts:25` |.thread pool Exhaustion khi DB lơ lửng |
| PROMO-001 | Không có per-customer promo limit (chỉ global usedCount) | `promotions.ts:47-49` | 1 khách redeem coupon không giới hạn |
| DR-001 | Backup: pg_dump nightly **cùng box**, không WAL/PITR, không offsite, RPO ~24h, không RPO/RTO ghi nhận | OPERATIONS.md:117-125 | box chết = mất 1 ngày + không có bản offsite |
| OPS-002 | Không log rotation (pm2 logs ./logs/) + MISA zips ghi `var/misa/` nightly không retention | `ecosystem.config.js:46-47`, `misa-job.ts:59-66` | disk-full chậm nhưng chắc chắn |
| OPS-003 | Không error tracking (stub TODO), không unhandledRejection handler server-side | `error-tracking.ts:45` | lỗi production im lặng |
| PAY-004 | Export take:10000 truncate âm thầm | `export/route.ts:99,114,126` | kế toán export thiếu data không hay biết |
| FE-002 | /orders, /inventory, /invoices, /customers: cap cứng 50–500, không pagination UI → data sau cap không với tới | tương ứng | vận hành bị bế |

---

## 7. Low Priority Issues — P3

- Không `Product.slug`, Author/Publisher/Category.name không unique (`schema.prisma:282,312,317`).
- `redis.keys(pattern)` cho cacheFlush — O(N) blocking (`redis.ts:59-68`).
- Offset pagination deep pages: products, audit-logs legacy (`products/route.ts:81`).
- `EInvoice` không unique `(orderId, orderKind)`; `GiftCardTransaction` unique void khi refId NULL.
- Customer.email index trùng với @unique (write amplification) (`schema.prisma:656,670`).
- PgBouncer transaction mode drop `-c timezone=UTC` (db.ts:32 vs pgbouncer `ignore_startup_parameters=options`).
- Đăng ký tài khoản trả 409 "Email already registered" (enumeration oracle, chấp nhận được).
- Reset token trong URL query (browser history/log).
- `Permissions-Policy: camera=()` (`next.config.ts:11`) có thể chặn camera POS scanner → cần `camera=(self)`.
- Không robots.txt/sitemap/generateMetadata cho storefront; không có product URL indexable.
- `maximum-scale=1` chặn pinch-zoom (WCAG 1.4.4) (`layout.tsx:22`); thiếu focus trap ở admin modals.
- `src/generated/prisma` 5.6MB committed; thiếu .gitignore cho `var/`, `logs/`.
- Order web không earn loyalty points (`vnpay.ts:69` mention fan-out chưa materialize — xác nhận ý định).
- Promo attribution: mọi line nhận `promoId` đầu tiên khi nhiều promo áp dụng (`pos.ts:152`).
- `webhooks/[id]` skip rule `pathname.includes(".")` trong proxy — footgun (`proxy.ts:58-60`).
- Hai luồng signup phân kỳ (api/auth vs lib/signup — bản sau không transaction).

---

## 8. Architecture Review

**Điểm mạnh:** service layer nhất quán (route mỏng → lib → prisma); dependency direction sạch (verify bằng grep: 0 vi phạm); job system DB-backed với lease/backoff/dead-letter thay vì setInterval trôi nổi; read replica routing có guard chặn write; Kafka/queue **chưa cần** ở quy mô hiện tại — DB job ledger là lựa chọn đúng, chỉ cần tách worker process khi job throughput tăng.

**Điểm yếu:**
1. Tenant enforcement **không central** — phụ thuộc kỷ luật từng route; kết quả là 4+ lỗ hổng thực tế. Cần Prisma client extension tự inject orgId/storeId (hoặc RLS) thay vì nhớ tay.
2. Không có module "payments" thống nhất: 3 provider settle mỗi bên một kiểu, 2 trong 3 quên amount check, tất cả quên order transition → hóa ra MONEY-001/002. Cần gom 1 `settlePayment()` dùng chung.
3. State machine Order không định nghĩa tường minh (không có PAID) — đã gây paid-after-cancel.
4. `xlsx 0.18.5` (SheetJS community) — đã cũ, có CVE đã biết (ReDoS/prototype pollution); cân nhắc exceljs hoặc SheetJS bản có bảo trì.

## 9. Database Review

Tốt: BigInt minor units toàn bộ + CHECK constraints tầng SQL; `InventoryBalance` FOR UPDATE; partition InventoryMovement với index chứa partition key; trigram GIN cho ILIKE; pgvector HNSW in-DB; keyset AuditLog; 29 migrations thật + verify-scale-indexes script chạy EXPLAIN thật.

Cần làm:
- Org-scope unique (`orgId, phone` / `orgId, sku` / `orgId, code`) — hiện là P1 SEC-004.
- Unique `EInvoice.orderId` (partial).
- Index `ProductVariant.productId`.
- Rewrite 4 builders trong reports.ts sang GROUP BY SQL (đã có mẫu chuẩn ở `reports/revenue/route.ts`).
- Prune: AuditLog (>90 ngày?), WebhookDelivery delivered (>30 ngày), job detach partition cũ.
- EXPLAIN nên chạy: dashboard low-stock query, storefront fuzzy tier với 1M rows, products admin EXISTS barcode, reports GROUP BY vs JS (đã có `npm run verify:indexes` làm khung).

## 10. Backend/API Review

Tốt: envelope ok()/apiError không leak DB error; validation thủ công fail-closed (không có zod — chấp nhận, nhưng zod sẽ giảm bug); rate limit Postgres-backed multi-instance; idempotency key mọi money path.

Thiếu: rate limit cho /api/export, /api/exports/misa, /api/reports (auth-gated nhưng nặng); pagination cursor chỉ có 1 nơi; MoMo/ZaloPay/T-VAN thiếu timeout; không circuit breaker cho external.

## 11. Frontend Review

Tốt: code-split Storefront monolith 2.500 dòng thành _components + dynamic import có chủ đích; offline POS PWA với Background Sync + idempotencyKey replay qua SW — thiết kế hay; 409 INSUFFICIENT_STOCK recovery UX tốt; zxing dynamic import; xlsx server-only.

Cần sửa: FE-001 (25 products); các list page không pagination UI; không loading.tsx/error.tsx (mọi page spinner trắng khi F5); POS `pay()` không double-submit guard client-side (đang dựa server); SEO storefront bằng 0.

## 12. Security Review

AuthN mẫu mực (scrypt N=2¹⁷ versioned, session hash-stored, reset single-use không enumeration). Injection sạch (toàn bộ tagged template, 0 rawUnsafe, 0 dangerouslySetInnerHTML, 0 child_process). Mass assignment không có. CSP/headers tốt. Secrets kỷ luật (AES-256-GCM envelope, .env không commit).

Lỗ hổng xếp hạng: SEC-001 (P0) → SEC-002/003/004 (P1) → SSRF, IP spoof, IDOR store-scope (P2). Chi tiết ở mục 4–6.

## 13. Scalability Review

Multi-instance gần sẵn sàng: rate-limit + job claims + business numbers đều Postgres-backed. Ba ngoại lệ đã ghi nhận: semaphore (SCALE-006), metrics per-process, in-process config cache 30s.

Bottleneck thứ tự khi tăng tải: (1) reports.ts JS-reduce → (2) export OOM → (3) fuzzy tier scan → (4) AuditLog/WebhookDelivery disk → (5) dashboard low-stock scan → (6) products offset pagination. Không cái nào chặn 1K–10K users; tất cả chặn trước 100K.

## 14. Performance Review

Chưa chạy benchmark — **không thể kết luận** về RPS thực tế. Cần: chạy k6 sẵn có (`loadtests/k6-catalog-checkout.js`, thresholds: catalog p95<500ms @1000 VU, checkout 50 VU 5xx=0) lên staging với data seed 100K products + 10M order items, và EXPLAIN ANALYZE các query ở mục 9. Điểm nóng đã xác định bằng đọc code: PERF-001 (no timeout), export customers, reports builders, fuzzy tier.

## 15. Concurrency & Race Condition Review

**Guarded tốt (verify từng interleaving):** POS sale idempotency + P2002 recovery; inventory FOR UPDATE; refund double-claim; loyalty earn/clawback; PO receive conditional updateMany; reservation release exactly-once; VNPay/MoMo settle claim; job lease.

**Unguarded:** MONEY-001 (paid-after-cancel), DATA-001 (transfers toàn bộ), INV-001 (counts), MONEY-003 (gift card adjust), RET-001 (returns), POS-001 (closeShift), EINV-001 (duplicate invoice), PAY-002, webhook delivery (REL-002), promo per-customer (PROMO-001). Chi tiết kèm interleaving ở các mục 4–6.

## 16. Reliability Review

- **DB down 30s:** health/ready 503 đúng; requests fail 500 sau 5s connect timeout mỗi request (không breaker, không shedding). nginx 60s timeout không giúp gì.
- **Redis down:** degraded sạch — mọi cache op swallow, fallback in-process/DB. Redis hiện chỉ là cache; chưa cần nó làm gì khác.
- **External API chết:** embeddings/mail/storefront degrade đúng; MoMo/ZaloPay create hang request (PERF-001); T-VAN hang giữ lease job 30'.
- **Server crash giữa transaction:** interactive tx rollback an toàn; job lease 30' tự nhả; POS offline queue qua SW replay đúng key.
- **Deploy/rollback:** runbook có, rollback forward-fix sound — nhưng manual 100%, không health-gated script.

## 17. Data Integrity Review

CHECK constraints tốt hơn chuẩn Prisma thông thường (nonnegative balances, value checks, gift card bounds). Holes: transfers (DATA-001), counts (INV-001), gift adjust (MONEY-003), returns trên CANCELLED (RET-001), reserved âm không CHECK chặn. `User.orgId? SetNull` — xóa org để lại user mồ côi không role.

## 18. Testing Review

38 vitest files (src/lib), thresholds 45/35/50/49% — **nhưng không CI nên thresholds không bao giờ chạy**. 14 integration scripts cần dev server + seeded DB, không teardown (chạy nhầm trên prod = ô nhiễm data). Gap nghiệm trọng: **billing.ts 0 test** (đường tiền đang bug MONEY-002), misa-zip/job, replenishment, db.ts, transfer lifecycle. k6 test thiết kế tốt (409 stock-race được coi là expected).

## 19. DevOps / Deployment Review

PM2 cluster max instances + kill_timeout 30s + pgBouncer transaction mode cấu hình đúng. Runbook + OPERATIONS docs chất lượng cao và trung thực. Nhưng: không Docker/CI/IaC; deploy tay 5 bước; liveness/readiness có nhưng `wait_ready: false` vô hiệu hóa health-gate của PM2; one-box (app+pg+redis+nginx) không có kịch bản tách.

## 20. Observability Review

Metrics tự viết tốt (p95 per-route, pool acquire wait, 429/5xx counters) + alert script exit-code pattern. Thiếu: Sentry/error tracking (stub TODO), request-id không lan vào lib logs (chỉ proxy→response), log rotation, APM. Chưa cần Prometheus/Grafana full — một Sentry + một Healthchecks.io cho check-alerts là đủ ở quy mô này.

## 21. Backup & Disaster Recovery

restore-drill.sh là điểm sáng (restore + migration-parity + row smoke). Nhưng backup nightly cùng box, 14 ngày retention, **không offsite, không WAL archiving/PITR, RPO ~24h, RTO chưa đo, drill "quarterly" là aspirational vì không CI**. Box chết = mất cả data lẫn backup.

## 22. Growth Simulation

| Scenario | Hệ thống hiện tại sẽ... |
|---|---|
| A. 100 users đồng thời | OK. PM2 cluster + PgBouncer đủ. |
| B. 1.000 users đồng thời | Catalog OK (cache 30s). Checkout semaphore 20/instance là nút thắt chủ động. Reports/expất bắt đầu đau. |
| C. 10.000 users đồng thời | Cần tách worker, shared semaphore (Redis), CDN cho storefront, read replica bắt buộc cho catalog. Fuzzy tier + reports JS-reduce sụp. |
| D. DB ×100 | Mục 13: reports → export → fuzzy → audit/webhook tables → dashboard scan, đúng thứ tự đó. |
| E. Traffic ×10 đột biến | Cache 30s + rate limit giữ catalog; checkout queue 429 sau 5s wait — hành vi chấp nhận được. |
| F. DB mất kết nối | 500s với 5s latency mỗi request; health/ready kéo instance khỏi rotation. Không breaker → pool exhaustion kéo dài. |
| G. Redis mất kết nối | Vẫn chạy, mất cache, load DB tăng ~các cache hit hiện tại. Tốt. |
| H. External timeout | MoMo/ZaloPay create: request hang vô hạn (không timeout). T-VAN: giữ job lease ≤30'. |
| I. Server crash | Tx rollback sạch; job lease tự nhả 30'; POS offline queue replay đúng idempotency. OK. |
| J. Deploy có bug | Rollback manual theo runbook (forward-fix). Không automated health-gate → window xấu tồn tại. |
| K. 2 users update cùng resource | POS/kho/PO/fulfillment: an toàn (claims + locks). Transfers/counts/gift-adjust/returns: corrupt (DATA-001, INV-001, MONEY-003, RET-001). |
| L. Malicious spam API | Rate limit tốt **nhưng** spoofable header (SEC-007) + semantic-search Gemini spend (unique query = paid API call). |

## 23. Bottleneck Analysis

Xem mục 13 (thứ tự) + 22. Bảng tổng hợp data growth:

| Thành phần | 10K records | 1M | 10M | 100M |
|---|---|---|---|---|
| DB queries | OK | OK (trừ dashboard scan) | reports/export đau | reports JS-reduce chết; cần partition Order/OrderItem |
| Search | trigram OK | OK | fuzzy tier giây | fuzzy = DoS; embed backfill 1M round-trips |
| Tables (AuditLog/WebhookDelivery) | OK | OK | disk pressure | unbounded, cần prune/detach |
| Images | (không có upload — product cover qua next/image) | — | — | — |
| Jobs | OK | OK | 10 jobs/5min tick cần tăng | cần worker process riêng + SKIP LOCKED |

## 24. Recommended Production Architecture

**Hiện tại đủ (MVP → Small):** Cloudflare → nginx → PM2 cluster (1 box) → Postgres + PgBouncer + Redis cache + DB job ledger. Không thêm gì.

**Small Production (100–10K users):** tách Postgres ra box riêng (hoặc managed PG với PITR); thêm Sentry; thêm CI chạy vitest + migrate diff; log rotation; offsite backup; Redis shared thay in-process semaphore; CDN trước storefront.

**Medium (10–100K):** 2+ app boxes sau LB; dedicated job worker (`JOB_SCHEDULER_ENABLED=true` riêng); reports GROUP BY + materialized view; meilisearch/typesense thay fuzzy tier; partition Order/OrderItem; object storage nếu bắt đầu có upload.

**Large (100K+):** queue thật (BullMQ trên Redis) thay DB job ledger; read replica pool; search cluster; RLS hoặc client-extension tenant guard; multi-region không cần.

## 25. Migration Roadmap

**Phase 0 — Fix Critical (trước production, 1–2 tuần):**
1. MONEY-001 (PAID state + settle claim + expiry skip + block payment URL cho CANCELLED)
2. MONEY-002 (billing settle gate wp.status)
3. DATA-001 (transfers rewrite với claims + applyMovement)
4. SEC-001 (webhooks/[id] withOrg + omit secret)
5. SEC-002 (export permission + org scope)
6. SEC-003 (invoices withOrg), SEC-004 (org-scoped uniques + phone upsert)
7. BILL-001 (wire requireOrgActive), EINV-001 (unique orderId), PRICE-001 (validFrom), FE-001 (POS page size)
8. CI tối thiểu: GitHub Actions chạy lint + vitest + build.

**Phase 1 — Hardening (2–4 tuần):** INV-001, MONEY-003, RET-001, POS-001, PAY-001/002/003, SEC-005/006/007/008, REL-001/002, PERF-001, Sentry, log rotation, offsite backup + PITR (managed PG), restore drill vào CI, billing/reports tests.

**Phase 2 — Scale (khi >1K users):** reports SQL rewrite (SCALE-001), export → job, prune/detach jobs (SCALE-002), shared semaphore, k6 vào CI Nightly, pagination cursor cho lists, SEO storefront.

**Phase 3 — Large:** meilisearch, queue BullMQ, partition Order/OrderItem, RLS, multi-box.

**Phase 4 — Future:** multi-region, CDC, warehouse analytics. Chưa cần.

## 26. Final Production Verdict

### ❌ NO — Chưa thể đưa lên production ngay bây giờ (cho kịch bản multi-tenant SaaS)

Lý do quan trọng nhất, theo thứ tự:
1. **Có 3 đường thất thoát tiền đã xác nhận bằng code**: capture tiền trên đơn đã hủy không refund (MONEY-001), invoice PAID trên thanh toán thất bại (MONEY-002), gift card re-credit (MONEY-003). Đây không phải rủi ro lý thuyết — interleaving cụ thể đã được trace.
2. **Tenant isolation không đáng tin**: 1 route trả HMAC secret chéo org, export PII không quyền, e-invoice đọc/cancel chéo tenant, revenue report thấy tất cả org. Với SaaS multi-tenant, đây là điểm chết.
3. **Không có CI** trong khi 38 test file tồn tại — mọi guarantee về regression hiện tại là tự nguyện.

**Sau Phase 0 (fix P0 + CI), hệ thống đạt ⚠️ YES — phù hợp production quy mô nhỏ** vì nền tảng bên dưới (idempotency, locking, migrations, runbook, rate limiting, observability khung) đã được xây đúng tư duy production hiếm thấy ở dự án ở giai đoạn này.

## 27. Top 10 Things That Must Be Fixed First

| # | Vấn đề | Severity | Production Impact | Scalability Impact | Effort | Priority |
|---|--------|----------|-------------------|--------------------|--------|----------|
| 1 | Paid-after-cancel: settle không transition Order, expiry hủy đơn đã nhận tiền (không có state PAID) | 🔴 P0 | Mất tiền trực tiếp, không refund path | — | Medium | P0 |
| 2 | Billing invoice PAID dù VNPay fail (`settleBillingPayment` không check wp.status) | 🔴 P0 | Doanh thu subscription = 0, org nợ vẫn chạy | — | Low | P0 |
| 3 | Transfers state machine không claim: double-ship, receivedQty không validate, cancel sau ship mất hàng | 🔴 P0 | Data corruption kho, oversell | — | Medium | P0 |
| 4 | `webhooks/[id]` IDOR: leak HMAC secret, redirect/rotate/delete chéo org | 🔴 P0 | Security breach chéo tenant | — | Low | P0 |
| 5 | `/api/export`: PII export không permission/org scope + OOM query | 🟠 P1 | PII breach, OOM | Unbounded | Low–Med | P1 |
| 6 | Tenant isolation holes: invoices IDOR, reports/revenue no org filter, global phone/sku uniques, webhook orgId "default" | 🟠 P1 | Chéo tenant | — | Medium | P1 |
| 7 | `requireOrgActive` dead code — suspension/plan limits không enforce | 🟠 P1 | Revenue leak | — | Low | P1 |
| 8 | E-invoice duplicate issuance (no unique orderId) + SENDING stuck + refund không cancel invoice | 🟠 P1 | Rủi ro tuân thủ thuế | — | Low–Med | P1 |
| 9 | stockOnHand report crash (cột không tồn tại) + reports JS-reduce + export take:10000 silent truncate | 🟠 P1 | Report chết; sai số nghiệp vụ | O(10⁷) rows | Medium | P1 |
| 10 | POS chỉ load 25 products (barcode scanmiss) + không CI | 🟠 P1 | POS unusable ở catalog > 25 | Regression risk không được guard | Low | P1 |

Bảng scale:

| Scale | Hiện trạng | Bottleneck | Cần thay đổi |
|-------|-----------|------------|--------------|
| 1K users | Chạy tốt sau Phase 0 | Export/reports nặng | Sentry, CI, offsite backup |
| 10K users | Ổn định | Checkout semaphore, reports cache miss | Shared semaphore, reports SQL, k6 định kỳ |
| 100K users | Cần thay đổi kiến trúc | Job ledger, fuzzy search, AuditLog growth | Worker riêng, meilisearch, prune jobs, partition Order |
| 1M users | Chưa thiết kế cho mức này | DB write throughput, search, queue | BullMQ, replica pool, RLS, multi-box, CDN |

---

*Phương pháp: 6 luồng audit song song (kiến trúc/backend, database, security, concurrency/business logic, frontend, DevOps/DR), đọc code với file:line evidence, enumerate 75 API routes, 83 models, 30 migrations. Không chạy benchmark — mọi nhận định hiệu năng chịu tải là phân tích tĩnh, cần k6 + EXPLAIN ANALYZE để xác nhận (mục 14).*
