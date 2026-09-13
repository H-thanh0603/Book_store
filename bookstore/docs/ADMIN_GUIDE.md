# Hướng dẫn quản trị cửa hàng (dành cho chủ shop)

Không cần developer cho các thao tác dưới đây. Đăng nhập staff tại `/login`.

## 1. Hàng ngày

| Việc | Ở đâu | Ghi chú |
|---|---|---|
| Mở ca POS | `/pos` → Mở ca | Mỗi terminal một ca `OPEN` |
| Bán hàng | `/pos` | Giá, khuyến mãi, tích điểm tính tự động; xem trước ở nút báo giá |
| Đóng ca | `/pos` → Đóng ca | Đối chiếu tiền mặt kỳ vọng (gồm cả đơn hoàn) |
| Đơn online | `/orders` | Xác nhận → đóng gói → bàn giao → giao xong; hủy chỉ khi chưa thu tiền |
| Hoàn tiền VNPay | `/settings/payments` | **Thủ công**: hoàn qua portal VNPay (theo mã giao dịch) rồi bấm “Đánh dấu đã hoàn” |

## 2. Hàng hóa

| Việc | Ở đâu | Ghi chú |
|---|---|---|
| Thêm sản phẩm | `/products` → Thêm | Nhập tên, giá, tồn kho, ảnh rồi Publish |
| Thể loại / thương hiệu / tác giả / NXB | `/categories` | Không xóa được mục đang có sản phẩm dùng |
| In tem mã vạch | `/products/barcodes` | Quét bằng camera ở POS |
| Sức khỏe listing | `/products/health` | Thiếu ảnh/giá/mô tả |
| Kiểm kê | `/inventory/counts` | Đếm → duyệt chênh lệch mới ghi sổ |
| Nhập hàng | `/purchase-orders` + `/suppliers` | Tạo PO → NCC xác nhận → nhận hàng |
| Điều chuyển chi nhánh | `/transfers` | Gợi ý nhập hàng AI ở `/inventory/suggestions` |

## 3. Khách hàng & marketing

| Việc | Ở đâu | Ghi chú |
|---|---|---|
| Khách hàng, hạng, điểm | `/customers` | Member/Silver/Gold/Platinum theo điểm tích lũy |
| Khuyến mãi, coupon | `/promotions` | Giới hạn lượt dùng/khách được cưỡng chế tự động |
| Gift card | `/gift-cards` | Nạp → trừ khi thanh toán |
| Duyệt đánh giá | `/reviews` | Chỉ đánh giá APPROVED mới hiện ở shop |
| Duyệt đề xuất AI | `/approvals` | Mọi đề xuất AI (khuyến mãi, sửa mô tả) chỉ áp dụng sau khi duyệt |

## 4. Nhân sự & giám sát

| Việc | Ở đâu | Ghi chú |
|---|---|---|
| Mời nhân viên | `/team` | Chọn vai trò + chi nhánh; không cấp được owner/admin ở đây |
| Báo cáo | `/reports`, `/reports/revenue`, `/reports/analytics` | Doanh thu theo shop/loại hàng, top SKU, hàng chậm |
| Nhật ký thao tác | `/audit-logs` | Ai làm gì, khi nào |
| Dashboard | `/dashboard` | KPI hôm nay/tháng, tồn thấp, nút “AI giải thích” |

## 5. Lưu ý quan trọng

- Giá niêm yết **đã gồm VAT**; hóa đơn điện tử tách dòng thuế tự động theo `taxRate` sản phẩm.
- Đơn đã thu tiền online không “hủy là xong”: tiền tạo khoản **chờ hoàn** ở `/settings/payments`.
- Coupon `perCustomerLimit=1` là 1 lượt/khách thật (đếm đúng từ bản vá 2026-09).
- Mọi thắc mắc kỹ thuật: xem `RUNBOOK.md` (vận hành) và `OPERATIONS.md` (triển khai).
