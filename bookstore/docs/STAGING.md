# Staging environment (pre-production gate)

Mọi release đi production phải chạy qua staging trước: `dev → staging → production`.
Staging là bản sao thu nhỏ của production trên cùng một box (hoặc box riêng rẻ
hơn), KHÔNG BAO GIỜ dùng database production.

## 1. Dựng staging (một lần)

```bash
# 1. Database riêng
createdb bookstore_staging

# 2. Env riêng (copy từ production rồi đổi 4 giá trị này)
cp bookstore/.env bookstore/.env.staging
# DATABASE_URL → .../bookstore_staging
# APP_ORIGIN → https://staging.example.com
# PORT=3001  (production chạy :3000)
# SMTP_* → giữ nguyên hoặc dùng mailbox test

# 3. Migrate + seed demo (production CẤM seed)
DATABASE_URL=.../bookstore_staging npx prisma migrate deploy
DATABASE_URL=.../bookstore_staging SEED_USER_PASSWORD=<demo> npx prisma db seed

# 4. Chạy ở port riêng
PORT=3001 npm start
```

Nginx: thêm server block `staging.example.com → 127.0.0.1:3001` (copy từ
`deploy/nginx.conf`, đổi `server_name` + port).

## 2. Quy trình release

```bash
git tag staging-$(date +%Y%m%d-%H%M)   # đánh dấu release candidate
# deploy lên staging (migrate deploy + build + restart :3001)
# chạy gate:
npm run lint && npx tsc --noEmit
SEED_USER_PASSWORD=<demo> BASE_URL=https://staging.example.com npm run test:storefront
npx tsx scripts/smoke-agent.ts
# click-through: POS bán 1 đơn, checkout online 1 đơn, hoàn tiền 1 đơn
# đạt hết → deploy production theo docs/OPERATIONS.md
```

## 3. Nguyên tắc

- Không copy dữ liệu production về staging (PII khách hàng). Cần dữ liệu thật
  để debug → lấy 1 đơn cụ thể, ẩn danh hóa trước khi nhập tay.
- Không cấu hình webhook production (VNPay/MoMo/ZaloPay IPN, carrier webhook)
  trỏ về staging — callback thật vào staging gây lệch trạng thái đơn production.
- Staging được phép reset bất cứ lúc nào: drop DB → migrate → seed lại.
