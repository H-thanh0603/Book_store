# Changelog

## 2026-09-13 — Audit 100 điểm: bảo mật, logic, catalog, admin, a11y, docs

### Bảo mật (P0)

- `GET /api/customers`: yêu cầu tài khoản org-scoped, lọc `withOrg`; kiểm tra
  cùng-org ở `history`/`adjust`/`birthday_reward`.
- `GET /api/orders`: từ chối tài khoản legacy không-org (trước đây lọc rỗng =
  liệt kê xuyên tenant).
- `PUT /api/storefront/notifications`: yêu cầu chứng minh chủ sở hữu
  (`phone`/`customerId` trùng inbox) mới được đánh dấu đã đọc.

### Logic nghiệp vụ

- `claimRedemption`: tạo `count: 0` để increment có-guard đếm đúng 1 lần
  (coupon `perCustomerLimit=1` dùng được; trước đây lần đầu đã thành 2).
- Đăng ký storefront: cấp mã `CUS` bằng `nextBusinessNumber` + retry khi va chạm
  (thay `max(code)+1` gây 500 khi đăng ký đồng thời); trùng phone/email → 409.
- `quoteSale`: cùng cửa sổ hiệu lực giá với `completeSale` (chặn giá tương lai
  lọt vào báo giá).
- Đổi mật khẩu customer: chỉ thu hồi session thiết bị khác, giữ session hiện tại.

### Thuế & hoàn tiền

- Giá niêm yết là **đã gồm VAT** (`src/lib/tax.ts` + test); quote storefront/POS
  trả thêm `taxAmount` (tham khảo, tổng thanh toán không đổi).
- Hóa đơn điện tử ghi thuế thật theo `Product.taxRate` (trước đây hardcode 0).
- `GET /api/payments/refunds` khai báo `manual: true` + hướng dẫn hoàn qua portal.

### Catalog

- `GET /api/storefront`: lọc `brandId`, `minPrice`/`maxPrice`, sắp xếp
  `price_asc`/`price_desc`/`newest`/`name` (áp dụng cả 3 tầng exact/fuzzy/semantic).
- `GET /api/products`: lọc `brandId`, sắp xếp `name_asc`/`name_desc`/`newest`.

### Admin

- Trang mới `/categories` (CRUD thể loại/thương hiệu/tác giả/NXB).
- Trang mới `/reviews` (hàng đợi duyệt đánh giá).
- Trang mới `/team` (danh sách + mời nhân viên, chặn cấp owner/admin).
- Nav thêm các mục trên.

### Accessibility

- Skip link tới `<main>` ở layout gốc.
- `ConfirmDialog` bẫy focus Tab + Esc.
- Menu nav: `aria-haspopup=menu`, Esc đóng, ArrowDown nhảy tới mục đầu.

### Docs

- Mới `docs/ADMIN_GUIDE.md`, `docs/HANDOVER.md`, `docs/CHANGELOG.md` (file này).
