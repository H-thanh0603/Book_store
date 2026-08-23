# Production Readiness Audit — Book_store

> **Cập nhật sau hardening 2026-08-23:** phần Executive Summary và roadmap gốc bên dưới là ảnh chụp trước remediation. Checkout hiện tại đạt **82/100 — launchable with caveats**. Các blocker C-01/C-02/C-03/C-04/C-05/C-06/C-07/C-08 và H-01/H-02/H-03/H-05/H-07/H-08/H-09/H-10 đã được sửa hoặc feature chưa có worker đã fail-closed. Bằng chứng mới: lint 0 warning, typecheck/build pass, P0/storefront/hardening pass, 14 migration dựng thành công trên database trống. Điều kiện vận hành còn lại nằm ở `bookstore/RUNBOOK.md`: cấu hình secret production, chạy mã hóa integration secrets, gắn log/metric vào nền tảng cảnh báo và thực hiện restore drill thật. H-04 chỉ hoàn tất sau khi operator chạy lệnh rotation bằng production key.

Ngày audit: 2026-08-23  
Phạm vi: toàn bộ code ứng dụng hiện tại (`src/app`, `src/lib`, Prisma schema/migrations/seed, scripts, CI, config và runbook). Mã Prisma trong `src/generated` được đối chiếu với schema nhưng không review thủ công vì là generated output.  
Trạng thái worktree: audit trên checkout hiện tại có thay đổi frontend chưa commit; báo cáo không sửa source code hay database.

## A. Executive Summary

**Kết luận: BLOCKED — chưa đủ điều kiện production. Production readiness: 4/10 (38/100).** Build và typecheck chạy được, nhưng hệ thống hiện có đường gây trùng đơn/trùng hoàn tiền, phân quyền chéo cửa hàng, scheduler sai logic, migration không tái tạo được schema và credential demo có thể đăng nhập tài khoản owner.

| Trục | Điểm | Nhận định |
|---|---:|---|
| Production readiness | 4/10 | Chạy được ở demo/single node; chưa an toàn để nhận giao dịch thật |
| Security | 4/10 | Có server-side RBAC và HMAC, nhưng còn default credential, IDOR và thiếu chống brute force |
| Architecture | 5/10 | Modular monolith phù hợp quy mô; boundary service/API chưa nhất quán |
| Database | 4/10 | Có FK/unique/ledger; thiếu CHECK, concurrency guard và migration parity |
| Performance | 5/10 | Đủ với dữ liệu hiện tại; batch jobs/search/report chết trước khi tăng 100x |
| Reliability | 3/10 | Job/retry/idempotency/health/backup/observability chưa đạt production |
| Scalability | 4/10 | Single-node có ghi rõ; nhiều instance sẽ chạy job trùng và mở quá nhiều DB connection |
| Maintainability | 5/10 | TypeScript strict, domain helpers có ích; route/UI lớn, validation và flow bị duplicate |

Kiến trúc hiện tại:

```text
Client-only pages
    -> Next.js Route Handlers
       -> auth/api helpers
       -> [một số domain service | Prisma trực tiếp]
          -> PostgreSQL

instrumentation.ts -> in-process timer -> JobRun -> replenishment/loss jobs
webhook/integrations -> IntegrationJob (không có worker outbound)
```

**GIỮ NGUYÊN:** modular monolith Next.js + PostgreSQL; money dùng `BIGINT`; inventory ledger tập trung qua `applyMovement`; parameterized Prisma SQL; HMAC kiểm tra trên raw webhook body; server-side permission checks. Không có lý do chuyển microservices/Redis/Kafka/Kubernetes ở quy mô hiện tại.

### Evidence đã chạy

| Kiểm tra | Kết quả |
|---|---|
| `npx prisma validate` | PASS |
| `npx prisma migrate status` | 9 migration applied, nhưng không phát hiện schema drift mô tả ở C-02 |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS, 52 routes/pages generated |
| `npm run test:phase3` | PASS; chỉ kiểm tra công thức replenishment |
| `npm run lint` | FAIL: 7 errors, 39 warnings |
| `npm audit --omit=dev` | 3 high advisories qua `prisma -> @prisma/config -> deepmerge-ts` |
| PostgreSQL metadata/data checks | 70 tables, 0 CHECK constraints; 42 expired sessions; 1 marketplace order thiếu `externalId` |

`test:p0` không chạy vì script sửa trực tiếp database hiện tại và không cleanup (`scripts/test-p0.ts:59-135`). Đây là thiếu sót test isolation, không phải test pass.

## B. Critical Issues

| ID | Loại | Vị trí | Vấn đề và tác động | Cách sửa |
|---|---|---|---|---|
| C-01 | Bug/Security | `prisma/seed.ts:86-105`, `src/app/login/page.tsx:21,198` | Seed tạo owner/manager/cashier cùng mật khẩu công khai `Passw0rd!`; UI còn prefill mật khẩu. Nếu seed chạy ở production, attacker có owner access. | Cấm seed demo trong production; lấy bootstrap password một lần từ secret manager/env, bắt đổi ngay; bỏ prefill và rotate mọi account hiện tại. |
| C-02 | Bug/Deployment | `prisma/migrations/20260822160800_agent4_integration_providers/migration.sql` (0 dòng), `prisma/schema.prisma:985-996` | Repo không có SQL tạo `IntegrationProvider`, dù DB hiện tại có bảng. Fresh DB từ migration sẽ thiếu bảng; endpoint integration/webhook lỗi runtime. | Tạo migration forward-only mới để tạo bảng/index; thêm CI schema parity/clean-database smoke test. Không sửa migration đã applied. |
| C-03 | Bug/Reliability | `src/lib/jobs.ts:20-55`, `src/instrumentation.ts:4-13` | Tick đọc một `PENDING` run nhưng gọi `runJob(kind)` để tạo run mới; run cũ không bao giờ được claim/update. DB thật đã có 2 PENDING cố định và 41 SUCCEEDED lặp. Failure tạo thêm PENDING, `attempts` không theo đúng run. | Claim chính row đến hạn bằng conditional update/`FOR UPDATE SKIP LOCKED`; chạy và hoàn tất cùng `runId`; không giữ transaction suốt job; có lease/heartbeat. |
| C-04 | Bug/Data loss | `src/app/api/integrations/route.ts:57-94`, `src/lib/jobs.ts:6-11` | `queue_sync` cập nhật watermark ngay khi chỉ tạo job; không có worker xử lý loại integration. DB thật có `SYNC_CATALOG PENDING`. Dữ liệu sau watermark có thể bị bỏ vĩnh viễn. | Chỉ advance watermark sau provider ACK; thêm một worker đơn giản/cron dispatch có retry/idempotency, hoặc bỏ feature khỏi production cho tới khi có connector thật. |
| C-05 | Bug/Data integrity | `src/app/api/integrations/webhook/route.ts:30-57`, `src/app/api/integrations/route.ts:113-137`, `src/lib/orders.ts:7-15` | Webhook/import tạo order trước khi atomically reserve idempotency key. Hai delivery đồng thời hoặc crash sau order commit có thể tạo nhiều order. `externalId` không nằm trong `CreateOrderInput`, nên marketplace order không ghi `Order.externalId`; DB đã có 1/1 marketplace order bị thiếu. | Insert/claim event trước, unique theo `(provider,eventId)`; tạo order và mark event trong cùng transaction/outbox; persist unique `(provider,externalId)` trên order/integration mapping. |
| C-06 | Bug/Security | `src/lib/auth.ts:76-85`, `src/app/api/pos/route.ts:43-50`, `src/lib/pos.ts:348-377`, `src/app/api/transfers/route.ts:120-127` | `requirePermission(code)` coi role scoped là hợp lệ khi request không truyền `storeId`. Store-A user có thể gọi trực tiếp API không scope: đóng shift Store B, xem transfers/counts/tasks của cửa hàng khác. Đây là backend IDOR; ẩn nút frontend không bảo vệ. | Không cho scoped role thỏa unscoped mutation; luôn load entity rồi `assertStoreAccess`; scope mọi list theo permission. Thêm matrix test cho từng endpoint/method. |
| C-07 | Bug/Money & stock | `src/app/api/returns/route.ts:59-96`, `src/app/api/fulfillment/route.ts:15-110`, `src/app/api/transfers/route.ts:71-107`, `src/app/api/purchase-orders/route.ts:102-170` | Các flow đọc status rồi update không có row lock/version/conditional `WHERE status=...`. Hai request đồng thời có thể refund/receive/ship/transfer/receive PO hai lần và ghi inventory/money ledger hai lần. Transaction riêng lẻ không ngăn write skew này. | Dùng conditional update (`updateMany where id+expectedStatus`, kiểm tra count=1) trước side effect hoặc `SELECT FOR UPDATE`; thêm idempotency key cho command có retry. |
| C-08 | Bug/Data integrity | `src/lib/pos.ts:97-107,169-173,175-202`, `src/app/api/pos/route.ts:84-103` | Gift-card/loyalty check-then-increment không lock; inventory movements gắn transaction bằng query “refId null trong 5 giây”, có thể gắn movement của sale đồng thời khác. Audit nằm ngoài sale transaction; sale commit nhưng audit lỗi trả 500, client retry có thể bán lần hai vì idempotency key không bắt buộc. | Tạo transaction ID trước và truyền thẳng vào movement; bắt buộc một command idempotency key cho sale; conditional debit gift card/points; đưa audit cùng transaction hoặc tách audit failure khỏi response đã commit. |

## C. High Priority Issues

| ID | Loại | Vị trí | Tác động | Khuyến nghị |
|---|---|---|---|---|
| H-01 | Bug/Security | `src/app/api/auth/route.ts:8-20`, `src/app/nav.tsx:61-68` | Logout gửi chỉ `action`, nhưng API bắt `email/password` trước khi xét action; session không bị hủy. | Chỉ validate credentials trong nhánh login; test logout cookie/session deletion. |
| H-02 | Risk/Security | `src/app/api/auth/route.ts:6-16` | Không rate limit/backoff/lockout; login brute force không bị chặn. | Rate limit theo IP + normalized account, exponential delay ngắn, audit thất bại; dùng reverse proxy hoặc DB-backed limiter đơn giản cho single node. |
| H-03 | Bug/Information leak | `src/lib/api.ts:4-15` | Comment nói không leak DB error nhưng response 500 vẫn trả `e.message`; Prisma/internal parsing message có thể lộ schema. | Log internal error với request ID; client 500 chỉ nhận message cố định. |
| H-04 | Risk/Secrets | `prisma/schema.prisma:985-995`, `src/app/api/integrations/route.ts:43-53` | Connector credentials và webhook secret lưu plaintext JSON/TEXT; GET có ẩn nhưng DB dump/admin read vẫn lộ. | Encrypt application-level bằng KMS/key env có rotation; không log payload/secret; tách write-only DTO. |
| H-05 | Bug/RBAC schema | `prisma/schema.prisma:101-110`, initial migration `:741-747` | PK `(userId,roleId)` không cho cùng role ở nhiều store; FK store `ON DELETE SET NULL` có thể biến role scoped thành global. | Dùng surrogate id hoặc key hỗ trợ scope; store delete phải RESTRICT/CASCADE, tuyệt đối không widen thành NULL/global. |
| H-06 | Bug/Inventory | `src/app/api/transfers/route.ts:84-101`, `src/lib/purchasing.ts:176-229` | Hai implementation transfer lệch nhau. Route đang dùng không tăng/giảm `inTransit`; service cũ có logic đúng hơn nhưng hầu như không được gọi. Báo cáo incoming/replenishment sai. | Chọn một service duy nhất; route gọi service; ledger `TRANSFER_OUT` + destination `inTransit`, rồi `TRANSFER_IN` + decrement inTransit. |
| H-07 | Risk/Database | `prisma/schema.prisma` toàn bộ money/quantity/status-string models; PostgreSQL metadata | DB có **0 CHECK constraint**. Raw SQL/bug có thể tạo balance âm, quantity <=0, percentage >100, stock location vừa store vừa warehouse. Dữ liệu hiện tại chưa có anomaly. | Thêm CHECK theo từng nhóm sau khi preflight data; giữ validation app tại trust boundary. |
| H-08 | Bug/Quality gate | frontend files nêu trong lint output, `.github/workflows/ci.yml:1-31` | Current checkout lint fail 7 lỗi/39 warnings, nên CI sẽ đỏ dù local `next build` pass. | Sửa 7 errors trước; dọn unused imports; không tắt rule hàng loạt. |
| H-09 | Risk/Operations | `docs/OPERATIONS.md:40-56` | `/login` chỉ chứng minh process sống, không chứng minh DB; backup ghi dump ở cwd nhưng retention xóa `backups/*.dump`; không có restore drill/RPO/RTO/offsite/encryption. | `/health/live` và `/health/ready` (DB query + timeout); sửa cùng backup directory; chạy restore drill định kỳ. |
| H-10 | Risk/Observability | `src/lib/api.ts:7`, `src/instrumentation.ts:12`, toàn bộ API | Chỉ có unstructured `console.error`; không request/correlation ID, metrics, alerting hay exception tracker. 2 giờ sáng không đủ dữ liệu nối request → transaction → job. | Structured JSON logs, request ID response header, latency/error metrics, job-age/failed-job alerts, redact PII/secrets. |

## D. Medium / Low Priority

| ID | Mức | Loại | Vị trí | Nhận định |
|---|---|---|---|---|
| M-01 | Medium | Maintainability | 31 `src/app/api/**/route.ts`, `src/lib/*` | Business logic lúc ở service, lúc nằm trực tiếp route; purchase/transfer có duplicate và divergent behavior. Refactor theo flow đang sửa, không rewrite toàn bộ. |
| M-02 | Medium | Validation | Hầu hết API dùng `await req.json()` + kiểm tra thủ công | Validation không đồng nhất; invalid JSON thành 500; enum/date/string length/unknown fields chưa nhất quán. Dùng shared schemas hoặc minimal parser hiện có, không cần framework lớn. |
| M-03 | Medium | Frontend | mọi `src/app/*/page.tsx` là client component 200–733 dòng | Fetch/state/form/table trộn trong một file, typed DTO không shared; lỗi permission/loading/error không nhất quán. Tách khi page tiếp tục thay đổi, không tạo design system mới ngay. |
| M-04 | Medium | UX/Security boundary | `src/app/nav.tsx:31-44,99-119` | Nav hiện mọi module cho mọi role; API phải chặn nhưng user gặp 403 muộn. Filter link theo permission để UX tốt hơn, vẫn giữ backend checks. |
| M-05 | Medium | Session hygiene | `src/lib/auth.ts:47-73`, DB anomaly query | 42 expired sessions vẫn tồn tại; token lưu plaintext. Hash token ở DB và cleanup theo lịch; logout-all/password-change revoke sessions. |
| M-06 | Medium | API contract | `src/lib/api.ts:21-32` và nhiều `Number(bigint)` | JSON money chuyển `BIGINT` thành Number có thể mất precision > `2^53-1`; accounting aggregates dễ chạm trước. Dùng decimal string trong DTO. |
| M-07 | Medium | Config | `src/lib/api.ts:46-59` | Cache config không TTL/invalidation; nhiều instance đọc giá trị khác nhau sau update. Thêm TTL ngắn khi chạy >1 instance. |
| M-08 | Low | Product polish | `src/app/layout.tsx:15-24` | Metadata còn “Create Next App”, `lang="en"` dù UI tiếng Việt. | Đổi title/description và `lang="vi"`. |

## E. Database Findings

| File/query/table | Vấn đề | Nguyên nhân | Tác động 10x/100x | Cách sửa và trade-off |
|---|---|---|---|---|
| `IntegrationProvider`; empty migration | Schema/migration không parity | Bảng có vẻ được tạo bằng db push/manual, không có migration SQL | Fresh deploy runtime failure | Migration forward-only; thêm clean-schema test. Một migration mới, không edit lịch sử. |
| `UserRole` | PK và delete semantics sai domain | Null vừa mang nghĩa global, vừa là FK optional | Không gán cùng role nhiều branch; delete store có thể elevate privilege | Redesign scope key; RESTRICT/CASCADE. Migration cần preflight duplicates và role semantics. |
| Money/quantity tables | Không CHECK constraint | Chỉ dựa app validation | Một code path/raw import sai làm ledger hỏng | CHECK `amount/value/quantity` phù hợp nghiệp vụ, balance/reserved nonnegative, `damagedQty <= quantity`; tăng nhẹ cost write nhưng chặn corruption tại nguồn. |
| `StockLocation` | `type` là String, không constraint store/warehouse XOR | Domain invariant không nằm DB | Location vô chủ/hai chủ làm scope và stock sai | Enum hoặc CHECK type; CHECK đúng một owner theo type. Migration risk vừa vì cần data preflight. |
| `Return` create/refund; `PurchaseOrderItem` receive | Check-then-write không serialize | Transaction mặc định không khóa row điều phối | Double refund/over-return/over-receipt | Lock aggregate/root row hoặc conditional state claim; unique idempotency command. Lock scope nhỏ để tránh contention. |
| `Payment.idempotencyKey` | Unique tốt nhưng optional và gắn từng payment | Command sale không có key bắt buộc | Double click không key vẫn tạo hai sale; split payment semantics mơ hồ | `PosTransaction.commandId @unique` bắt buộc từ client/terminal. Thêm một index/write cho mỗi sale, đáng đổi lấy exactly-once effect. |
| `Order` list/reconcile | Thiếu `(storeId, createdAt)` và marketplace external uniqueness | Existing index chỉ status/customer | Seq scan + sort khi orders lớn; duplicate external orders | Index `(storeId, createdAt DESC)` cho `/api/orders`; unique mapping `(provider, externalId)`. Tăng write/index storage mỗi order. |
| `PosTransaction` reports | Thiếu index theo status/store/time | Dashboard/loss/accounting filter status + time | Seq scan hiện đã thấy trong EXPLAIN; lớn lên sẽ kéo DB CPU | `(storeId,status,createdAt DESC)` cho dashboard scoped; chỉ thêm global `(status,createdAt)` nếu global reports đo được chậm. Mỗi sale chịu thêm index write. |
| `InventoryMovement` replenishment/loss | Existing `createdAt` không cover type + group keys | 30-day SALE scan/group là query nóng của nightly job | Ledger lớn làm job kéo dài, chồng lịch | Partial index `("createdAt", "variantId", "locationId") WHERE type='SALE'`; giảm overhead so với full composite nhưng vẫn thêm write cho sale. |
| `SupplierProductPrice` latest-by-variant | Index hiện là `(supplierId,variantId,recordedAt)` nhưng query filter `variantId IN` | Leading column không khớp query `replenishment.ts:37-45` | Full scan/sort price history | `(variantId, recordedAt DESC)`; write thấp nên trade-off nhỏ. |
| `AuditLog` feed | Không index `createdAt`; offset pagination | Endpoint sort newest và deep `skip` | Seq scan/sort, offset tăng tuyến tính | `(createdAt DESC,id)` + cursor pagination. Thêm write index cho mọi audit row. |
| Product/customer search | `contains insensitive` không dùng btree name index | Substring search | Full scan khi 100k+ catalog/customer | Chỉ thêm `pg_trgm` GIN sau khi search latency/size cần; hiện chưa đáng trả write/storage cost. |
| `refs variants` | `take:500` không pagination/search | UI dropdown load bulk | 10x catalog không chọn được item >500 | Server-side search + cursor; không cần index mới ngoài search strategy. |

DB hiện tại chưa thấy inventory/gift-card/loyalty âm, PO over-received hay refund-ledger mismatch. Đây là điểm tốt nhưng không thay thế constraint/concurrency proof.

## F. Security Findings

| Severity | Vị trí | Attack scenario | Impact | Remediation |
|---|---|---|---|---|
| Critical | seed/login UI | Dùng credential công khai để đăng nhập owner | Full system takeover | Remove prefill, production-safe bootstrap, rotate accounts |
| Critical | auth helper + unscoped endpoints | Store-A user gọi ID Store-B trực tiếp dù UI không có nút | Broken access control/IDOR, cross-store data/action | Fail closed khi thiếu store scope; entity-level access checks |
| High | auth login | Credential stuffing không rate limit | Account compromise/DB CPU exhaustion do scrypt | Rate limit + backoff + alert |
| High | integration credential columns | DB read/backup leak làm lộ provider token/webhook secret | External account takeover, forged webhooks | Encryption at rest application-level + rotation |
| High | `apiError` | Gửi malformed/DB-conflicting request để nhận raw internal error | Schema/internal detail disclosure | Generic 500 + structured internal log |
| Medium | session table | DB read lấy bearer token plaintext; expired tokens tích tụ | Session hijack/operational bloat | Store token hash, cleanup, revoke flows |
| Medium | cookie-only mutations | SameSite=Lax giảm CSRF nhưng không có Origin check | Same-site/subdomain request abuse | Validate Origin/Host for browser mutation routes |
| Low | dashboard `Prisma.raw` | Chuỗi SQL được ghép thủ công từ DB-derived UUID | Hiện chưa thấy direct injection path, nhưng brittle | Dùng parameter list/`Prisma.join` khi chạm code |

Không phát hiện raw SQL nhận trực tiếp input không escape, `dangerouslySetInnerHTML`, file upload, path traversal, SSRF hay client-side secret. React escaping, Prisma parameterization và default same-origin CORS nên **GIỮ NGUYÊN**. RLS chưa bắt buộc cho single-organization server-only app; cân nhắc khi tenancy trở thành security boundary thật.

## G. Performance Findings

| Bottleneck | Điều kiện xuất hiện | Thành phần chết trước | Xử lý |
|---|---|---|---|
| Replenishment `findMany` toàn balances/prices + `Promise.all` upsert từng row + O(n²) sibling filter (`src/lib/replenishment.ts:20-124`) | InventoryBalance tăng 10x–100x | DB pool/CPU và nightly job duration | Batch theo cursor/store, SQL aggregation, bounded concurrency; index latest price/sales |
| Loss scan load toàn bộ 30 ngày transactions/movements (`src/lib/loss-prevention.ts:28-70`) | POS volume tăng 10x | Node memory/serialization | Aggregate/filter threshold trong SQL, cursor nếu cần evidence rows |
| Dashboard/report seq scans | Transactions/orders/audit logs tăng 100x | PostgreSQL CPU + latency | Index có query-backed ở mục E; cache chỉ sau khi query/index tối ưu |
| Lookup/dropdown hard caps 200/500/1000 | Catalog/movement vượt cap | Functional correctness trước hiệu năng | Search/cursor + explicit continuation watermark |
| Prisma pg pool mặc định mỗi instance (`src/lib/db.ts:6-12`) | Horizontal scale hoặc burst | PostgreSQL connection limit | Explicit pool max/timeouts per instance, deployment connection budget; PgBouncer chỉ khi đo cần |

Ở dữ liệu hiện tại (tối đa 153 products, 90 audit rows), Seq Scan là rẻ và không phải incident. Index đề xuất chỉ dành cho query cụ thể bên trên, không thêm hàng loạt ngay.

## H. Architecture Findings

### Giữ nguyên

| Phần | Lý do |
|---|---|
| Modular monolith | 31 API route và một DB chưa cần distributed complexity |
| `applyMovement` ledger-first | Một điểm kiểm soát stock, atomic update chống oversell đã được thiết kế đúng |
| Prisma + raw SQL có tham số | Phù hợp CRUD và chỗ cần atomic inventory/query report |
| RBAC permission codes | Mô hình role-permission-store scope hợp lý về ý tưởng; cần sửa fail-open semantics |
| BIGINT money | Đúng cho VND integer; chỉ cần DTO không ép Number |

### Cần refactor có mục tiêu

| Boundary | Hiện trạng | Hướng sửa |
|---|---|---|
| API → domain service | POS/orders có service, transfers/PO vừa route vừa duplicate service | Mỗi money/stock flow dùng đúng một service/transaction boundary |
| Validation → DTO | Manual checks rải 31 routes | Shared minimal schemas cho command/query; reject unknown/malformed fields |
| Authz → entity scope | `requirePermission` tách khỏi load entity, nhiều caller quên scope | Helper `loadAuthorized<Entity>` hoặc bắt buộc `assertStoreAccess` sau load |
| Job execution | Timer, ledger, work side effect trộn và dùng global Prisma trong transaction | Claim → execute → finalize tách rõ, một run ID xuyên suốt |
| Frontend → API | DTO tự khai báo, page lớn, fetch lặp | Shared response types/small API helper; tách form/table khi sửa module đó |

Không đề xuất repository layer bao quanh Prisma cho mọi table, microservice, event bus hay cache server ở giai đoạn này.

## I. Missing Production Capabilities

| Capability | Hiện trạng | Mức cần |
|---|---|---|
| Readiness/liveness | `/login` chỉ process health | P1 trước production |
| Structured logs/request ID/metrics | Không có | P1 trước production |
| Reliable job worker + leases | In-process timer sai semantics | P0/P1 |
| Idempotency registry | Chỉ optional payment key, webhook claim muộn | P0 |
| Backup/restore drill | Runbook command không đồng nhất path, chưa có evidence restore | P1 |
| Rollback/release strategy | Không có application rollback, migration roll-forward plan/canary | P1 |
| Test isolation/E2E | P0 script sửa shared DB; CI chỉ formula test | P1 |
| Rate limiting/security headers | Chưa cấu hình | P1 |
| Graceful shutdown/DB timeouts | Chưa có | P2 |
| File/storage | Không có feature file upload/storage; không phải missing capability hiện tại | N/A |

Trả lời câu hỏi 2 giờ sáng: **Không.** Developer chỉ có console error/job row; không có request ID, actor/IP đầy đủ, latency metric, trace, alert routing hoặc DB readiness history để nối một lỗi client với transaction/job cụ thể.

## J. Scalability Risks

| Thời điểm | Risk | Quyết định |
|---|---|---|
| Sửa ngay | Job duplicate/stuck, webhook/order idempotency, state-transition races, mandatory sale command ID | Đây là correctness, không phải tối ưu |
| Sửa ngay | Store scope fail-open và `UserRole` NULL escalation | Đây là security boundary |
| Trước khi scale | Cursor pagination, report indexes, bounded batch jobs, pool limits, config cache TTL | Làm trước instance/data growth thực tế |
| Trước khi scale | Organization/tenant key xuyên suốt nếu phục vụ nhiều doanh nghiệp | Hiện schema chỉ hợp một organization nghiệp vụ; thêm tenant sau sẽ chạm gần mọi table/query |
| Chỉ khi scale lớn | PgBouncer/read replica/cache/search engine/dedicated queue product | Chỉ thêm khi metric chứng minh PostgreSQL/single worker không đủ |

Thêm role/module hiện tại tương đối dễ qua permission codes và route mới. Thêm branch trong cùng organization bị chặn bởi PK `UserRole`; thêm tenant độc lập sẽ cần migration lớn vì Product/Customer/Supplier/Role không có `orgId`.

## K. Remediation Roadmap

### P0 — Critical

| Việc | File/module | Cách xử lý | Độ khó | Rủi ro sửa | Dependency |
|---|---|---|---|---|---|
| Khóa default accounts | seed/login/auth | Remove prefill, safe bootstrap, rotate seeded users | S | Thấp | Không |
| Khôi phục migration parity | Prisma migrations/CI | Migration mới tạo IntegrationProvider; clean DB parity test | M | Vừa nếu prod đã có table, cần conditional/preflight | Trước integration fixes |
| Sửa store authorization | auth + tất cả API list/mutation | Fail closed + entity scope test matrix | L | Cao: có thể lộ endpoint đang dựa hành vi cũ | Trước rollout |
| Idempotent money/stock commands | POS/returns/fulfillment/PO/transfers/webhook | Command key unique + conditional status claim/row lock | L | Cao: transaction behavior | Schema constraints trước/song song |
| Sửa JobRun và integration dispatch | jobs/instrumentation/integrations | Claim run ID; worker xử lý/ACK rồi watermark | L | Vừa | Migration parity, observability tối thiểu |

### P1 — Before Production

| Việc | File/module | Cách xử lý | Độ khó | Rủi ro sửa | Dependency |
|---|---|---|---|---|---|
| DB integrity migration | schema/migrations | CHECK, UserRole key/delete semantics, marketplace external unique | L | Cao; cần data preflight | P0 scope/idempotency design |
| Auth hardening | auth route/session | Logout fix, rate limit, token hash, cleanup, revoke | M | Vừa: session migration | Logging/request ID |
| CI integration test | workflows/tests | Disposable clean DB; seed; P0 HTTP flows; concurrency tests; cleanup | M | Thấp | P0 APIs ổn định |
| Observability/health | middleware/api/jobs/runbook | JSON logs, request ID, metrics, ready/live, alerts | M | Thấp | Chọn log/metric backend deploy |
| Backup/release | runbook/deployment | Correct backup path, offsite retention, restore drill, rollback/roll-forward | M | Thấp | Chọn hosting |

### P2 — Hardening

| Việc | File/module | Cách xử lý | Độ khó | Rủi ro sửa | Dependency |
|---|---|---|---|---|---|
| Query-backed indexes/pagination | schema + list APIs | Index mục E, cursor pagination, server search | M | Vừa: index build/write overhead | Query metrics/data size |
| Batch job efficiency | replenishment/loss | SQL aggregation, cursor, bounded concurrency | M | Vừa: forecast equivalence | Reliable worker |
| API validation/contracts | API + shared lib | Shared schemas/DTO, money strings, payload limits | L | Vừa: client contract | E2E tests |
| Frontend maintainability | client pages/nav | Permission-aware nav, error/loading states, split changing pages | M | Thấp | Stable API DTO |
| DB/runtime lifecycle | db/config | Pool budget/timeouts, fail-fast env validation, graceful shutdown, config TTL | S–M | Thấp | Deployment topology |

### P3 — Future Scale

| Việc | Khi nào làm | Cách xử lý | Độ khó | Rủi ro sửa | Dependency |
|---|---|---|---|---|---|
| Multi-tenant organization boundary | Trước khách hàng/doanh nghiệp thứ hai | `orgId` + tenant context + composite uniqueness; cân nhắc RLS | XL | Rất cao | Product decision |
| Dedicated worker deployment | Khi >1 web instance hoặc job vượt chu kỳ | Worker process + lease table; chưa cần Kafka | M | Vừa | P0 JobRun |
| Connection proxy/read scaling | Khi connection/DB metrics chạm ngưỡng | PgBouncer/read replica theo workload | M | Vừa | Observability |
| Search engine/cache | Khi pg_trgm/index vẫn không đạt SLO | Chọn theo measured search/cache miss workload | L | Cao | Metrics, invalidation design |

## Dependency Assessment

- Production framework/runtime packages đang ở `wanted`; `npm outdated` chỉ báo major mới cho `@types/node`, ESLint và TypeScript. **Không nâng major tự động.**
- `npm audit --omit=dev` vẫn báo 3 high qua optional peer `@prisma/client -> prisma -> @prisma/config -> deepmerge-ts`. Prisma CLI đã chuyển sang `devDependencies`, nhưng npm vẫn audit optional peer đã cài. Chưa có upgrade tương thích trong nhánh hiện tại; không chạy `audit fix --force` vì lệnh đề xuất downgrade major về Prisma 6.12. Runtime không nhận object graph từ người dùng qua Prisma config, nên đây là residual build-tool risk cần theo dõi advisory, không phải đường khai thác request đã xác nhận.
- Không thấy dependency trùng chức năng hoặc package runtime thừa đáng kể; `lucide-react` là dependency UI duy nhất mới và không phải bottleneck chính.

## Ship Decision

**CONDITIONAL GO — 82/100.** Code-side P0, clean-database migration, concurrency, lint/typecheck/build, storefront và hardening tests đã pass. Chỉ bật giao dịch thật sau khi operator cấu hình production secrets/origin/proxy, chạy integration-secret rotation, nối structured logs/alerts vào nền tảng hosting và hoàn tất một restore drill có ghi nhận kết quả.
