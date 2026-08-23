# Melio Book Store

Modular monolith cho vận hành nhà sách và storefront khách hàng. Next.js phục vụ UI/API; PostgreSQL là nguồn dữ liệu duy nhất; Prisma quản lý schema và migration.

## Chạy local

1. Sao chép `.env.example` thành `.env` và đặt mật khẩu seed local tối thiểu 12 ký tự.
2. Chạy PostgreSQL rồi cài schema: `npx prisma migrate deploy`.
3. Tạo dữ liệu demo: `npx prisma db seed`.
4. Khởi động: `npm run dev`.

- Storefront: `http://localhost:3000/shop`
- Staff: `http://localhost:3000/login`
- Readiness: `http://localhost:3000/api/health/ready`

## Quality gate

```bash
npm run lint
npx tsc --noEmit
npm run build
npm run test:phase3
npm run test:p0
npm run test:storefront
npm run test:hardening
```

Ba test HTTP cần app đang chạy và `SEED_USER_PASSWORD`; có thể đổi URL bằng `BASE_URL`.

## Production

- Không chạy `prisma db seed` trên production: seed chứa tài khoản và dữ liệu demo.
- Chạy `prisma migrate deploy` trước khi chuyển traffic sang release mới.
- Đặt `APP_ORIGIN` đúng URL public và chỉ bật `TRUST_PROXY_HEADERS=true` khi reverse proxy ghi đè header IP từ client.
- Secret chỉ tồn tại trong secret manager của môi trường deploy, không commit `.env`.
- Trước lần deploy hardening đầu tiên, đặt `INTEGRATION_ENCRYPTION_KEY` rồi chạy `npm run security:encrypt-integrations`; giữ nguyên key cho tới khi có quy trình rotation.
- Dùng `/api/health/live` cho liveness và `/api/health/ready` cho readiness.

Quy trình backup, restore, rollback và sự cố nằm trong [RUNBOOK.md](RUNBOOK.md).
