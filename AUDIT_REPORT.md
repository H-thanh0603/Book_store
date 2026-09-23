# Pre-Launch Audit Report — Melio Bookstore

- Repo: `/home/nht/Downloads/github_H-Thanh0603/Book_store` (code: `bookstore/`), branch `main`, commit `f54b384`
- Ngày audit: 2026-09-22
- Auditor: AI agent (6 nhóm song song + spot-check thủ công các claim BLOCKER/HIGH)
- Checklist: `PRELAUNCH_AUDIT_CHECKLIST_100PLUS.md` — file thực chứa **180 câu (Q1–Q180)**, không phải 200. Báo cáo trả lời đủ 180 câu, không bịa thêm Q181–Q200.
- Verdict: **NO-GO** (còn 1 BLOCKER: Q9 — revoke key cần người làm, code không tự revoke được)
- Cập nhật 2026-09-22 (vòng fix 1): đã sửa code cho Q10, Q19, Q34 (2 route), Q96, Q100, Q139, Q145 (tooling), Q155, Q159. Chi tiết ở cuối mỗi mục liên quan.

## 1. Executive summary

Repo là web Next.js 16 + Prisma/PostgreSQL multi-tenant, trưởng thành hơn prototype nhiều: idempotency mọi đường tiền, transaction đúng chỗ, rate-limit Redis-first, webhook HMAC + retry/dead-letter, health/readiness tách biệt, CI chạy lint + typecheck + 11 suite test, `npm audit` 0 CVE, AI concierge có fencing + grounding + token budget. 57/180 câu PASS.

Nhưng có **2 BLOCKER**: key/API secret thật nằm trong `bookstore/.env` worktree (Q9) và toàn bộ cổng thanh toán hardcode host **sandbox** — launch là không thu được tiền thật (Q155). Kèm **27 HIGH**, trong đó nặng nhất: bypass legacy superuser + migration tenant chưa xong (Q35), write sau guard thiếu org-scope trong `where` (Q34), backup full PII không mã hóa (Q66), PII lọt log/Sentry (Q64), admin không MFA (Q29), không xóa tài khoản (Q62), không privacy/terms (Q60/Q151), deploy prod bằng tay (Q130). Không launch cho tới khi 2 BLOCKER đóng và mọi HIGH có owner + hạn chốt (risk acceptance bằng văn bản nếu hoãn).

**Vòng fix 1 (2026-09-22, đã verify tsc + eslint + 443 unit tests + 2 test payment-hosts mới):** Q155 code xong (host ra env, sandbox default an toàn, prod-checklist check live host) — còn việc ops set env; Q34 xong 2 route mẫu (suppliers, gift-cards); Q10 xong (root ignore + `.dockerignore`); Q96/Q100 xong (not-found + manifest đơn + icons thật); Q139 xong (thiếu tracking → FAIL); Q19/Q159 xong (nginx deny dotfile + robots noindex non-prod); Q145 tooling xong (backup encrypt qua `BACKUP_ENCRYPT_KEY`, chờ ops set key). Còn lại **1 BLOCKER (Q9)** và các HIGH cần người.

## 2. Điểm theo nhóm

| Nhóm | #áp dụng* | PASS | PARTIAL | FAIL | UNKNOWN | N/A | Rủi ro chính |
|---|---|---|---|---|---|---|---|
| A. Bản đồ hệ thống (Q1–Q8) | 8 | 4 | 4 | 0 | 0 | 0 | Thấp |
| B. Secrets/config (Q9–Q20) | 11 | 3 | 6 | 1 | 1 | 1 | **BLOCKER** |
| C. Auth (Q21–Q32) | 9 | 2 | 4 | 2 | 0 | 3 | Cao |
| D. Authz (Q33–Q42) | 9 | 2 | 7 | 0 | 0 | 1 | Cao |
| E. AppSec (Q43–Q58) | 14 | 11 | 3 | 0 | 0 | 2 | Trung bình |
| F. Privacy (Q59–Q70) | 11 | 0 | 4 | 5 | 2 | 0 | Cao |
| G. Database (Q71–Q80) | 9 | 6 | 3 | 0 | 0 | 1 | Trung bình |
| H. API/Integration (Q81–Q90) | 8 | 5 | 2 | 1 | 0 | 2 | Trung bình |
| I. Frontend (Q91–Q100) | 9 | 3 | 2 | 3 | 1 | 1 | Trung bình |
| J. A11y/i18n (Q101–Q108) | 6 | 4 | 2 | 0 | 0 | 2 | Thấp |
| K. Perf (Q109–Q118) | 9 | 3 | 5 | 1 | 0 | 1 | Trung bình |
| L. Testing (Q119–Q128) | 9 | 3 | 5 | 0 | 0 | 1 | Trung bình |
| M. CI/CD (Q129–Q138) | 9 | 2 | 4 | 1 | 1 | 1 | Cao |
| N. Observability/backup (Q139–Q150) | 11 | 3 | 7 | 1 | 0 | 1 | Cao |
| O. Legal/business (Q151–Q162) | 11 | 0 | 7 | 4 | 0 | 1 | **BLOCKER** |
| P. Mobile (Q163–Q168) | 0 | 0 | 0 | 0 | 0 | 6 | Không áp dụng |
| Q. AI/LLM (Q169–Q176) | 8 | 6 | 2 | 0 | 0 | 0 | Trung bình |
| R. Founder (Q177–Q180) | 4 | 0 | 0 | 0 | 4 | 0 | Chưa trả lời |
| **Tổng** | **156** | **57** | **71** | **19** | **9** | **24** | |

\* #áp dụng = 180 − N/A trong nhóm. Tổng全: PASS 57, PARTIAL 71, FAIL 19, UNKNOWN 9, N/A 24.

## 3. Chi tiết từng câu

Format mỗi câu: Verdict | Severity | Evidence (path thật) | Risk/Gap | Fix (thay đổi nhỏ nhất).

### A. Bản đồ hệ thống & phạm vi

- **Q1.** Verdict: PASS | Severity: INFO | Evidence: `bookstore/PRODUCT.md:7` `Platform: web`; `bookstore/package.json:43-44` `next ^16.3.4, react 19.2.8` | Risk: không | Fix: không.
- **Q2.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `bookstore/README.md:12-14` `/shop, /login, /api/health/ready`; `bookstore/PRODUCT.md:34-36` POS <3s, COD, tích điểm | Risk: thiếu danh sách critical journeys chốt (signup, POS sale, checkout COD/VNPay, refund, export) | Fix: thêm `docs/CRITICAL_JOURNEYS.md` + map test.
- **Q3.** Verdict: PARTIAL | Severity: LOW | Evidence: `bookstore/README.md:3` modular monolith; `bookstore/docs/OPERATIONS.md:45-54` topology PM2/nginx/PgBouncer; không có `ARCHITECTURE.md`/C4 | Risk: kiến trúc chỉ nằm rải rác | Fix: 1 diagram request-path + topology vào `docs/ARCHITECTURE.md`.
- **Q4.** Verdict: PASS | Severity: INFO | Evidence: 113 `src/app/api/**/route.ts` (auth, storefront, pos, payments, webhooks, mcp, concierge); `src/proxy.ts:8-23` PUBLIC_PATHS; `scripts/worker.ts` + `src/instrumentation.ts:62-71` scheduler | Risk: không | Fix: không.
- **Q5.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `bookstore/docs/STAGING.md:11-25` DB riêng `bookstore_staging`, port 3001; dựng bằng `cp .env` sửa tay; không preview env | Risk: staging cùng box, dễ quên đổi secret khi copy | Fix: secret độc lập + checklist 4 giá trị bắt buộc đổi, cấm copy `.env` prod.
- **Q6.** Verdict: PASS | Severity: INFO | Evidence: `package.json` next 16.3.4, prisma 7.10, pg 8.23, ioredis 6, nodemailer 9; `ecosystem.config.js` PM2; `deploy/nginx.conf` | Risk: không | Fix: không.
- **Q7.** Verdict: PASS | Severity: INFO | Evidence: `bookstore/.gitignore:44` `/src/generated/`; `prisma/schema.prisma:4-7` generator output `../src/generated/prisma`; không submodule/vendored | Risk: không | Fix: không.
- **Q8.** Verdict: PARTIAL | Severity: LOW | Evidence: không thấy debug panel/`DEMO_`; chat fallback canned replies khi thiếu LLM key; route `/bookshelf` CSP lỏng hơn | Risk: demo fallback không banner, `/bookshelf` nới `unsafe-eval` | Fix: gắn banner demo cho canned replies, review `/bookshelf` trước launch.

### B. Secrets, config & môi trường

- **Q9.** Verdict: FAIL | Severity: BLOCKER | Evidence: `bookstore/.env` tồn tại worktree, **untracked** (`git ls-files` chỉ có `.env.example`, `git log -- bookstore/.env` rỗng — chưa từng commit) nhưng chứa key thật: 4/4 biến kiểm tra có giá trị (`GEMINI_API_KEY`, `LLM_API_KEY` present); `.env.example` sạch | Risk: live key plaintext trên đĩa, đã rời secret manager; rủi ro leak qua backup/screenshot/image; `SEED_USER_PASSWORD` yếu | Fix: **revoke 3 key** (Google AI Studio, TokenRouter, rotate `INTEGRATION_ENCRYPTION_KEY` theo RUNBOOK), cấp lại qua secret store, giữ `chmod 600`, cấm copy `.env`.
- **Q10.** Verdict: PASS | Severity: INFO | Evidence: root `.gitignore` đã bổ sung `.env*/.pem/.key/.sql/.dump/credentials.json/backups/` + `bookstore/.dockerignore` mới (`.env*, .git, *.pem, var/, logs/`) | Risk: đã đóng phần code | Fix: ✅ xong vòng 1.
- **Q11.** Verdict: PARTIAL | Severity: LOW | Evidence: `bookstore/.env.example` 193 dòng đủ DB/payments/SMTP/Sentry; giá trị rỗng/placeholder | Risk: thiếu `SIGNUP_TRIAL_DAYS` (dùng ở `src/app/api/auth/route.ts:153`), `ALLOW_SEED_PRODUCTION`, `CSRF_SECRET` chỉ comment | Fix: thêm 3 dòng vào example.
- **Q12.** Verdict: PASS | Severity: INFO | Evidence: `src/lib/api.ts:33` 500 → `Internal server error`; `ecosystem.config.js:35,41` `NODE_ENV: production`; không `APP_DEBUG` | Risk: không | Fix: không.
- **Q13.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: code chỉ đọc `process.env`, không hardcode; `README.md:35` tuyên bố secret manager; deploy thực tế vẫn `.env` file + PM2 env | Risk: tuyên bố docs ≠ thực tế deploy | Fix: prod đọc secret từ manager/mounted file, audit ai đọc secret.
- **Q14.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `docs/STAGING.md:14-18` đổi `DATABASE_URL/APP_ORIGIN/PORT/SMTP`; dựng staging bằng copy `.env` prod | Risk: quên đổi webhook secret/payment key | Fix: checklist giá trị bắt buộc đổi + IPN test key riêng staging.
- **Q15.** Verdict: N/A | Severity: INFO | Evidence: không remote flag service; `src/lib/api.ts:165` `getSystemConfig(key, fallback)` degrade 503/canned | Risk: không áp dụng | Fix: không.
- **Q16.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `src/lib/db.ts:89` throw khi thiếu `DATABASE_URL`; `src/lib/secret-box.ts:7-9` throw khi sai key; `CSRF_SECRET` thiếu chỉ warn (`src/lib/csrf.ts:18-30`) | Risk: không schema env tập trung; SMTP thiếu chỉ log fallback | Fix: `src/lib/env.ts` validate lúc boot (DB/APP_ORIGIN/CSRF bắt buộc prod).
- **Q17.** Verdict: PASS | Severity: INFO | Evidence: grep CORS 0 hit; `src/proxy.ts:83-98` mutation sai origin → 403; cookie `SameSite: lax` | Risk: không | Fix: không.
- **Q18.** Verdict: PASS | Severity: INFO | Evidence: `src/lib/rate-limit.ts:16-18` chỉ đọc XFF khi `TRUST_PROXY_HEADERS=true`; cookie không `Domain`, `path: /`; `deploy/nginx.conf:99-101` overwrite XFF | Risk: set sai flag thì rate-limit gộp bucket (đã warn `instrumentation.ts:28-33`) | Fix: giữ `false` khi expose trực tiếp.
- **Q19.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `deploy/nginx.conf` đã thêm `location ~ /\. { deny all; }`; `next.config.ts` vẫn chưa set `productionBrowserSourceMaps` explicit; `src/proxy.ts:66-72` path chứa `.` bypass auth (cho static) | Risk: còn sourcemap public + liệt kê `public/` | Fix: ✅ 1/2 xong — còn: set `productionBrowserSourceMaps: false` + curl `.map` staging. ✅ robots non-prod → Disallow toàn site (xem Q159).
- **Q20.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `RUNBOOK.md:58-86` rotation 4 bước + `scripts/ops/rotate-integration-key.ts` | Risk: thiếu danh sách key live + lịch rotation, thủ công | Fix: `docs/SECRET_INVENTORY.md` (tên key, owner, expiry) + nhắc 90 ngày.

### C. Xác thực

- **Q21.** Verdict: PASS | Severity: INFO | Evidence: `src/lib/auth.ts:12-22` scrypt N=2^17 r=8 p=1, salt 16B, envelope versioned; `verifyPassword` `timingSafeEqual` | Risk: không | Fix: không.
- **Q22.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: server enforce `password.length>=10` (`src/app/api/auth/route.ts:43,96,133`); seed yêu cầu ≥12 | Risk: chỉ độ dài, không complexity/breached-list | Fix: thêm zxcvbn/pwned check, giữ min 10.
- **Q23.** Verdict: PARTIAL | Severity: HIGH | Evidence: staff reset `src/app/api/auth/route.ts:68-120`: `randomBytes(32)`, lưu SHA-256, TTL 30 phút, claim atomic, xóa hết session, anti-enumeration | Risk: link reset qua query `GET /login?reset=${token}` dính referrer/log; customer không có forgot-password | Fix: đổi sang POST form + `Referrer-Policy`; thêm reset customer hoặc ghi rõ không hỗ trợ.
- **Q24.** Verdict: PARTIAL | Severity: HIGH | Evidence: `src/app/api/auth/route.ts:17-20` login-ip 20/phút, account 10/5phút; Redis-first fallback Postgres | Risk: không lockout/CAPTCHA/backoff; multi-worker thiếu Redis thì bucket nhân | Fix: bắt buộc `REDIS_URL` khi instances>1; CAPTCHA sau 5 fail/account.
- **Q25.** Verdict: PASS | Severity: LOW | Evidence: `src/lib/auth.ts:58-64`, `customer-auth.ts:47-53` `httpOnly, SameSite lax, Secure khi production, path /` | Risk: Lax thay vì Strict cho staff | Fix: giữ Lax (cần top-level login) + CSRF per-session; cân nhắc `__Host-` prefix.
- **Q26.** Verdict: PARTIAL | Severity: LOW | Evidence: staff TTL 12h, đổi pass revoke session khác, reset xóa tất cả; customer idle 7d + absolute 30d + sliding; prune scheduler | Risk: staff không idle-timeout; đổi pass giữ session hiện tại | Fix: chấp nhận được; cân nhắc idle 30 phút staff sau launch.
- **Q27.** Verdict: N/A | Severity: INFO | Evidence: chỉ `No OAuth` ở `src/app/api/mcp/route.ts:17`; login password-only | Fix: không.
- **Q28.** Verdict: N/A | Severity: INFO | Evidence: `jsonwebtoken/jwt` 0 hit; session opaque `randomUUID+randomBytes(24)` hash SHA-256 | Fix: không.
- **Q29.** Verdict: FAIL | Severity: HIGH | Evidence: grep `totp/mfa/2fa` 0 hit; owner/admin chỉ password+session | Risk: chiếm 1 password admin là chiếm hệ thống | Fix: TOTP cho owner/admin trước launch, hoặc risk-accept văn bản + roadmap 2 tuần.
- **Q30.** Verdict: FAIL | Severity: MEDIUM | Evidence: `storefront/auth/route.ts:121` session ngay sau signup, login chạy dù chưa verify; staff không verify email; phone chỉ regex | Risk: checkout/discount/loyalty không cần verified | Fix: chặn checkout/discount tới khi `emailVerifiedAt` set + resend-verify.
- **Q31.** Verdict: N/A | Severity: INFO | Evidence: không magic-link/OTP login | Fix: không.
- **Q32.** Verdict: PARTIAL | Severity: HIGH | Evidence: `prisma/seed.ts:64-69` guard `ALLOW_SEED_PRODUCTION=true`; nhưng identity đoán được (`owner@melio.vn`…) + pass chung từ `SEED_USER_PASSWORD` | Risk: lỡ seed prod là có owner cố định, pass yếu local `localdevpassword123` | Fix: seed từ chối cứng khi DB đã có data; tách seed demo khỏi bootstrap; xóa email demo khỏi repo public.

### D. Phân quyền

- **Q33.** Verdict: PARTIAL | Severity: HIGH | Evidence: `src/proxy.ts:115-123` API đòi session; ~75 route gọi `requirePermission`; 32 route public (storefront, IPN/return, webhooks, concierge, health) | Risk: public mutations chỉ rate-limit/customer-cookie, chưa checklist cơ chế thay thế từng route | Fix: liệt kê 32 route public, mỗi POST ghi cơ chế (HMAC/customer-auth/rate-limit) vào comment.
- **Q34.** Verdict: PASS | Severity: INFO | Evidence: ✅ vòng 1+2 quét toàn `src/app/api` (22 match `where: { id }` ở 10 file): đã bọc `withOrg` vào suppliers (PUT+DELETE), gift-cards (adjust/deactivate/activate/void), agent-keys revoke, support close + messages; webhooks đã `updateMany` scoped; transfers/invoice/refunds/counts guard qua relation chain (store→region→orgId); catalog (Category/Brand/Author/Publisher) là bảng global shared không có `orgId` trong schema — không scope được, không phải IDOR | Fix: xong.
- **Q35.** Verdict: PARTIAL | Severity: HIGH | Evidence: `src/lib/org-scope.ts:23,42,51` legacy superuser (`orgId null`) bypass scope; `:57-65` tự thừa nhận migration chưa xong (invoices/webhooks pending); `auth.ts:129` bypass | Risk: superuser cũ + route chưa migrate = cross-tenant khi có org thứ 2 | Fix: chạy `test:tenant`, thêm withOrg vào invoices/webhooks, xóa fallback superuser sau migration.
- **Q36.** Verdict: PASS | Severity: INFO | Evidence: `src/lib/auth.ts:140-158` `requirePermission` trung tâm + `resolveStoreScope`; không `if role ==` rải | Fix: không.
- **Q37.** Verdict: PARTIAL | Severity: HIGH | Evidence: `metrics/route.ts:18`, `audit-logs/route.ts:15`, `team/invite/route.ts:28` gate bằng permission string, cùng router `/api/*` | Risk: sai 1 code là lộ admin API | Fix: guard tập trung trong proxy.ts cho `/api/(metrics|jobs|audit-logs|team)` + test 403.
- **Q38.** Verdict: PARTIAL | Severity: HIGH | Evidence: function-level 75 route; object-level mới ~38 file (vớiOrg/assertStoreScope), không đồng đều | Risk: route sót object-check | Fix: bắt buộc withOrg/assertStoreAccess mọi `[id]` route, review diff phần còn lại.
- **Q39.** Verdict: PARTIAL | Severity: HIGH | Evidence: `integrations/webhook/route.ts:24-28` HMAC-SHA256 + idempotency; `carriers/webhook/route.ts:38-41,56` secret + replay guard; vnpay/momo/zalopay verify signature | Risk: integrations/carrier webhook không check timestamp window | Fix: thêm header `t=` ±5 phút như `webhook-bus` (`x-melio-signature t=,v1=`), reject quá hạn.
- **Q40.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `export/jobs/[id]/download/route.ts:12-17` requirePermission + withOrg, 404 chống oracle; file tồn tại 7 ngày là tải được | Risk: không expiry/signed URL | Fix: token download 1 lần TTL ngắn hoặc check `requestedBy === auth.userId` + log download.
- **Q41.** Verdict: PASS | Severity: INFO | Evidence: `team/invite/route.ts:16-24,38-40` `INVITABLE_ROLES` chặn owner/admin; build `data` từng field; không spread body | Fix: không.
- **Q42.** Verdict: N/A | Severity: INFO | Evidence: `impersonat|actAs|switchUser` 0 hit | Fix: khi thêm thì time-box + audit log.

### E. Bảo mật ứng dụng

- **Q43.** Verdict: PASS | Severity: INFO | Evidence: Prisma ORM; `$queryRaw` bind `${key}` (`rate-limit.ts:44-52`); `partitions.ts:85` regex trước `$executeRawUnsafe` | Fix: không.
- **Q44.** Verdict: PASS | Severity: LOW | Evidence: `dangerouslySetInnerHTML` chỉ 2 chỗ JSON-LD tĩnh/escape (`shop/p/[id]/page.tsx:78,81`); CSP `next.config.ts:23-38` | Risk: `/bookshelf` nới `unsafe-eval` + jsdelivr | Fix: giữ; tách bookshelf ra origin riêng nếu siết.
- **Q45.** Verdict: PARTIAL | Severity: HIGH | Evidence: `src/lib/csrf.ts:47-50` token HMAC; `src/proxy.ts:47-60,75-80` verify + origin check | Risk: `validateCsrf` chỉ đọc `bs_session`, bỏ qua `bs_customer` — storefront mutations chỉ còn SameSite+origin | Fix: mở rộng validateCsrf cho `bs_customer` hoặc gắn CSRF token vào storefront client.
- **Q46.** Verdict: PASS | Severity: INFO | Evidence: `src/lib/ssrf.ts:30-62` chặn scheme/IP private + resolve DNS trước fetch; `webhook-bus.ts:161` assert target | Risk: `WEBHOOK_ALLOW_HOSTS` có thể mở nội bộ | Fix: review giá trị prod.
- **Q47.** Verdict: PASS | Severity: LOW | Evidence: `async-job.ts:94-96` path server-side; download `readFile(job.filePath)` không nhận path user; 0 route upload | Risk: `unlink(job.filePath)` tin DB | Fix: validate `startsWith EXPORT_DIR` trước read/unlink.
- **Q48.** Verdict: N/A | Severity: INFO | Evidence: `formData()` 0 hit; không upload user | Fix: khi thêm thì whitelist MIME+magic bytes, rename, ngoài webroot.
- **Q49.** Verdict: PASS | Severity: INFO | Evidence: không `eval/Function/exec/spawn/yaml.load`; chỉ `JSON.parse` + `redis.eval` Lua nội bộ; deps không yaml/xml/ldap | Fix: không.
- **Q50.** Verdict: PASS | Severity: LOW | Evidence: `?next=/callbackUrl/returnTo` 0 hit; payment return URL cố định; proxy login `from=pathname` nội bộ | Fix: giữ allowlist nội bộ.
- **Q51.** Verdict: PASS | Severity: LOW | Evidence: `next.config.ts:9-39` nosniff, referrer-policy, HSTS prod, Permissions-Policy, `X-Frame-Options: DENY`, CSP prod không `unsafe-eval` | Risk: `/bookshelf` CSP nới | Fix: giữ.
- **Q52.** Verdict: PASS | Severity: LOW | Evidence: `deploy/nginx.conf` port 80 redirect HTTPS; HSTS prod; cookie `secure` khi production | Risk: cert/HSTS live chưa curl kiểm chứng | Fix: curl prod check 80→443 + HSTS trước launch.
- **Q53.** Verdict: PARTIAL | Severity: HIGH | Evidence: `enforceRateLimit` phủ login/signup/reset/checkout/concierge/export/IPN | Risk: `team/invite/route.ts` không rate-limit (spam seat); admin mutations mỏng | Fix: `enforceRateLimit("team-invite", auth.userId, 10, 3600s)` + limit mọi admin POST.
- **Q54.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `api.ts:98-107` pageSize cap 100; export cap 200k; statement timeout | Risk: không body-size limit/timeout/JSON depth tập trung | Fix: reject JSON >1MB/sâu >10 ở middleware.
- **Q55.** Verdict: PASS | Severity: INFO | Evidence: `npm audit --omit=dev` = **0 vulnerabilities** (tự chạy verify 2026-09-22); `package-lock.json` pin; overrides deepmerge-ts/mysql2/uuid | Risk: audit mới chạy tay | Fix: thêm `npm audit --omit=dev` gate CI, fail khi high+.
- **Q56.** Verdict: N/A | Severity: INFO | Evidence: không Dockerfile/docker-compose (PM2 + nginx) | Fix: khi container hóa thì non-root + slim, không mount docker.sock.
- **Q57.** Verdict: PASS | Severity: INFO | Evidence: chỉ `JSON.parse` input ngoài; không pickle/YAML/Java-serialization | Fix: cấm thêm parser không whitelist.
- **Q58.** Verdict: PASS | Severity: LOW | Evidence: metrics/jobs/audit-logs đòi `admin.*`; swagger/graphiql 0 hit; health public chỉ uptime/SELECT 1 | Fix: không.

### F. Dữ liệu, privacy, compliance

- **Q59.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `schema.prisma:862-897` Customer phone/email/birthday/address/passwordHash; `:1218-1230` Shipment; `:1666-1699` EInvoice taxCode | Risk: PII khắp nơi, không inventory trung tâm, không phân loại CCCD/health | Fix: `docs/privacy-data-map.md` (field + mức nhạy + TTL).
- **Q60.** Verdict: FAIL | Severity: HIGH | Evidence: grep privacy/terms trong `src/app docs` 0 hit; chỉ OPERATIONS/HANDOVER/STAGING/ADMIN_GUIDE | Risk: thu thập phone/địa chỉ/đơn hàng nhưng không policy — vi phạm NĐ13 | Fix: thêm `/privacy` `/terms` khớp thu thập/share/lưu trữ thật.
- **Q61.** Verdict: FAIL | Severity: LOW | Evidence: không CookieBanner/consent/GTM; chỉ cookie first-party `bs_session/bs_customer` + funnel nội bộ | Risk: nếu thêm GA/FB là vi phạm consent | Fix: hiện tại ghi N/A có điều kiện; thêm tracker thì banner opt-in chặn trước.
- **Q62.** Verdict: FAIL | Severity: HIGH | Evidence: `customers/route.ts:26-53` chỉ list/create/history; không xóa account/anonymize (chỉ `wishlistItem.deleteMany`) | Risk: không đáp ứng quyền xóa NĐ13/GDPR | Fix: `DELETE /api/account` + cascade/anonymize Customer+Memory+Cart+Alert + test.
- **Q63.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `src/lib/prune.ts` AuditLog 90d, Webhook 30d, Memory 180d, Chat 30d; backup remote 30d | Risk: Customer/Order/Shipment/EInvoice giữ vô hạn | Fix: công bố retention matrix + chú thích EInvoice 5 năm (thuế).
- **Q64.** Verdict: FAIL | Severity: HIGH | Evidence: `src/lib/api.ts:13-15` log 500 message+stack; `error-tracking.ts:127-136` extra userId/metadata/URL không scrub; scrub chỉ cho LLM (`fencing.ts:75`), không cho log | Risk: PII/request body lọt log/Sentry | Fix: scrub phone/email trước `trackError/console.error` + cấm log body.
- **Q65.** Verdict: PARTIAL | Severity: HIGH | Evidence: `deploy/nginx.conf:77-89` TLS1.2/1.3 + HSTS; `secret-box.ts:17-22` AES-256-GCM cho integration secret | Risk: PII phone/email plaintext trong DB; disk/DB không mã hóa | Fix: bật PG TLS + disk encrypt; cân nhắc field-level cho phone/email; doc rõ.
- **Q66.** Verdict: FAIL | Severity: HIGH | Evidence: `scripts/ops/backup-offsite.sh:54` `pg_dump --format=custom` full DB → rclone, không `gpg/openssl` | Risk: backup chứa full PII không mã hóa | Fix: `gpg --encrypt` (age/sops) trước upload + restrict bucket IAM + chạy `restore-drill.sh`.
- **Q67.** Verdict: FAIL | Severity: MEDIUM | Evidence: vendor OpenRouter/googleapis/mail nội bộ; `DPA|subprocessor|residency|SPF|DKIM` 0 hit | Risk: không DPA/subprocessor/residency; mail prod thiếu SPF/DKIM | Fix: vendor list + DPA + residency VN + SPF/DKIM/DMARC.
- **Q68.** Verdict: UNKNOWN | Severity: INFO | Evidence: `schema.prisma:873` `birthday DateTime?`, không age-gate | Risk: chưa rõ có phục vụ trẻ em | Fix: hỏi product; nếu có thì age gate + parental consent.
- **Q69.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `ExportJob` + `datasets.ts:53-60` export customers cho admin; không self-service per-user | Risk: thiếu data portability cho user | Fix: `GET /api/account/export` CSV của chính user, reuse async-job.
- **Q70.** Verdict: UNKNOWN | Severity: HIGH | Evidence: `deploy/pgbouncer.ini` single role `bookstore`; không SSO/IAM/audit trong repo | Risk: code không trả lời least-privilege nội bộ | Fix: hỏi ops — PG role per-người + SSO + audit + cấm share admin.

### G. Database & migration

- **Q71.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `prisma/migrations/` 40+ dir versioned + lock; `RUNBOOK.md:10` cấm migrate dev/seed prod | Risk: không reversible/down, không expand/contract doc | Fix: quy ước expand→migrate→contract + rollback cho migration nguy hiểm.
- **Q72.** Verdict: PASS | Severity: INFO | Evidence: `@@unique[orgId,code]`, `@@unique[orgId,phone/email]`, `onDelete: Restrict`, `orderId @unique` | Risk: thiếu CHECK rating/value (tin app) | Fix: thêm CHECK khi chạm migration.
- **Q73.** Verdict: PASS | Severity: INFO | Evidence: index User[orgId], Customer[email], Order[status/customerId/store], Product[orgId/name]; migration trgm + FK indexes | Risk: chưa EXPLAIN prod | Fix: EXPLAIN hot path login/tenant+id/search trước launch.
- **Q74.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `optPage` cap 100; export truncate 10k→413; không dataloader | Risk: N+1 chưa soát; pagination không mọi list | Fix: grep `findMany` thiếu skip/take + `take<=100` mọi list.
- **Q75.** Verdict: PASS | Severity: INFO | Evidence: `$transaction` order+job (integrations webhook:49-61), carriers:57-83; `db.ts:159` TX timeout + `withTxRetry` | Fix: không.
- **Q76.** Verdict: N/A | Severity: INFO | Evidence: `deletedAt|isDeleted` 0 hit — hard delete + Restrict/Cascade | Fix: không.
- **Q77.** Verdict: PASS | Severity: INFO | Evidence: `db.ts:14-38` pool parse 1-100 default 10, timeout/idle + breaker; `pgbouncer.ini` transaction pooling | Risk: chưa load test số thực | Fix: set `DB_POOL_MAX` theo instance + monitor waitingCount.
- **Q78.** Verdict: PASS | Severity: INFO | Evidence: `seed.ts:66-69` throw khi production thiếu `ALLOW_SEED_PRODUCTION`; README/RUNBOOK cấm | Risk: còn cờ override (xem Q32) | Fix: giữ guard + xóa cờ trên prod.
- **Q79.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: note `CREATE INDEX CONCURRENTLY` tay; `OPERATIONS.md:49` pm2 reload zero-downtime | Risk: không lock_timeout/rewrite plan cho bảng lớn | Fix: lock_timeout + CONCURRENTLY ngoài tx + expand/contract cho rewrite.
- **Q80.** Verdict: PASS | Severity: INFO | Evidence: `db.ts:105-146` `prismaRead` opt-in replica + guard chặn write + tx giữ trên primary | Fix: chỉ route read chịu lag sang replica.

### H. API, backend & integration

- **Q81.** Verdict: FAIL | Severity: MEDIUM | Evidence: `openapi|swagger|/v1/` 0 hit trong src/docs; không spec/versioning | Risk: breaking change không contract | Fix: xuất OpenAPI tối thiểu (storefront/payment/webhook) + prefix `/v1` hoặc version header.
- **Q82.** Verdict: PASS | Severity: INFO | Evidence: `api.ts:26-43` whitelist code, 500 → `Internal server error`, requestId, details chỉ INSUFFICIENT_STOCK | Fix: không.
- **Q83.** Verdict: PASS | Severity: INFO | Evidence: `storefront.ts:584-601` idempotency key regex; `Payment.idempotencyKey`, `WebPayment.txnRef`, `IntegrationJob.idempotencyKey`, `EInvoice.orderId` unique | Fix: doc key cho FE.
- **Q84.** Verdict: PASS | Severity: INFO | Evidence: `api.ts:104-105` pageSize 1-100 else 400; export async cap 200k | Risk: sort/filter chưa whitelist mọi nơi | Fix: whitelist sort field.
- **Q85.** Verdict: PASS | Severity: INFO | Evidence: outbound `webhook-bus.ts` HMAC `t=,v1=`, backoff 10s→4h, dead-letter + claim lease; inbound HMAC + idempotent 202 duplicate; gateway settle idempotent | Fix: doc verify cho consumer.
- **Q86.** Verdict: PASS | Severity: INFO | Evidence: JobRun attempts/maxAttempts3/lease; `jobs.ts` backoff `2^n` cap 60m + takeover; async-job FAILED ghi error | Risk: DLQ chung bảng | Fix: dashboard `/api/jobs` + alert FAILED.
- **Q87.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `instrumentation.ts:13-18,71` gate single-scheduler + slot idempotent + claim | Risk: timezone UTC ngầm, không pin Asia/Ho_Chi_Minh | Fix: pin `TZ` hoặc doc cron UTC + 1 scheduler prod.
- **Q88.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `AbortSignal.timeout 10s` gateway/webhook; DB breaker 5 fail/30s → 503; throttle error-tracking | Risk: backoff cố định không jitter → retry storm | Fix: jitter `delay*(0.8+0.4rand)` + hedge LLM.
- **Q89.** Verdict: N/A | Severity: INFO | Evidence: không S3/bucket; export local `var/exports`; imageUrl/pdfUrl là URL ngoài | Fix: khi thêm S3 thì private + presigned ngắn + deny list.
- **Q90.** Verdict: N/A | Severity: INFO | Evidence: `graphql` 0 hit | Fix: không.

### I. Frontend

- **Q91.** Verdict: PASS | Severity: LOW | Evidence: `CheckoutModal.tsx:252-277` label+required+pattern; `storefront.ts:593-599` fail 400 server-side | Fix: không.
- **Q92.** Verdict: PASS | Severity: LOW | Evidence: `loading.tsx` skeleton; `CatalogSection.tsx:284` EmptyState; `sw.js` offline queue; `error.tsx` recovery card | Risk: offline chủ yếu POS | Fix: mở rộng SW cache catalog nếu cần.
- **Q93.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: max-w-7xl responsive, `.touch-44`, chip cuộn mobile; không report test máy thật | Risk: tràn bảng POS/inventory ở 360px | Fix: test tay 360/768/1024px, log lỗi tràn.
- **Q94.** Verdict: FAIL | Severity: MEDIUM | Evidence: không playwright/cypress/browserslist; lighthouse 0 hit | Risk: vỡ layout/logic trên Safari iOS/Firefox | Fix: CI smoke 4 trình duyệt hoặc test tay Safari iOS trước launch.
- **Q95.** Verdict: PARTIAL | Severity: LOW | Evidence: `layout.tsx:24-38` title/OG `vi_VN` thật; `favicon.ico` tồn tại | Risk: OG thiếu images; còn `vercel.svg/next.svg` mẫu | Fix: thêm `openGraph.images`/twitter card `/shop/og.jpg`, xóa svg mẫu.
- **Q96.** Verdict: PASS | Severity: INFO | Evidence: ✅ vòng 1 thêm `src/app/not-found.tsx` (404 branded + link `/` + `/track`) và link Về trang chủ/Theo dõi đơn vào `error.tsx`, `orders/error.tsx`, `pos/error.tsx` | Fix: xong.
- **Q97.** Verdict: PASS | Severity: INFO | Evidence: client `src/app/shop/**` không localhost/staging; fallback `https://melio.vn` | Risk: `mail.ts:43` fallback `no-reply@localhost` (server) | Fix: fail-fast `MAIL_FROM` lúc boot.
- **Q98.** Verdict: UNKNOWN | Severity: MEDIUM | Evidence: `next.config.ts` không `productionBrowserSourceMaps`; chưa curl `.map` prod | Risk: lộ source qua sourcemap | Fix: set `false` explicit + curl kiểm tra staging.
- **Q99.** Verdict: N/A | Severity: INFO | Evidence: web Next.js, không android/ios/assetlinks | Fix: không.
- **Q100.** Verdict: PASS | Severity: INFO | Evidence: ✅ vòng 1 xóa `src/app/manifest.ts` trùng, giữ `public/manifest.json` duy nhất; sinh `public/icons/icon-192.png` + `icon-512.png` thật (PIL, từ favicon) | Fix: xong.

### J. Accessibility & i18n

- **Q101.** Verdict: PASS | Severity: LOW | Evidence: `shop/page.tsx:116` main; `nav.tsx` nav/role; label htmlFor; focus-visible; `SkipLink.tsx` | Fix: không.
- **Q102.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `DESIGN.md:81` tuyên bố 4.5:1/7:1, không report đo | Risk: `#64748b` trên nền sáng có thể rớt AA | Fix: chạy axe + sửa cặp màu fail.
- **Q103.** Verdict: PASS | Severity: LOW | Evidence: `ProductCover.tsx:100` alt; `Pager.tsx:28,36` aria; ShopOverlays aria-label | Fix: không.
- **Q104.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `ConfirmDialog.tsx:45-75` trap Tab + ESC; `useEscapeClose` chỉ ESC ở các modal còn lại | Risk: modal ngoài ConfirmDialog thiếu trap focus | Fix: tách FocusTrap dùng chung.
- **Q105.** Verdict: PASS | Severity: LOW | Evidence: `globals.css:265-301` `prefers-reduced-motion` | Fix: không.
- **Q106.** Verdict: N/A | Severity: INFO | Evidence: single-locale `lang vi`; `toLocaleString("vi-VN")`; không next-intl | Fix: thêm i18n khi mở thị trường mới.
- **Q107.** Verdict: PASS | Severity: LOW | Evidence: `time.ts:5-22` `BUSINESS_TZ Asia/Ho_Chi_Minh`; DB session UTC; vnpay giờ VN | Fix: không.
- **Q108.** Verdict: N/A | Severity: INFO | Evidence: thị trường VN LTR; tràn chữ line-clamp/truncate | Fix: không.

### K. Performance & scale

- **Q109.** Verdict: FAIL | Severity: MEDIUM | Evidence: lighthouse/webpagetest 0 hit; k6 chỉ đo API | Risk: không ngân sách LCP/INP/CLS | Fix: Lighthouse mobile `/`, `/shop`, `/shop/p/[id]`, ngưỡng LCP<2.5 INP<200 CLS<0.1.
- **Q110.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `ProductCover` next/image 400x500 + lazy | Risk: thiếu `images.formats/remotePatterns/sizes`; cover placeholder | Fix: bật AVIF/WebP + remotePatterns CDN + sizes breakpoint.
- **Q111.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `shop/page.tsx:49-59` dynamic ssr:false 5 overlay | Risk: không bundle-analyzer/budget | Fix: `@next/bundle-analyzer` + ngưỡng JS initial.
- **Q112.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `next.config.ts:42-50` Cache-Control static 3600+SWR, `/_next/static` immutable; SW cache-first static | Risk: không CDN; chưa chứng minh HTML user riêng không cache | Fix: khai báo CDN + kiểm tra HTML không Cache-Control public.
- **Q113.** Verdict: PASS | Severity: LOW | Evidence: `loadtests/BASELINE.md:41-54` catalog p95 5.4ms, checkout p95 35.6ms, 0 5xx; EXPLAIN ~1ms | Risk: baseline máy dev | Fix: re-run sau đổi schema/index.
- **Q114.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `k6-catalog-checkout.js:37-64` kịch bản 1000+50 + threshold; gate staging chưa chạy, local OOM đơn process | Risk: chưa biết chịu tải launch | Fix: full-scale trên staging DB cỡ prod + Redis thật, k6 máy riêng.
- **Q115.** Verdict: PASS | Severity: LOW | Evidence: `optPage` 1-100; mọi list skip/take; không GET /all | Risk: `take 2000` nội bộ + sitemap 5000 build-time | Fix: giám sát query take lớn.
- **Q116.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: export async, webhook queue claim, einvoice fire-and-forget | Risk: `concierge/route.ts:667` `callLlm timeoutMs 45s` chặn request, 3 rounds đồng bộ | Fix: streaming/SSE + rút timeout + UI tiến trình.
- **Q117.** Verdict: N/A | Severity: INFO | Evidence: PM2 `next start`, không serverless | Fix: không.
- **Q118.** Verdict: PASS | Severity: LOW | Evidence: agentRateLimit 20 + daily global 2000 + TURN_TOKEN_BUDGET 12k + maxTokens 800 + plan searchBudget 8 | Risk: cap đếm turns không phải VND, chưa alert quota | Fix: alert 80% daily + dashboard `concierge_usage`.

### L. Testing

- **Q119.** Verdict: PASS | Severity: INFO | Evidence: `test-storefront.ts:33-44` guest checkout + idempotency; `test-p0.ts:80-109` order/return/refund; CI chạy 11 suite | Risk: chỉ API-level, thiếu browser E2E | Fix: giữ; E2E khi checkout UI đổi lớn.
- **Q120.** Verdict: PASS | Severity: INFO | Evidence: `test-p0.ts:55-68` Store A→B 403; `test-tenant-isolation.ts:41-62` withOrg A/B | Fix: không.
- **Q121.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `test-webhooks.ts:66-78` sig+dedup; `test-einvoice` stub; `test-vnpay` skip khi thiếu secret; drift guard chặn DROP | Risk: payment live path skip; migration mới chỉ parity | Fix: job CI bắt buộc VNPay sandbox secret; skip chỉ local.
- **Q122.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: thresholds statements 45/branches 35 (thấp); ~63 file test | Risk: code rủi ro không test vẫn pass | Fix: nâng module auth/payments/inventory lên 70+, giữ global cũ.
- **Q123.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: CI build + start + 11 suite tsx, không playwright, không flaky detector | Risk: không E2E trình duyệt | Fix: log suite fail nhiều nhất 4 tuần trước khi thêm retry/quarantine.
- **Q124.** Verdict: PASS | Severity: INFO | Evidence: `seed.ts:66-69` guard production; RUNBOOK/README cấm | Risk: `seed-agent2.ts` chưa copy guard | Fix: copy 3 dòng guard sang seed-agent2.ts.
- **Q125.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `smoke-agent.ts` + `STAGING.md:37-40` gate staging; deploy job chỉ echo | Risk: smoke prod thủ công | Fix: sau pm2 reload chạy `curl ready + smoke-agent` rồi route traffic, ghi RUNBOOK.
- **Q126.** Verdict: PARTIAL | Severity: LOW | Evidence: CI lint (`--max-warnings=0`) + `tsc --noEmit` | Risk: không format gate | Fix: thêm `prettier --check` vào CI.
- **Q127.** Verdict: N/A | Severity: INFO | Evidence: monorepo duy nhất; smoke-agent check manifest khớp code | Fix: không.
- **Q128.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `redis.test.ts` fallback; RUNBOOK LLM-unset → 503 + canned | Risk: không test DB-down graceful | Fix: test boot với DATABASE_URL sai → ready 503 + error page có đường về, không stack.

### M. CI/CD

- **Q129.** Verdict: PASS | Severity: INFO | Evidence: `.github/workflows/ci.yml:27-39` lint + tsc + unit + coverage + audit high blocks; build-test needs unit-tests | Fix: không.
- **Q130.** Verdict: FAIL | Severity: HIGH | Evidence (đã verify): `.github/workflows/ci.yml:132-140` job Deploy chỉ `echo "Ready for deployment"`; `OPERATIONS.md:5-10` deploy tay npm/migrate/start; `rollback.sh` tay | Risk: prod deploy phụ thuộc SSH tay, không artifact, dễ sai bước ngày launch | Fix: job CD chạy migrate + pm2 reload từ SHA đã test; giữ script hiện tại làm fallback.
- **Q131.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: rollback theo git SHA + RUNBOOK ghi SHA; không image digest | Risk: build lại từ source — 2 build cùng SHA có thể khác | Fix: build 1 lần trên CI, tar `.next` theo SHA, prod chỉ giải nén.
- **Q132.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `STAGING.md` DB riêng, gate lint/tsc/smoke/click-through | Risk: staging cùng box, data demo, benchmark local tranh CPU | Fix: gate 1000 VUs trên staging máy riêng trước launch lớn.
- **Q133.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `RUNBOOK.md:29-34` redeploy SHA cũ; pm2 rolling; `wait_ready: false` | Risk: không mục tiêu <X phút; reload không đợi live | Fix: `wait_ready: true` + health check; diễn tập rollback bấm giờ.
- **Q134.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: RUNBOOK backup→migrate→start→ready; forward-only; drift guard chặn destructive DDL | Risk: phụ thuộc kỷ luật tay với breaking schema | Fix: checklist expand (nullable→backfill→deploy→not-null) vào RUNBOOK.
- **Q135.** Verdict: UNKNOWN | Severity: MEDIUM | Evidence: CI deploy khi push main, không environment/required-reviewers trong file; branch protection nằm ngoài repo | Risk: chưa rõ approval prod | Fix: bật GitHub environment production + required reviewers, ghi vào OPERATIONS.md.
- **Q136.** Verdict: PASS | Severity: INFO | Evidence: CI chỉ secret dummy, không prod secret, không print env | Fix: không.
- **Q137.** Verdict: N/A | Severity: INFO | Evidence: chỉ ci.yml + backup-drill.yml, không preview env | Fix: khi thêm preview thì auth wall + noindex.
- **Q138.** Verdict: PARTIAL | Severity: LOW | Evidence: `LOADTEST_MODE` guard + alert khi bật; concierge demo-mode; không framework flag chung | Risk: default an toàn không đồng nhất | Fix: bảng env flag + default vào OPERATIONS.md; risky flag default off.

### N. Observability, incident & backup

- **Q139.** Verdict: PARTIAL | Severity: HIGH | Evidence: ✅ vòng 1 `prod-checklist.sh` thiếu tracking đã chuyển WARN → FAIL (không tracking là không go-live) | Risk: còn — phải chạy checklist thật trên prod + scrub PII trong `trackError` (xem Q64) | Fix: code gate xong — còn chạy + scrub.
- **Q140.** Verdict: PASS | Severity: INFO | Evidence: `proxy.ts:103-110,136-143` x-request-id + log JSON; `api.ts:11-22` requestId; RUNBOOK cấm paste secret vào ticket | Fix: không bắt buộc.
- **Q141.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `metrics.ts` buckets p95 + 429/5xx + pool p95; `/api/metrics` snapshot; `check-alerts` ngưỡng | Risk: thiếu CPU/mem/disk host | Fix: pm2 monit/df + PgBouncer SHOW POOLS vào prod-checklist; script hóa alert `cl_waiting>0`.
- **Q142.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `check-alerts.ts:46-53` synthetic login + poll jobs/metrics; health live/ready; backup healthcheck ping | Risk: không uptime robot ngoài + homepage public check trong repo | Fix: cron ngoài curl homepage + login + storefront, page khi 2 fail liên tiếp.
- **Q143.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: exit non-zero để cron page; dedup chống storm; RUNBOOK ngưỡng + wire; on-call ack 15min/2h | Risk: người nhận thật nằm ngoài repo, chưa verify trực | Fix: điền HEALTHCHECK_URL + mailbox vào secret store; test page 1 lần.
- **Q144.** Verdict: PASS | Severity: INFO | Evidence: `health/live` process up; `health/ready` SELECT 1 + 503 khi DB chết; no-store | Risk: `wait_ready: false` (vận hành, xem Q133) | Fix: bật `wait_ready: true`.
- **Q145.** Verdict: PARTIAL | Severity: HIGH | Evidence: ✅ vòng 1 `backup-offsite.sh` hỗ trợ encrypt qua `BACKUP_ENCRYPT_KEY` (age recipient hoặc GPG key; không tool encrypt là từ chối upload plaintext) + prune giữ file `.dump*` | Risk: còn — ops phải set key + chạy drill tay lưu output | Fix: tooling xong — còn set key + drill.
- **Q146.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: RUNBOOK triage + rollback + alerts; OPERATIONS on-call + post-mortem | Risk: thiếu tên/sđt oncall, kênh page, mẫu notify (đúng là nằm ngoài code) | Fix: điền vào HANDOVER, không commit sđt lên git.
- **Q147.** Verdict: FAIL | Severity: LOW | Evidence: `statuspage|status.io|/status` 0 hit; chỉ announce maintenance 72h không kênh | Risk: sự cố không kênh thông báo | Fix: 1 kênh có sẵn (Telegram/healthchecks status) + link vào RUNBOOK.
- **Q148.** Verdict: PASS | Severity: INFO | Evidence: auditLog ở auth/pos/customers/inventory/catalog + list API + prune retention | Fix: không.
- **Q149.** Verdict: N/A | Severity: INFO | Evidence: monolith 1 deploy; requestId đủ trace | Fix: OTel chỉ khi tách service thứ 3.
- **Q150.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `DEEPSEEK_DAILY_LIMIT` default 2000 + `MERCHANT_DAILY_LIMIT` | Risk: chỉ cap LLM, không budget alert cloud/egress | Fix: billing alert nhà cung cấp + alert 80% cap LLM.

### O. Legal, content, support, business

- **Q151.** Verdict: FAIL | Severity: HIGH | Evidence (đã verify): `src/app/terms|privacy|pricing` **không tồn tại**; grep Terms/Privacy chỉ trúng `paymentTerms/matchTerms` | Risk: thị trường VN (VND, vi-VN, NĐ13) bắt buộc ToS/Privacy; checkout không có link điều khoản | Fix: thêm `/terms`, `/privacy`, `/chinh-sach-giao-hang-doi-tra` tĩnh, link footer + checkout, khớp thu thập thật.
- **Q152.** Verdict: FAIL | Severity: LOW | Evidence: `LICENSE|NOTICE|COPYING` 0 file; deps chính đều permissive | Risk: thiếu quyền sở hữu + rà license đệ quy | Fix: thêm `LICENSE`, chạy `license-checker --summary`.
- **Q153.** Verdict: PARTIAL | Severity: LOW | Evidence: font Geist/Playfair (OFL), lucide-react; seed tên sách/NXB/thương hiệu thật | Risk: quyền bìa sách/ảnh stock code không trả lời được | Fix: hỏi người nguồn ảnh; thay ảnh không quyền trước launch.
- **Q154.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `seed.ts:74-76` plans FREE/PRO/ENTERPRISE + `plan-limits.ts` enforce + billing page hiện amount | Risk: không `/pricing` public; trial chỉ text | Fix: `/pricing` render từ bảng Plan, hoặc xóa claim trial công khai.
- **Q155.** Verdict: FAIL | Severity: BLOCKER | Evidence (đã verify): `vnpay.ts:9` + `billing.ts:17` `sandbox.vnpayment.vn`, `momo.ts:13` `test-payment.momo.vn`, `zalopay.ts:13` `sb-openapi.zalopay.vn` — **hardcode, không nhánh prod**; settle verify tốt (timingSafeEqual, amount check, idempotent) | Risk: launch là thu tiền sandbox — không nhận tiền thật; hoàn tiền vẫn thủ công | Fix: đưa host+key vào env (`VNP_PAY_HOST`…), fail-fast thiếu secret prod, verify IPN ký thật qua `prod-checklist.sh`; ghi SLA hoàn thủ công.
- **Q156.** Verdict: PARTIAL | Severity: HIGH | Evidence: `mail.ts:43` fallback `no-reply@localhost`; template không `List-Unsubscribe`/unsubscribe link; reset link log server khi thiếu SMTP | Risk: SPF/DKIM là DNS (ngoài code); mail prod vào spam; token lộ qua log | Fix: fail-fast SMTP prod; thêm `List-Unsubscribe` + 1-click; template không nhúng token. Hỏi người bản ghi DNS `melio.vn`.
- **Q157.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `support.ts` canned + escalate; `support-widget.tsx` queue OPEN/ESCALATED/CLOSED; SLA PRO 1 ngày/ENT 4h trong OPERATIONS; `HANDOVER.md:7-21` toàn TODO, hotline không số | Risk: chưa người trực launch day | Fix: điền HANDOVER mailbox + người trực; test 1 thread end-to-end. Hỏi người ai trực + số hotline.
- **Q158.** Verdict: N/A | Severity: INFO | Evidence: không gtag/posthog/mixpanel; chỉ ops log nội bộ | Fix: khi thêm analytics thì allowlist event, cấm PII, 1 helper `track()`.
- **Q159.** Verdict: PASS | Severity: INFO | Evidence: ✅ vòng 1 `robots.ts` — `APP_ORIGIN` khác `https://melio.vn` → `Disallow: /` toàn site; prod giữ allowlist cũ | Fix: xong (staging không lọt Google).
- **Q160.** Verdict: PARTIAL | Severity: LOW | Evidence: `metadataBase`, OG `vi_VN`; JSON-LD Book+Offer VND; OG article blog | Risk: thiếu `canonical`显式; hreflang OK vì 1 ngôn ngữ | Fix: `alternates.canonical` product/blog.
- **Q161.** Verdict: PARTIAL | Severity: LOW | Evidence: CHANGELOG có entry; RUNBOOK template; `AnnouncementBar` promo (không phải launch banner); không help center/kill-switch | Risk: thiếu kênh comms sự cố | Fix: trang `/ho-tro` + 3 announcement dự phòng + công tắc `MAINTENANCE_MODE` nếu cần.
- **Q162.** Verdict: PARTIAL | Severity: LOW | Evidence: OPERATIONS SLA 99.5/99.9, p95 checkout <3s; RUNBOOK alert 5xx>2% | Risk: chưa định nghĩa "launch thành công" bằng số | Fix: 5 số vào HANDOVER (uptime 24h, 5xx, p95 checkout, đơn thành công, ticket tồn); dưới ngưỡng → rollback.

### P. Mobile (không có — N/A toàn nhóm)

- **Q163–Q168.** Verdict: N/A | Severity: INFO | Evidence: `PRODUCT.md:7` `Platform: web`; không capacitor/expo/RN, không android/ios/keystore; web deploy tức thì; không local DB mobile | Fix: khi làm app native mới audit lại.

### Q. AI/LLM/agent

- **Q169.** Verdict: PASS | Severity: INFO | Evidence: `fencing.ts:24-43` sanitize + `<UNTRUSTED_DATA>`; `concierge/route.ts:291-292` tool result là data; `ai-safety.test.ts:12-32` regression | Fix: giữ; thêm case đối đầu mới khi phát hiện.
- **Q170.** Verdict: PASS | Severity: INFO | Evidence: `agent.ts:1-5,107-109` read-only + PAYMENT/REFUND cần human; 9 tool cố định; `prepare_checkout` chỉ trả checkoutUrl, khách bấm Thanh toán; `/approvals` duyệt staged change; `sync_cart` rate-limit + audit `agent_write` | Fix: review log `agent_write` tuần đầu.
- **Q171.** Verdict: PASS | Severity: INFO | Evidence: semantic tier `WHERE orgId` (`storefront.ts:290`); recommendations orgId; chat rows scope orgId+chatId; subject từ session cookie không từ body | Fix: thêm test 2-org cho semantic tier nếu chưa có.
- **Q172.** Verdict: PARTIAL | Severity: HIGH | Evidence: memory chặn PII + toolTrace chỉ name+ok; NHƯNG chat free-text gửi thẳng LLM không scrub (`route.ts:499`), `AgentChatTurn` lưu raw | Risk: user paste SĐT/địa chỉ → lọt prompt DeepSeek/OpenRouter/Gemini + DB | Fix: `redactPii()` trước `callLlm` (raw tối đa 7 ngày hoặc không lưu); DPA vendor AI. Hỏi người retention chat raw.
- **Q173.** Verdict: PASS | Severity: INFO | Evidence: 20/phút + daily IP/global 2000 + TURN_TOKEN_BUDGET 12k + maxTokens 800 + plan searchBudget 8 | Risk: cap đếm turns không phải VND | Fix: alert 80% + ghi giá/1k tokens vào HANDOVER.
- **Q174.** Verdict: PASS | Severity: INFO | Evidence: thiếu key → 503 demo; upstream lỗi → 502; search lỗi → `[]`; grounding drop id lạ; `humanVerified:false` | Fix: giữ.
- **Q175.** Verdict: PARTIAL | Severity: MEDIUM | Evidence: `ai-safety.test.ts` + intent-router/fencing test + `smoke:agent` | Risk: mới unit regression, chưa red-team người thật | Fix: 20 case đối đầu (giá 1đ, ignore previous, mã giả, chốt thiếu info, SĐT trong memory) ghi vào CHANGELOG.
- **Q176.** Verdict: PASS | Severity: INFO | Evidence: nút/header `Thủ Thư AI · Melio Concierge`; provenance `humanVerified:false` | Risk: user tưởng giá chat là giá cuối | Fix: thêm dòng "giá cuối theo trang thanh toán" dưới ô chat.

### R. Founder phải trả lời (code không đủ)

- **Q177.** Verdict: UNKNOWN | Severity: HIGH | Evidence: OPERATIONS/RUNBOOK có flow nhưng `HANDOVER.md:7-21` toàn TODO, không tên/số | Fix: hỏi người — ai incident commander + sđt + kênh page?
- **Q178.** Verdict: UNKNOWN | Severity: MEDIUM | Evidence: không RISK-ACCEPTANCE trong repo | Fix: hỏi người — rủi ro nào chấp nhận văn bản (pentest? red-team AI? sandbox payment? DPA?) Ai ký?
- **Q179.** Verdict: UNKNOWN | Severity: HIGH | Evidence: thị trường VN rõ (NĐ13 qua phone/địa chỉ/đơn hàng); không lưu thẻ nên PCI hẹp | Fix: hỏi người — chỉ VN hay cả EU (GDPR)? DPA với LLM/email/hosting vendor?
- **Q180.** Verdict: UNKNOWN | Severity: MEDIUM | Evidence: có mảnh kỹ thuật (PM2 cluster, cache edge, admission 20 checkout, loadtests) nhưng không playbook x10 + owner | Fix: hỏi người ngưỡng bật Cloudflare Under Attack / tắt AI / đóng checkout + ai bấm nút.

## 4. BLOCKER (2 — phải đóng trước launch)

1. **[Q9] Live secret trong `bookstore/.env` worktree** — `bookstore/.env` (untracked, chưa từng commit — đã verify `git log` rỗng) chứa `GEMINI_API_KEY`, `LLM_API_KEY`, `INTEGRATION_ENCRYPTION_KEY`, `SEED_USER_PASSWORD=localdevpassword123`. **CHƯA FIX — cần người:** revoke 3 key + rotate encryption key + secret store (code không tự revoke key ngoài hệ thống được). Đã làm phần code: root `.gitignore` + `bookstore/.dockerignore` chặn secret lọt image/repo sau này.
2. **[Q155] Thanh toán hardcode sandbox → ĐÃ FIX CODE, còn việc ops** — host/key tách ra env: `vnpayHost()` (`src/lib/vnpay.ts`), `momoCreateUrl()` (`src/lib/momo.ts`), `zaloPayCreateUrl()` (`src/lib/zalopay.ts`); `billing.ts` reuse `vnpayHost()`; sandbox default an toàn; `.env.example` ghi rõ prod phải set live host; `prod-checklist.sh` có mục 4b check live host + test `payment-hosts.test.ts`. **Còn lại:** ops set 3 biến live + verify IPN ký thật trước launch.

## 5. HIGH (24 còn lại + 3 đã đóng code — mỗi mục cần owner + hạn chốt, hoặc risk acceptance văn bản) — mỗi mục cần owner + hạn chốt, hoặc risk acceptance văn bản)

Q10 ✅ code xong · Q23 (reset link GET) · Q24 (lockout/CAPTCHA) · Q29 (MFA admin) · Q32 (seed prod) · Q33 (public mutations inventory) · Q34 ✅ code xong (quét toàn API) · Q35 (legacy superuser bypass: `org-scope.ts:23,42,51`, `auth.ts:129`) · Q37 (admin guard phân tán) · Q38 (object-check không đều) · Q39 (webhook thiếu timestamp window) · Q45 (CSRF `bs_customer`) · Q53 (rate-limit admin POST) · Q60 (không privacy policy) · Q62 (không xóa tài khoản) · Q64 (PII trong log/Sentry: `api.ts:13-15`, `error-tracking.ts:127-136`) · Q65 (at-rest plaintext) · Q66 ✅ tooling xong (chờ ops set BACKUP_ENCRYPT_KEY) · Q70 (DB access nội bộ — hỏi ops) · Q130 (deploy tay: `.github/workflows/ci.yml:132-140`) · Q139 ✅ gate xong (còn chạy + scrub) · Q145 ✅ tooling xong (chờ ops set key + drill) · Q151 (không terms/privacy pages) · Q156 (SMTP/mail) · Q172 (chat PII tới LLM: `concierge/route.ts:499`) · Q177 (incident commander — hỏi người) · Q179 (luật áp dụng/DPA — hỏi người).

## 6. MEDIUM/LOW nổi bật (chọn lọc)

Q2 journeys · Q5 staging cùng box · Q19 nginx deny dotfile + sourcemap (Q98) · Q22 password strength · Q30 email verify · Q40 download token · Q54 body limit · Q59 data-map · Q61 consent có điều kiện · Q63 retention matrix · Q67 DPA/DNS · Q69 self-export · Q81 OpenAPI · Q87 TZ scheduler · Q88 jitter · Q93/Q94 responsive + cross-browser · Q96 not-found page · Q100 PWA manifest · Q102 contrast · Q104 focus trap · Q109 Lighthouse · Q110 AVIF · Q111 bundle budget · Q112 CDN · Q114 load test staging · Q116 concierge streaming · Q121 payment secret CI · Q122 coverage module rủi ro · Q123 flaky log · Q125 smoke sau deploy · Q128 DB-down test · Q131 artifact immutable · Q132/Q133/Q134 staging gate + rollback drill + expand/contract · Q135 branch protection · Q141/Q142/Q143 saturation + uptime robot + oncall verify · Q146 HANDOVER · Q147 status channel · Q150 billing alert · Q153 ảnh bìa · Q154 pricing page · Q157 trực launch · Q159 staging noindex · Q175 red-team AI · Q178/Q180 risk-accept + playbook x10.

## 7. N/A có lý do (24)

Q15 (không remote flag) · Q27/Q28/Q31 (không OAuth/JWT/OTP-login) · Q42 (không impersonation) · Q48 (không upload) · Q56 (không container) · Q76 (không soft-delete) · Q89/Q90 (không S3/GraphQL) · Q99 (không mobile deep link) · Q106/Q108 (single-locale vi, LTR) · Q117 (không serverless) · Q127 (monorepo duy nhất) · Q137 (không preview env) · Q149 (monolith, chưa cần tracing) · Q158 (không product analytics) · Q163–Q168 (không app native).

## 8. Việc 24h (đóng BLOCKER + chặn cháy)

1. Revoke `GEMINI_API_KEY`, `LLM_API_KEY`, rotate `INTEGRATION_ENCRYPTION_KEY` (Q9) — owner: backend, hạn: hôm nay. **CHƯA LÀM — cần người.**
2. ~~Payment host/key ra env~~ ✅ code xong — còn: ops set 3 biến live (`VNP_PAY_HOST`, `MOMO_CREATE_URL`, `ZALOPAY_CREATE_URL`) + verify IPN ký thật (Q155).
3. Xóa `ALLOW_SEED_PRODUCTION` trên prod + đổi mật khẩu seed (Q32).
4. ~~Bật encrypt backup~~ ✅ tooling xong — còn: ops set `BACKUP_ENCRYPT_KEY` (age/GPG) + chạy drill lưu output (Q66/Q145).
5. ~~`prod-checklist.sh`: thiếu error tracking → FAIL~~ ✅ xong (Q139) — còn: chạy checklist thật trên prod.
6. ~~Staging `noindex` + deny dotfile nginx~~ ✅ xong (Q19/Q159) — còn: `productionBrowserSourceMaps: false` + curl `.map`.
7. Tạo kênh sự cố + điền oncall/HANDOVER (Q143/Q146/Q147/Q177).
8. Điền incident commander + sđt (Q177) — founder.
9. Bọc nốt `where:{id}` trần còn lại: `grep -rn 'where: { id }' src/app/api` (Q34 — 2 route mẫu xong).
10. Chạy `prod-checklist.sh` thật trên prod sau khi set env (Q139/Q155).

## 9. Việc 72h (HIGH còn lại)

MFA admin hoặc risk-accept (Q29) · CSRF `bs_customer` (Q45) · rate-limit admin POST (Q53) · webhook timestamp (Q39) · withOrg trong mọi write (Q34) + scope invoices/webhooks (Q35) · guard admin tập trung (Q37) · `/privacy` `/terms` (Q60/Q151) · `DELETE /api/account` (Q62) · scrub PII log (Q64) · `redactPii` chat trước LLM (Q172) · SMTP fail-fast + unsubscribe (Q156) · CD pipeline tối thiểu từ SHA đã test (Q130) · reset link POST (Q23) · CAPTCHA/Redis bắt buộc multi-instance (Q24) · `.dockerignore` (Q10) · public-mutations inventory (Q33) · at-rest doc + bật encrypt (Q65) · trả lời Q70/Q179 (ops/founder).

## 10. Việc 14 ngày sau launch

OpenAPI (Q81) · Lighthouse + ngưỡng (Q109) · cross-browser Safari iOS (Q94) · load test staging cỡ prod (Q114) · bundle budget + AVIF (Q110/Q111) · 404/PWA manifest (Q96/Q100) · contrast + focus trap (Q102/Q104) · concierge streaming (Q116) · red-team AI 20 case (Q175) · coverage module rủi ro 70+ (Q122) · artifact immutable + rollback drill bấm giờ (Q131/Q133) · expand/contract checklist (Q134) · branch protection (Q135) · uptime robot ngoài (Q142) · billing alert (Q150) · retention matrix + data-map + self-export (Q59/Q63/Q69) · DPA + DNS mail (Q67) · pricing page (Q154) · ảnh bìa quyền (Q153) · `/ho-tro` + launch comms (Q161) · định nghĩa launch-thành-công bằng số (Q162).

## 11. Câu hỏi treo cho người

1. Ai incident commander + sđt + kênh page? (Q177)
2. Risk acceptance văn bản cho mục nào, ai ký? (Q178 — MFA? pentest? DPA? red-team?)
3. Chỉ VN (NĐ13) hay cả EU (GDPR)? DPA vendor LLM/email/hosting? (Q179)
4. Ngưỡng x10 traffic: khi nào Under Attack / tắt AI / đóng checkout, ai bấm? (Q180)
5. PG access nội bộ: role per-người + SSO + audit? (Q70)
6. Có phục vụ trẻ em/dữ liệu đặc biệt? (Q68)
7. Chat raw lưu bao lâu? (Q172) · Nguồn ảnh bìa/ảnh stock có quyền? (Q153) · Bản ghi SPF/DKIM/DMARC `melio.vn`? (Q156) · Ai trực chat/mail launch day + hotline? (Q157)

---

*Ghi chú phương pháp: mỗi verdict dựa trên file đọc thật (path:line). Không thấy bằng chứng = FAIL với secrets/auth/backup/PII/payment, UNKNOWN với thứ ngoài code (DNS, oncall, luật). Không bịa file. Hai điểm tự hiệu chỉnh sau spot-check: Q34 hạ từ BLOCKER → HIGH (guard-read chặn cross-tenant trực tiếp, còn lại là bẫy latent); Q52 giữ PASS (HSTS/redirect/cookie đủ, chỉ thiếu curl live).*
