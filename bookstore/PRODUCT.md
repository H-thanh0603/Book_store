# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

1. **Độc giả & Người mua sắm trực tuyến (End Consumers):** Độc giả mọi lứa tuổi, học sinh, phụ huynh, người sưu tầm sách tìm kiếm trải nghiệm mua sách văn học, manga, đồ chơi trí tuệ LEGO, dụng cụ học tập Thiên Long và quà tặng tinh tế với dịch vụ giao hàng COD hoặc nhận tại chi nhánh.
2. **Nhân viên thu ngân & Thủ thư (Cashiers & Store Clerks):** Nhân viên tại các chi nhánh vật lý xử lý giao dịch bán lẻ tại quầy POS, quét mã vạch, in biên lai nhiệt, kiểm tra tồn kho tại chỗ và tra cứu vị trí kệ sách cho khách.
3. **Quản lý nhà sách & Thủ kho (Store Managers & Warehouse Operators):** Quản lý điều chuyển tồn kho giữa các chi nhánh, nhập hàng từ nhà cung cấp, thiết lập chương trình khuyến mãi và theo dõi doanh thu thời gian thực.

## Product Purpose

Melio Bookstore là hệ thống quản lý và bán lẻ nhà sách đa kênh (Omnichannel Bookstore Platform) toàn diện, kết nối liền mạch giữa không gian văn hóa đọc trực tuyến và mạng lưới chi nhánh vật lý. Sản phẩm giải quyết bài toán đồng bộ tồn kho thực tế, tối ưu hóa tốc độ thanh toán tại quầy POS, đồng thời mang lại trải nghiệm đọc sách giàu cảm xúc và nghệ thuật cho độc giả.

## Positioning

Khác biệt với các sàn thương mại điện tử thông thường, Melio kết hợp chiều sâu biên tập văn hóa đọc (*Editorial Craft*) với tính năng kết nối không gian thực độc đáo: Đọc thử 3D lật trang như cầm sách thật, định vị sơ đồ kệ sách chính xác tại từng chi nhánh, trợ lý AI thủ thư cá nhân hóa và gói quà thủ công kèm thiệp viết tay di sản.

## Operating Context

- **Không gian số (Online Storefront):** Môi trường mua sắm trải nghiệm cao trên máy tính và thiết bị di động, với danh mục tuyển chọn, bộ lọc phân tầng, chế độ xem tùy biến, và theo dõi hành trình đơn hàng trực tiếp.
- **Không gian quầy thu ngân (POS Terminal Scene):** Màn hình POS tối ưu cho thao tác chạm/phím tắt, xử lý nhanh dưới 3 giây/giao dịch, hỗ trợ thanh toán đa phương thức (Tiền mặt, Thẻ, QR chuyển khoản, Điểm tích lũy, Voucher).
- **Hệ thống hậu cần & Kho bãi (Back-office Operations):** Quản trị danh mục sách/VPP, phiếu chuyển kho liên chi nhánh, quản lý nhà cung cấp và nhật ký kiểm toán minh bạch.

## Capabilities and Constraints

- **Công nghệ nền tảng:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Prisma ORM, TypeScript.
- **Khả năng cốt lõi:**
  - Đồng bộ tồn kho thời gian thực theo từng chi nhánh.
  - Quản lý giỏ hàng và tủ sách cá nhân (Wishlist) lưu trữ client-side an toàn.
  - POS thanh toán tách hóa đơn, tích điểm thành viên và quản lý ca làm việc.
  - Tìm kiếm toàn văn với gợi ý từ khóa thịnh hành và live autocomplete.
  - Mô phỏng đọc thử 3D Flipbook, tra cứu vị trí kệ sách chi nhánh và AI Concierge.
- **Ràng buộc:** Toàn bộ dữ liệu hiển thị trên giao diện phải phản ánh đúng tồn kho và chính sách giá thực tế của chi nhánh đang chọn.

## Brand Commitments

- **Tên thương hiệu:** Melio Bookstore (Melio Flagship).
- **Phong cách & Tinh thần (Voice & Tone):** Tri thức, hoài niệm, tao nhã, ấm áp và nâng niu từng ấn bản.
- **Bản sắc thị giác (Visual Identity Assets):** Bìa sách dập nổi, ribbon bookmark mạ vàng, họa tiết giấy mộc Kraft vintage, tone màu trầm ấm (Than củi mun, Nâu cà phê, Đỏ son trầm, Vàng kim cổ điển).

## Evidence on Hand

- Dữ liệu thực tế các đầu sách kinh điển (*Tôi Thấy Hoa Vàng Trên Cỏ Xanh, Dế Mèn Phiêu Lưu Ký, Harry Potter...*), văn phòng phẩm Thiên Long, Double A và đồ chơi LEGO chính hãng đã được cấu trúc trong cơ sở dữ liệu và mock data.
- Các chi nhánh thực tế: Chi nhánh Nguyễn Huệ (TP.HCM), Chi nhánh Đinh Lễ (Hà Nội), Chi nhánh Bạch Đằng (Đà Nẵng).

## Product Principles

1. **Tôn Vinh Văn Hóa Đọc & Giá Trị Tri Thức:** Mỗi cuốn sách và sản phẩm đều được trình bày trang trọng, có chiều sâu câu chuyện và sự chăm chút tỉ mỉ.
2. **Liền Mạch Đa Kênh (True Omnichannel):** Trải nghiệm xem online và nhận hàng/trải nghiệm offline tại cửa hàng phải hoàn toàn thống nhất về dữ liệu tồn kho, giá bán và dịch vụ.
3. **Thực Tế & Đáng Tin Cậy:** Mọi thông tin về tình trạng hàng, mã vận đơn, vị trí kệ sách và hóa đơn thanh toán đều chuẩn xác và minh bạch.
4. **Trải Nghiệm Tương Tác Sáng Tạo:** Không chỉ là nơi mua bán, Melio tạo ra không gian kết nối cảm xúc qua các tính năng tương tác như đọc thử 3D, thử thách đọc sách và gợi ý quà tặng thông minh.

## Accessibility & Inclusion

- Thiết kế giao diện với độ tương phản văn bản đạt chuẩn WCAG AA trên cả nền sáng (Kem giấy cổ điển) và nền tối (Than củi mun).
- Hỗ trợ đầy đủ điều hướng bằng bàn phím trên thanh tìm kiếm, bộ lọc và màn hình POS thu ngân.
