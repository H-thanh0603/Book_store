# Design System & Visual Guidelines: Melio Bookstore

<!-- impeccable:design-schema 1 -->

## 1. Visual Philosophy & Core Identity

Melio Bookstore được định hình theo trường phái thẩm mỹ **Editorial Heritage & Tactile Craft** (Nhà sách di sản biên tập & Trải nghiệm xúc giác cao cấp). Giao diện tái hiện không khí ấm cúng, sang trọng và giàu tri thức của một hiệu sách văn học kinh điển giữa lòng phố cổ:
- **Chất liệu chủ đạo:** Nền giấy mộc vintage Kraft, bìa sách da/mun dập nổi, ribbon bookmark mạ vàng, đường kẻ mực in thanh thoát.
- **Tính đối xứng & Nhịp điệu:** Tiêu đề Serif kinh điển kết hợp bố cục thẻ bất đối xứng có chiều sâu, tạo cảm giác như đang lật giở một cuốn tạp chí văn học cao cấp.

---

## 2. Design Tokens & Palette

### Primitive & Semantic Colors
```css
:root {
  /* Paper & Backgrounds */
  --melio-paper-base: #faf7f2;       /* Nền trang chính phong cách giấy mộc */
  --melio-paper-warm: #fbf8f3;       /* Nền khối nội dung phụ & cards */
  --melio-paper-card: #ffffff;       /* Nền card nổi bật */
  --melio-paper-cream: #faf4ea;      /* Nền badge & khối tác giả */
  
  /* Inks & Typography */
  --melio-charcoal-deep: #1c1917;    /* Màu mực in chính & than củi mun */
  --melio-charcoal-muted: #574431;   /* Màu mực phụ cho trích dẫn */
  --melio-ink-slate: #64748b;        /* Màu chú thích & số trang */
  
  /* Brand Accents */
  --melio-crimson-heritage: #8c2d19; /* Đỏ son di sản đặc trưng */
  --melio-crimson-bright: #c83f49;   /* Đỏ son hành động & Flash deals */
  --melio-gold-metallic: #d97706;    /* Vàng kim dập nổi */
  --melio-gold-bright: #ffd56a;      /* Vàng kim điểm nhấn */
  
  /* Borders & Dividers */
  --melio-border-light: #ede5d8;     /* Viền mực nhạt */
  --melio-border-warm: #e8dac5;      /* Viền giấy mộc */
}
```

---

## 3. Typography Scale & Pairing

| Cấp Bậc | Font Family | Kích Thước | Trọng Lượng | Ứng Dụng |
|---|---|---|---|---|
| **Display / Hero** | `font-serif` | 2.5rem - 3.75rem | Black (900) | Đại tựa đề chiến dịch, slogan tiêu điểm |
| **Heading 1 / 2** | `font-serif` | 1.5rem - 2.25rem | ExtraBold (800) | Tên phân khu, Tên sách tiêu điểm |
| **Heading 3 / 4** | `font-serif` | 1.125rem - 1.25rem | Bold (700) | Tên sách trên thẻ sản phẩm, Tên tác giả |
| **Body Primary** | `font-sans` | 0.875rem - 1rem | Regular (400) / Medium (500) | Lời tựa, thông tin chi tiết, văn bản điều hướng |
| **Micro Labels** | `font-serif` / `font-mono` | 0.625rem - 0.75rem | Bold (700) / Black (900) | Badge danh mục, Mã SKU, Mã Voucher |

---

## 4. Reusable UI Component Patterns

### 1. Thẻ Sách & Sản Phẩm (`.paper-card` & `.book-3d`)
- Viền mảnh `1px solid #ede7de` hoặc `rgba(255,255,255,0.12)` trên nền tối.
- Hiệu ứng đổ bóng nhiều lớp `.book-shadow` tạo chiều sâu vật lý khi di chuột.
- Dải ruy băng đánh dấu trang `.bookmark-ribbon` hoặc `.bookmark-ribbon-gold` gắn góc phải.

### 2. Thanh Tìm Kiếm Đa Năng (Smart Autocomplete Search)
- Bo góc lớn `rounded-2xl` với border tinh tế.
- Tự động gợi ý từ khóa thịnh hành và hiển thị thẻ sản phẩm mini có ảnh, giá và tồn kho thực tế.

### 3. Bộ Lọc Phân Tầng (Faceted Filter Bar)
- Chip danh mục dạng cuộn ngang linh hoạt trên mobile.
- Nút bấm khoảng giá độc lập và công tắc gạt kiểm tra hàng sẵn có.
- 3 chế độ xem: `grid5` (5 cột), `grid3` (3 cột lớn) và `list` (danh sách ngang).

### 4. Cửa Sổ Trải Nghiệm Tương Tác (Interactive Modals)
- **ShelfFinderModal:** Sơ đồ chỉ dẫn vị trí kệ sách chi nhánh.
- **FlipbookReaderModal:** Mô phỏng đọc thử 3D lật trang.
- **AIConciergeModal:** Chatbot thủ thư tư vấn phong vị đọc sách.
- **LuckyWheelModal:** Vòng quay may mắn nhận voucher.

---

## 5. Accessibility & Motion Rules

- **Contrast Floor:** Đảm bảo độ tương phản tối thiểu 4.5:1 cho văn bản thông thường và 7:1 cho tiêu đề lớn.
- **Focus & States:** Tất cả các nút bấm, ô nhập liệu và dropdown đều có focus ring `focus:ring-2 focus:ring-[#8c2d19]/20`.
- **Motion:** Chuyển động lật trang và bay nhẹ `.animate-float` được giữ ở biên độ nhỏ, êm dịu, không gây xao nhãng.
