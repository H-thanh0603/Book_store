# Báo cáo rà soát kiến trúc hệ thống — Backend, Database, Bảo mật, Hiệu năng

> Phạm vi: toàn bộ `bookstore/` — 40 API routes, 17 lib modules, Prisma schema (50 models, 14 migrations), frontend (26 pages, 4 components), seed/scripts, CI, tài liệu vận hành.
> Phương pháp: đọc trực tiếp mã nguồn lõi + 2 luồng audit song song cho routes còn lại và frontend/seeds. Đã đối chiếu với `AUDIT_REPORT_2026-08-23.md` — phần lớn mục P0/C của báo cáo cũ **đã được sửa** trong các commit `feat(agent1): P0…`, `fix(agent2/3)`, `feat(agent4)`.

---

## 1. Đánh giá tổng quan kiến trúc

**Kiến trúc hiện tại:** Modular monolith Next.js 16 App Router (API Route Handlers) + Prisma 7 trên PostgreSQL (driver adapter `@prisma/adapter-pg`, external pool), frontend client components gọi API same-origin, scheduler in-process qua `instrumentation.ts`.

### Điểm mạnh (giữ nguyên, đừng "tối ưu" phá vỡ)

| Thành phần | Vì sao tốt |
|---|---|
| `lib/inventory.ts` — ledger-first | Mọi thay đổi tồn kho đi qua một điểm `applyMovement`: atomic `UPDATE…RETURNING`, chặn âm kho (`INSUFFICIENT_STOCK`), luôn ghi `InventoryMovement` |
| Kỷ luật idempotency | `Payment.idempotencyKey @unique` + recovery P2002 trong `completeSale`; partial unique index `Order.externalId WHERE LIKE 'storefront:%'`; `IntegrationJob.idempotencyKey` claim trước xử lý webhook |
| Claim pattern trạng thái | Các flow cốt lõi (POS refund, shift, transfer, fulfillment, PO receive, adjustment) dùng `updateMany({where: {id, status}})` + kiểm tra count=1 — chống double-fire đúng cách |
| Ràng buộc DB | CHECK constraints: balance ≥ 0, gift card balance ≤ initial, points ≥ 0, receivedQty ≤ quantity, location XOR owner; partial unique "một shift mở/terminal"; partial index movement SALE |
| Bảo mật nền tảng | scrypt + session token hash-SHA256 trong DB, cookie httpOnly/SameSite=Lax, login rate-limit kép (IP + account), HMAC timing-safe cho webhook, AES-256-GCM seal credentials (`secret-box.ts`), CSRF origin check ở `proxy.ts`, security headers, apiError không lộ lỗi 500 |
| Tiền = BigInt minor units + serialize an toàn (>2^53 thành string); `nextBusinessNumber` upsert atomic |
| Job runner có lease/backoff/workerId; RateLimitBucket dùng SHA-256 digest (không lưu IP/email thô) |
| CI thật: Postgres service + migrate deploy + seed + 4 bộ integration test + build |

**Kết luận kiến trúc:** mô hình hiện tại là đúng cho quy mô này. Không cần microservice, không cần CQRS. Vấn đề còn lại nằm ở **độ phủ nhất quán của các pattern tốt đã có**, chứ không phải sai thiết kế.

---

## 2. Phát hiện mức CAO (cần sửa trước khi production)

| # | Vị trí | Vấn đề |
|---|---|---|
| H1 | `src/app/api/storefront/track/route.ts` + `src/app/track/page.tsx` | **Rò rỉ PII công khai.** Endpoint không auth, không rate-limit, khớp đơn theo `contains` *một phần* tên hoặc SĐT và trả về họ tên + SĐT + địa chỉ + toàn bộ item/giá của khách. Gõ "Nguyen" hoặc "09" là harvest được dữ liệu khách hàng. Sửa: yêu cầu khớp chính xác số đơn + SĐT (cả hai), chỉ trả trạng thái đơn, giới hạn theo channel WEB, thêm rate-limit như checkout. |
| H2 | `src/app/api/orders/route.ts:11–16` | **Bỏ qua store scope.** `requirePermission("pos.sell", body.storeId)` với `storeId` do client gửi — nếu bỏ trống thì tham số là `undefined` và việc bind cửa hàng bị skip (`auth.ts:88`). Kết hợp truyền tuỳ ý `locationId` vào `createReservedOrder` → user scoped có thể đặt trước tồn kho ở kho/cửa hàng khác. Sửa: resolve scope bằng `resolveStoreScope(auth, body.storeId, …)` và `assertStoreAccess` lên location thực tế sau khi load. |
| H3 | `src/app/api/replenishment/route.ts:34–74` | **Accept không claim/idempotent.** Không kiểm tra suggestion còn PENDING, tạo PO/transfer xong ghi đè status vô điều kiện → double-submit tạo PO/transfer trùng lặp (ảnh hưởng tiền). Sửa: `updateMany({where:{id, status:"PENDING"}})` claim trước, đồng thời `assertStoreAccess` lên `locationId`. |
| H4 | `src/app/api/purchase-orders/lifecycle/route.ts:54–63` | **Trả tiền đôi.** `pay` không kiểm tra `payableStatus`, dùng `update` thường không transaction → chạy lại = trả lại lần nữa, mỗi lần một dòng audit "po.paid". `record_invoice` còn reset `unpaid` sau khi PAID. Sửa: claim `updateMany({where:{id, payableStatus:"unpaid"}})` trong `$transaction`, chặn invoice-edit sau PAID. |
| H5 | `src/lib/orders.ts:109–110` | **Promotion usageLimit bypass qua web.** `completeSale` (POS) claim atomic `usedCount < usageLimit`, nhưng `createReservedOrder` chỉ `update({usedCount:{increment}})` không điều kiện → promo có giới hạn vẫn bị áp vượt hạn mức bởi đơn WEB/webhook. Sửa: dùng cùng pattern claim như POS. |

## 3. Phát hiện mức TRUNG BÌNH

**Bảo mật / dữ liệu**
- `gift-cards` adjust: check-then-increment trên balance cũ, không idempotency → race đưa balance âm (CHECK constraint sẽ chặn nhưng thành 500) và retry apply đôi.
- `returns` create: guard tổng trả ≤ đặt hàng tính trong READ COMMITTED không lock → over-return/over-refund khi concurrent.
- `promotions` route: không store-scoping nào — user scoped thấy/toggle gắn promo mọi cửa hàng; POST nhận `storeIds` tùy ý.
- `customers` POST create: sinh mã `CUS-` bằng `count()+1` → race trùng mã → P2002 500 (các nơi khác đã dùng `nextBusinessNumber`).
- `seed.ts:101–107` upsert `update:{passwordHash}` — mỗi lần seed chạy lại là reset mật khẩu 5 tài khoản về `$SEED_USER_PASSWORD`; chưa có guard chặn seed ở prod. Trang `/login` liệt kê email demo kèm vai trò (enum account trên mặt public).

**Hiệu năng (ở 10x–100x dữ liệu)**
- `loss-prevention.ts` nạp toàn bộ transaction/movement 30 ngày vào RAM để tính % giảm giá trong JS → đẩy xuống SQL aggregate.
- `inventory/operations` view `aging`: `groupBy` toàn bộ outbound movements từ trước đến nay, không mốc thời gian → full-scan khi ledger lớn.
- `replenishment.ts` nạp toàn bộ balances + mọi supplier price, upsert từng row bằng `Promise.all` → batch/cursor + bounded concurrency.
- Thiếu index FK `variantId` ở các bảng item (OrderItem, PosTransactionItem, ReturnItem, PurchaseOrderItem, StockTransferItem, GoodsReceiptItem…) — tra cứu ngược "variant X nằm ở những đơn nào" sẽ seq-scan.
- GET `/api/storefront` (catalog public, ILIKE `%q%`) không rate-limit/cache — chịu tải tra tấn tốt hơn nếu cache CDN 30–60s.

**Độ tin cậy**
- `analytics` dùng `setMonth(-1)` — cuối tháng 31/3 cho kỳ tương lai (31/3 → 01/05); nên dùng phép trừ an toàn lịch/UTC.
- `db.ts`: `pg.Pool` chưa đăng ký handler `'error'` — idle client lỗi mạng có thể làm crash process Node.
- Timezone: schema cam kết UTC nhưng dashboard `setHours(0,0,0,0)` theo giờ server — báo cáo lệch nếu deploy ngoài múi giờ VN. Quy chuẩn `Asia/Ho_Chi_Minh` rõ ràng ở một chỗ dùng chung.
- `TRUST_PROXY_HEADERS=false` khiến mọi client dùng chung bucket `"untrusted-proxy"` (20 login/phút cho cả hệ thống, không phân biệt ai); bật true sau reverse proxy thì XFF giả mạo vượt per-IP. Cần documented deployment contract.
- CI đang đỏ: 7 ESLint errors (6 `any` + setState-in-effect) tại `shop`, `bestsellers`, `reading-challenge`, `gift-finder`, `stores` — đến từ commit đại tu UI gần nhất.

## 4. Phát hiện mức THẤP (chọn lọc)

- Robustness: hàng loạt route ghi thẳng FK/body không kiểm tra → lỗi DB lộ ra 500 thay vì 400/404 (suppliers, stores, promotions, supplier-returns, inventory-counts, gift-cards code/expiresAt, products PATCH whitelist không validate kiểu/enum, barcode gắn vào variant của product khác).
- Truy vết: actor hardcode `"replenishment"`, `"wms-scan"`, `"wms-complete"` trong ledger/audit — mất dấu người thật.
- `catalog` PATCH category cho đặt `parentId` không kiểm tra chu kỳ cây.
- `verifyPassword` throw (500) nếu hash trong DB malformed thay vì trả false.
- `purchasing.ts`: `receiveGoods/dispatchTransfer/receiveTransfer` là dead code trùng logic route — đã divergent một thời gian; xoá hoặc route gọi service duy nhất.
- `Order.externalId` chỉ unique riêng `storefront:%` — marketplace externalId không unique (được che bởi job claim; chấp nhận được nhưng nên biết).
- Frontend: nav hiển thị full menu admin cho anonymous (backend vẫn chặn); POS fail im lặng khi hết phiên; auto-PO `PO-AUTO-*` chỉ là hiệu ứng giả không gọi API; nhãn barcode in thanh trang trí không khớp giá trị (không scan được); đơn hàng hardcode SĐT `0901234567`.
- Session: TTL 12h cố định, không có revoke-tất-cả/khi đổi mật khẩu; CSP tối thiểu (chưa có script-src), HSTS để tầng TLS.
- `OPERATIONS.md` mục Monitoring còn chỉ `/login` làm health probe trong khi `/api/health/live|ready` đã có; backup hướng dẫn dump local, chưa có offsite/RPO-RTO/restore drill.

## 5. Lộ trình đề xuất

> **TRẠNG THÁI: HOÀN THÀNH TOÀN BỘ** — P0 (`ce34f66`), P1 (`ab6f322`), P2 (`9802738`).
> Mỗi nhóm đều có xác minh tích hợp trên database riêng + quality gates (tsc / eslint --max-warnings=0 / build / 3 bộ test).

**P0 — chặn trước khi mở production (1–2 ngày)**
1. Sửa H1 track endpoint (khớp chính xác number+phone, chỉ trả trạng thái, rate-limit).
2. Sửa H2 orders scope + H5 promo claim + H4 pay claim + H3 replenishment claim (cùng một pattern, nhanh).
3. Bật lại quality gate: sửa 7 lint errors, giữ CI xanh.
4. Thêm `pool.on("error")` + guard seed prod (fail nếu NODE_ENV=production và thiếu flag rõ ràng).

**P1 — trước go-live thực (1 tuần)**
5. Store-scope cho `promotions`, `replenishment.accept`; idempotency key cho gift-card adjust.
6. Gộp validation body vào helper chung (loại nhóm lỗi 500-do-FK/type); chuẩn hoá timezone.
7. Rate-limit + cache cho catalog public; quyết định contract `TRUST_PROXY_HEADERS` trong runbook.
8. Bổ sung index FK variantId cho các bảng item (migration online, CREATE INDEX CONCURRENTLY nếu dữ liệu lớn).

**P2 — hardening khi tăng trưởng**
9. Đẩy loss-scan/aging xuống SQL aggregate; batch replenishment; cursor pagination cho AuditLog.
10. Session management: revoke-all, rotation; CSP đầy đủ; backup offsite + restore drill định kỳ; dọn dead code `purchasing.ts`; xoá tính năng giả trên storefront UI hoặc nối vào API thật.

---

*Kiểm chứng kèm theo: `tsc --noEmit` sạch; `eslint` 7 errors / 79 warnings (frontend); không tìm thấy XSS sink, secret hardcode, SQL injection (mọi raw SQL đều tagged template có tham số).*
