# Biên bản bàn giao (khách hàng điền cùng developer)

Mọi giá trị thật sống trong secret manager của môi trường deploy, KHÔNG trong
repo. Bảng dưới là checklist “ai giữ cái gì, ở đâu” — bàn giao chưa xong nếu
còn ô `TODO`.

## 1. Mặt bằng vận hành

| Hạng mục | Giá trị / vị trí | Người giữ |
|---|---|---|
| Domain shop | `TODO` (vd. nhasach.example.vn) | Khách hàng |
| Hosting / server | `TODO` (vd. VPS IP, PM2 `bookstore`) | Developer |
| HTTPS / CDN | `TODO` (vd. Cloudflare) | Developer |
| Database production | `TODO` (host, db name, `READ_REPLICA_URL` nếu có) | Developer |
| Backup offsite | `TODO` (remote rclone + cron `backup-offsite.sh`) | Developer |
| Khôi phục đã diễn tập | `TODO` (ngày chạy `restore-drill.sh` gần nhất) | Developer |
| Email gửi đi (SMTP) | `TODO` (`SMTP_HOST/USER`, `MAIL_FROM`) | Khách hàng |
| VNPay (TMN code / secret / IPN URL) | `TODO` | Khách hàng |
| Giao vận (GHTK/VTP token + webhook secret) | `TODO` | Khách hàng |
| Hóa đơn điện tử (provider + template) | `TODO` (`einvoice.provider`, `einvoice.config.*`) | Khách hàng |
| AI (Gemini/LLM key, `AGENT_CART_SECRET`) | `TODO` | Developer |

## 2. Biến môi trường bắt buộc (xem `.env.example` đầy đủ)

`DATABASE_URL`, `APP_ORIGIN`, `TRUST_PROXY_HEADERS`, `INTEGRATION_ENCRYPTION_KEY`,
`AGENT_CART_SECRET`, `SMTP_*`, `VNP_*`, `GHTK_*`/`VTP_*`, `CARRIER_WEBHOOK_SECRET`,
`SENTRY_DSN` hoặc `ERROR_WEBHOOK_URL`.

## 3. Tài khoản & quyền

| Tài khoản | Quyền | Ghi chú |
|---|---|---|
| Owner (staff) | Toàn quyền org | Đổi mật khẩu sau bàn giao |
| Kế toán | Hoàn tiền, hóa đơn | `/settings/payments`, `/invoices` |
| Kho | Nhập/xuất/kiểm kê | Không có quyền hoàn tiền |

## 4. Quy trình định kỳ

- Đóng ca POS mỗi ngày; đối chiếu `/settings/payments` mỗi tuần.
- Backup offsite hàng ngày (cron), diễn tập restore hàng tuần (CI `backup-drill.yml`).
- Xoay `INTEGRATION_ENCRYPTION_KEY` theo `RUNBOOK.md` khi nhân sự kỹ thuật rời đi.

## 5. Tài liệu đi kèm

`README.md` (chạy local), `RUNBOOK.md` (sự cố), `docs/OPERATIONS.md` (triển khai),
`docs/ADMIN_GUIDE.md` (vận hành shop), `docs/CHANGELOG.md` (lịch sử thay đổi).
