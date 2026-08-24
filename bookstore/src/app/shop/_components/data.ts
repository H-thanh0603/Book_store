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
    tagColor: "bg-amber-400 text-amber-950",
    badge: "Kỳ Tuyển Tập Số 08",
    title: "Nơi Mỗi Trang Sách & Món Quà",
    highlight: "Là Một Cuộc Du Hành Kỳ Diệu",
    desc: "Khám phá hơn 50.000 đầu sách văn học, truyện tranh Manga, bộ lắp ráp LEGO sáng tạo và văn phòng phẩm Thiên Long chính hãng.",
    bg: "from-[#171412] via-[#241c17] to-[#12100e]",
    accent: "from-amber-300 via-orange-300 to-yellow-200",
    ctaText: "Khám phá siêu thị",
    ctaLink: "#catalog",
    secondaryText: "Săn deal giờ vàng",
    secondaryLink: "#flash-sale",
  },
  {
    tag: "MÙA TỰU TRƯỜNG 2026",
    tagColor: "bg-emerald-400 text-emerald-950",
    badge: "Back To School",
    title: "Trọn Bộ Hành Trang Đến Trường",
    highlight: "Ưu Đãi Lên Đến 40%",
    desc: "Đầy đủ vở ô ly 200 trang, bút bi Thiên Long, giấy in Double A và balo chống gù chuẩn y khoa bảo vệ cột sống học sinh.",
    bg: "from-[#0a2318] via-[#0f3827] to-[#071a12]",
    accent: "from-emerald-300 via-teal-200 to-cyan-200",
    ctaText: "Chọn trọn bộ đồ dùng",
    ctaLink: "/back-to-school",
    secondaryText: "Vương quốc đồ chơi",
    secondaryLink: "/toys",
  },
  {
    tag: "THẾ GIỚI ĐỒ CHƠI & LIFESTYLE",
    tagColor: "bg-rose-400 text-rose-950",
    badge: "LEGO & Sanrio 100%",
    title: "Vương Quốc Đồ Chơi Sáng Tạo",
    highlight: "Kích Hoạt Trí Tuệ Cho Trẻ Thơ",
    desc: "Bộ xếp hình LEGO Classic, gấu bông Hello Kitty siêu êm ái và hàng chục tựa Board Game kết nối trọn vẹn tình cảm gia đình.",
    bg: "from-[#240e1e] via-[#38142f] to-[#180a14]",
    accent: "from-rose-300 via-pink-200 to-amber-200",
    ctaText: "Khám phá đồ chơi",
    ctaLink: "/toys",
    secondaryText: "Săn mã giảm giá",
    secondaryLink: "/deals",
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
  },
  {
    id: "cb2",
    title: "Combo Văn Học Di Sản & Sổ Tay Mộc",
    tag: "TIẾT KIỆM 20%",
    price: 289000,
    originalPrice: 366000,
    items: ["1 Cuốn Tôi Thấy Hoa Vàng Trên Cỏ Xanh", "1 Cuốn Dế Mèn Phiêu Lưu Ký", "1 Sổ Tay Mộc Vintage Kraft", "1 Bookmark Mạ Vàng Dập Nổi"],
    desc: "Bộ đôi tác phẩm kinh điển nuôi dưỡng tâm hồn kèm sổ tay ghi chép nghệ thuật.",
  },
  {
    id: "cb3",
    title: "Combo Sáng Tạo: LEGO & Gấu Bông Sanrio",
    tag: "TIẾT KIỆM 30%",
    price: 899000,
    originalPrice: 1258000,
    items: ["1 Bộ LEGO Classic Creative Bricks 11002", "1 Gấu Bông Hello Kitty Sanrio 30cm", "1 Hộp quà cứng Melio dập kim", "1 Thiệp chúc mừng sinh nhật"],
    desc: "Món quà bất ngờ và trọn vẹn niềm vui tuổi thơ cho các bé thiếu nhi.",
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
