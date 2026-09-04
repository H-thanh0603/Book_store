// Static editorial content for the shop page. Extracted from the original
// 2.5k-line page.tsx so the page component only carries state/logic.

import {
  Backpack, BookOpen, Gift, LayoutGrid, Palette, PenTool, ToyBrick,
} from "lucide-react";

import type {
  AuthorSpotlightData,
  BlogArticle,
  ComboBundle,
  Department,
  FeaturedCampaign,
  ReadingAtmosphere,
  Voucher,
} from "./types";

export const CART_KEY = "melio.storefront.cart.v1";
export const WISHLIST_KEY = "melio.storefront.wishlist.v1";

export const featuredCampaigns: FeaturedCampaign[] = [
  {
    tag: "ĐẠI TIỆC MÙA THU 2026",
    tagColor: "bg-white/90 text-[#8c2d19] backdrop-blur-xs",
    badge: "Kỳ Tuyển Tập Số 08 · Tặng Bookmark Mạ Vàng",
    title: "Nơi Mỗi Trang Sách & Món Quà",
    highlight: "Là Một Cuộc Du Hành Kỳ Diệu",
    desc: "Khám phá hàng nghìn đầu sách văn học, truyện tranh Manga kinh điển, bộ lắp ráp LEGO sáng tạo và văn phòng phẩm chính hãng từ các chi nhánh Melio.",
    bg: "from-[#8c2d19] via-[#a63a1f] to-[#d97706]",
    accent: "from-[#ffd56a] via-[#f3e5d0] to-white",
    ctaText: "Khám phá siêu thị ngay",
    ctaLink: "#catalog",
    secondaryText: "Săn deal giờ vàng",
    secondaryLink: "/deals",
  },
  {
    tag: "MÙA TỰU TRƯỜNG 2026",
    tagColor: "bg-white/90 text-[#14532d] backdrop-blur-xs",
    badge: "Back To School · Ưu Đãi Trực Tiếp 40%",
    title: "Trọn Bộ Hành Trang Đến Trường",
    highlight: "Balo Chống Gù & Dụng Cụ Chuẩn",
    desc: "Đầy đủ vở viết, bút bi Thiên Long TL-027, giấy in Double A 70gsm và balo học sinh chuẩn y khoa bảo vệ cột sống cho bé yêu.",
    bg: "from-[#14532d] via-[#166534] to-[#3f6212]",
    accent: "from-[#dcfce7] via-[#f0fdf4] to-white",
    ctaText: "Xem trọn bộ đồ dùng",
    ctaLink: "/back-to-school",
    secondaryText: "Combo tiết kiệm 25%",
    secondaryLink: "/back-to-school#combo-checklist",
  },
  {
    tag: "THẾ GIỚI ĐỒ CHƠI & LIFESTYLE",
    tagColor: "bg-white/90 text-[#6b2113] backdrop-blur-xs",
    badge: "LEGO & Sanrio 100% Chính Hãng",
    title: "Vương Quốc Đồ Chơi Sáng Tạo",
    highlight: "Kích Hoạt Trí Tuệ & Niềm Vui",
    desc: "Bộ xếp hình LEGO Classic, gấu bông Hello Kitty siêu êm ái và hàng chục tựa Board Game kết nối trọn vẹn tình cảm gia đình trong từng khoảnh khắc sum vầy.",
    bg: "from-[#6b2113] via-[#8c2d19] to-[#574431]",
    accent: "from-[#ffd56a] via-[#f3e5d0] to-white",
    ctaText: "Khám phá đồ chơi LEGO",
    ctaLink: "/toys",
    secondaryText: "Săn mã giảm giá",
    secondaryLink: "/deals",
  },
  {
    tag: "FLASH SALE ĐỒNG GIÁ 24H",
    tagColor: "bg-[#ffd56a] text-[#6b2113] font-black",
    badge: "Giảm Sốc Đến 50% · Cập Nhật Mỗi Ngày",
    title: "Đại Tiệc Săn Deal Giờ Vàng",
    highlight: "Đồng Giá Sách & VPP Từ 29K",
    desc: "Hàng nghìn tựa sách bán chạy và dụng cụ học tập cao cấp trợ giá trực tiếp hôm nay. Áp dụng mã FREESHIP cho đơn từ 250.000 ₫.",
    bg: "from-[#d97706] via-[#8c2d19] to-[#6b2113]",
    accent: "from-[#ffd56a] via-[#f3e5d0] to-white",
    ctaText: "Săn deal hot ngay",
    ctaLink: "/deals",
    secondaryText: "Xem kho voucher",
    secondaryLink: "#voucher-hub",
  },
];

export const departments: Department[] = [
  { id: "all", name: "Tất Cả", icon: LayoutGrid, count: "5.000+ món" },
  { id: "Sách", name: "Sách & Manga", icon: BookOpen, count: "2.400+ tựa" },
  { id: "Văn phòng phẩm", name: "Văn Phòng Phẩm", icon: PenTool, count: "1.200+ mẫu" },
  { id: "Đồ chơi", name: "Đồ Chơi LEGO", icon: ToyBrick, count: "850+ món" },
  { id: "Mỹ thuật", name: "Họa Cụ Mỹ Thuật", icon: Palette, count: "450+ món" },
  { id: "Lifestyle", name: "Balo & Phụ Kiện", icon: Backpack, count: "320+ mẫu" },
  { id: "Quà tặng", name: "Quà Lưu Niệm", icon: Gift, count: "600+ bộ" },
];

export const hotSearchKeywords = [
  "Tôi Thấy Hoa Vàng Trên Cỏ Xanh",
  "Dế Mèn Phiêu Lưu Ký",
  "Harry Potter",
  "Bút bi Thiên Long",
  "LEGO Classic",
  "Giấy Double A",
];

export const readingAtmospheres: ReadingAtmosphere[] = [
  {
    id: "rain",
    title: "Chiều Mưa Bên Cửa Sổ",
    icon: "🌧️",
    desc: "Thơ ca, tản văn và những áng văn êm dịu vỗ về tâm hồn",
    filter: "văn học",
  },
  {
    id: "coffee",
    title: "Góc Cafe Sáng Cuối Tuần",
    icon: "☕",
    desc: "Nghệ thuật sống, tâm lý học và tư duy cân bằng thân tâm",
    filter: "kỹ năng",
  },
  {
    id: "night",
    title: "Đêm Khởi Nghiệp & Nâng Cấp",
    icon: "🚀",
    desc: "Chiến lược quản trị, tài chính và bài học từ các CEO lỗi lạc",
    filter: "kinh tế",
  },
  {
    id: "manga",
    title: "Tuổi Thơ & Manga Nhật Bản",
    icon: "🧸",
    desc: "Thế giới truyện tranh rực rỡ và đồ chơi lắp ráp sáng tạo",
    filter: "manga",
  },
];

export const authorSpotlight: AuthorSpotlightData = {
  name: "Nhà văn Nguyễn Nhật Ánh",
  title: "Cây Bút Của Tuổi Thơ & Miền Ký Ức Trong Veo",
  avatar: "✍️",
  bio: "Với hơn 40 năm cầm bút, tác phẩm của ông đã trở thành chiếc vé thần kỳ đưa hàng triệu độc giả mọi lứa tuổi trở về với những miền ký ức tuổi thơ trong sáng, thuần khiết và ngập tràn tình yêu thương.",
  quote: "Tuổi thơ như một giấc mơ thần tiên mà khi lớn lên, ai cũng muốn một lần tìm lại trong từng trang sách.",
  notableBooks: ["Tôi Thấy Hoa Vàng Trên Cỏ Xanh", "Mắt Biếc", "Cho Tôi Xin Một Vé Đi Tuổi Thơ", "Kính Vạn Hoa"],
};

export const comboBundles: ComboBundle[] = [
  {
    id: "cb1",
    title: "Combo Hành Trang Tựu Trường 2026",
    tag: "TIẾT KIỆM 25%",
    price: 369000,
    originalPrice: 495000,
    items: ["10 Quyển Vở Ô Ly 200 Trang", "1 Hộp Bút Bi Thiên Long TL-027 (20 cây)", "1 Ram Giấy Double A 70gsm (500 tờ)", "1 Thước kẻ & Compa học sinh"],
    desc: "Trọn bộ dụng cụ học tập thiết yếu cho năm học mới của học sinh tiểu học & THCS.",
    matchTerms: ["vở", "bút", "giấy"],
  },
  {
    id: "cb2",
    title: "Combo Văn Học Di Sản & Sổ Tay Mộc",
    tag: "TIẾT KIỆM 20%",
    price: 289000,
    originalPrice: 366000,
    items: ["1 Cuốn Tôi Thấy Hoa Vàng Trên Cỏ Xanh", "1 Cuốn Dế Mèn Phiêu Lưu Ký", "1 Sổ Tay Mộc Vintage Kraft", "1 Bookmark Mạ Vàng Dập Nổi"],
    desc: "Bộ đôi tác phẩm kinh điển nuôi dưỡng tâm hồn kèm sổ tay ghi chép nghệ thuật.",
    matchTerms: ["Tôi Thấy Hoa Vàng", "Dế Mèn"],
  },
  {
    id: "cb3",
    title: "Combo Sáng Tạo: LEGO & Gấu Bông Sanrio",
    tag: "TIẾT KIỆM 30%",
    price: 899000,
    originalPrice: 1258000,
    items: ["1 Bộ LEGO Classic Creative Bricks 11002", "1 Gấu Bông Hello Kitty Sanrio 30cm", "1 Hộp quà cứng Melio dập kim", "1 Thiệp chúc mừng sinh nhật"],
    desc: "Món quà bất ngờ và trọn vẹn niềm vui tuổi thơ cho các bé thiếu nhi.",
    matchTerms: ["đồ chơi"],
  },
];

export const blogArticles: BlogArticle[] = [
  {
    id: "art1",
    category: "VĂN HÓA ĐỌC",
    title: "10 Cuốn Sách Thay Đổi Góc Nhìn Của Bạn Về Cuộc Sống Trong Năm 2026",
    readTime: "5 phút đọc",
    snippet: "Những trang viết mang tính khai phóng, giúp bạn tái định hình tư duy và tìm thấy sự bình an nội tại giữa thế giới biến động.",
    date: "23 Tháng 8, 2026",
  },
  {
    id: "art2",
    category: "BÍ QUYẾT ĐỌC",
    title: "Cách Xây Dựng Thói Quen Đọc 30 Phút Mỗi Ngày Cho Người Bận Rộn",
    readTime: "4 phút đọc",
    snippet: "Phương pháp vi mô (Atomic Reading) giúp bạn dễ dàng đọc hết 25 cuốn sách mỗi năm mà không hề cảm thấy áp lực thời gian.",
    date: "21 Tháng 8, 2026",
  },
  {
    id: "art3",
    category: "GIÁO DỤC TRẺ EM",
    title: "Vì Sao Đồ Chơi Lắp Ráp LEGO Giúp Trẻ Phát Triển Tư Duy Không Gian Vượt Trội?",
    readTime: "6 phút đọc",
    snippet: "Nghiên cứu khoa học về tác động của các khối ghép hình đối với khả năng giải quyết vấn đề và sự kiên nhẫn của trẻ nhỏ.",
    date: "19 Tháng 8, 2026",
  },
];

export const vouchers: Voucher[] = [
  { code: "MELIOVIP", title: "Giảm 20.000 ₫", desc: "Cho đơn mua sách & VPP từ 200k" },
  { code: "FREESHIP", title: "Miễn Phí Vận Chuyển", desc: "Toàn quốc cho đơn từ 250k" },
  { code: "BOOKFEST", title: "Giảm Thêm 10%", desc: "Tủ sách Văn học & Đồ chơi LEGO" },
];

// (removed) customerReviews — hardcoded fabricated testimonials deleted (P2:
// no fake social proof). Reintroduce only with a real reviews table behind it.

export function money(value: number): string {
  return `${value.toLocaleString("vi-VN")} ₫`;
}
