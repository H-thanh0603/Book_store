"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Award,
  Backpack,
  Bell,
  BookMarked,
  BookOpen,
  Box,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clock3,
  Coffee,
  Compass,
  Copy,
  Crown,
  Eye,
  Feather,
  Flame,
  Gift,
  GraduationCap,
  Grid3X3,
  Heart,
  HelpCircle,
  Image as ImageIcon,
  Info,
  Layers,
  LayoutGrid,
  Library,
  List,
  Mail,
  MapPin,
  Medal,
  Menu,
  MessageSquare,
  Minus,
  Moon,
  Navigation,
  Newspaper,
  Palette,
  PenTool,
  Phone,
  Plus,
  Quote,
  RotateCcw,
  Search,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Shuffle,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Star,
  Store,
  Sun,
  Tag,
  TicketPercent,
  ToyBrick,
  Trash2,
  TrendingUp,
  Trophy,
  Truck,
  User,
  UserRound,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";

import AIConciergeModal from "@/components/AIConciergeModal";
import LuckyWheelModal from "@/components/LuckyWheelModal";
import ShelfFinderModal from "@/components/ShelfFinderModal";
import FlipbookReaderModal from "@/components/FlipbookReaderModal";

type Variant = { id: string; name: string; sku: string; price: number; available: number };
type Product = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  category: { id: string; name: string };
  brand?: { name: string } | null;
  author?: { name: string } | null;
  publisher?: { name: string } | null;
  variants: Variant[];
};
type StoreOption = { id: string; name: string; code: string };
type Catalog = {
  products: Product[];
  categories: { id: string; name: string }[];
  stores: StoreOption[];
  storeId: string;
};
type CartLine = {
  variantId: string;
  productId: string;
  name: string;
  category: string;
  brand?: string;
  price: number;
  quantity: number;
  available: number;
};

const CART_KEY = "melio.storefront.cart.v1";
const WISHLIST_KEY = "melio.storefront.wishlist.v1";

const featuredCampaigns = [
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

const departments = [
  { id: "all", name: "Tất Cả", icon: LayoutGrid, count: "5.000+ món" },
  { id: "Sách", name: "Sách & Manga", icon: BookOpen, count: "2.400+ tựa" },
  { id: "Văn phòng phẩm", name: "Văn Phòng Phẩm", icon: PenTool, count: "1.200+ mẫu" },
  { id: "Đồ chơi", name: "Đồ Chơi LEGO", icon: ToyBrick, count: "850+ món" },
  { id: "Mỹ thuật", name: "Họa Cụ Mỹ Thuật", icon: Palette, count: "450+ món" },
  { id: "Lifestyle", name: "Balo & Phụ Kiện", icon: Backpack, count: "320+ mẫu" },
  { id: "Quà tặng", name: "Quà Lưu Niệm", icon: Gift, count: "600+ bộ" },
];

const hotSearchKeywords = [
  "Tôi Thấy Hoa Vàng Trên Cỏ Xanh",
  "Dế Mèn Phiêu Lưu Ký",
  "Harry Potter",
  "Bút bi Thiên Long",
  "LEGO Classic",
  "Giấy Double A",
];

const readingAtmospheres = [
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

const authorSpotlight = {
  name: "Nhà văn Nguyễn Nhật Ánh",
  title: "Cây Bút Của Tuổi Thơ & Miền Ký Ức Trong Veo",
  avatar: "✍️",
  bio: "Với hơn 40 năm cầm bút, tác phẩm của ông đã trở thành chiếc vé thần kỳ đưa hàng triệu độc giả mọi lứa tuổi trở về với những miền ký ức tuổi thơ trong sáng, thuần khiết và ngập tràn tình yêu thương.",
  quote: "Tuổi thơ như một giấc mơ thần tiên mà khi lớn lên, ai cũng muốn một lần tìm lại trong từng trang sách.",
  notableBooks: ["Tôi Thấy Hoa Vàng Trên Cỏ Xanh", "Mắt Biếc", "Cho Tôi Xin Một Vé Đi Tuổi Thơ", "Kính Vạn Hoa"],
};

const comboBundles = [
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

const blogArticles = [
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

const customerReviews = [
  {
    name: "Thùy Linh",
    role: "Giáo viên Tiểu học (TP.HCM)",
    avatar: "👩‍🏫",
    text: "Bộ dụng cụ học tập Thiên Long và vở ô ly giao siêu nhanh, bọc quà vintage rất đẹp và chỉn chu. Mình rất ưng ý!",
    book: "Combo Vở Ô Ly & Bút Bi Thiên Long",
  },
  {
    name: "Quốc Bảo",
    role: "Kỹ sư phần mềm (Hà Nội)",
    avatar: "👨‍💻",
    text: "Ấn bản bìa cứng có bookmark dập kim rất sang. Tìm kiếm vị trí kệ sách tại chi nhánh Đinh Lễ cực kỳ tiện lợi.",
    book: "Harry Potter và Hòn Đá Phù Thủy",
  },
  {
    name: "Hải Yến",
    role: "Phụ huynh (Đà Nẵng)",
    avatar: "👩‍👧",
    text: "Bé nhà mình mê tít bộ xếp hình LEGO và gấu bông Hello Kitty. Hàng chính hãng chuẩn an toàn nên mình rất yên tâm.",
    book: "LEGO Classic Creative Bricks",
  },
];

function money(value: number) {
  return `${value.toLocaleString("vi-VN")} ₫`;
}

export default function ShopPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [storeId, setStoreId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeDepartment, setActiveDepartment] = useState("all");
  const [activeMood, setActiveMood] = useState("rain");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [shelfProduct, setShelfProduct] = useState<Product | null>(null);
  const [flipbookProduct, setFlipbookProduct] = useState<Product | null>(null);
  const [giftWrapping, setGiftWrapping] = useState<"none" | "vintage" | "heritage">("none");
  const [giftMessage, setGiftMessage] = useState("");
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [success, setSuccess] = useState<{ number: string; total: number } | null>(null);
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", address: "" });
  const [copiedOrder, setCopiedOrder] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [countdown, setCountdown] = useState({ hours: 4, minutes: 35, seconds: 12 });

  // Advanced Sorting & View Modes
  const [sortBy, setSortBy] = useState<"popular" | "price_asc" | "price_desc" | "name_asc" | "newest">("popular");
  const [viewMode, setViewMode] = useState<"grid5" | "grid3" | "list">("grid5");
  const [priceRange, setPriceRange] = useState<"all" | "under100" | "100to250" | "250to500" | "above500">("all");
  const [onlyInStock, setOnlyInStock] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const checkoutAttempt = useRef<{ signature: string; key: string } | null>(null);

  // Close search dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSearchFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load cart & wishlist from localStorage
  useEffect(() => {
    try {
      setCart(JSON.parse(localStorage.getItem(CART_KEY) ?? "[]"));
      setWishlist(JSON.parse(localStorage.getItem(WISHLIST_KEY) ?? "[]"));
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
  }, [wishlist]);

  // Flash sale countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev.seconds > 0) return { ...prev, seconds: prev.seconds - 1 };
        if (prev.minutes > 0) return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
        if (prev.hours > 0) return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        return { hours: 6, minutes: 0, seconds: 0 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Rotate hero slides
  useEffect(() => {
    const slideTimer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % featuredCampaigns.length);
    }, 7000);
    return () => clearInterval(slideTimer);
  }, []);

  // Fetch catalog from server API
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (categoryId) params.set("categoryId", categoryId);
      if (storeId) params.set("storeId", storeId);
      try {
        const response = await fetch(`/api/storefront?${params}`);
        const data = await response.json();
        if (response.ok) {
          setCatalog(data);
          if (!storeId) setStoreId(data.storeId);
          setError("");
        } else {
          setError(data.message ?? "Không thể tải sản phẩm");
        }
      } catch {
        setError("Lỗi kết nối máy chủ");
      }
      setLoading(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, categoryId, storeId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }

  function toggleFavorite(id: string) {
    setWishlist((prev) => {
      const exists = prev.includes(id);
      if (exists) {
        showToast("Đã bỏ khỏi danh sách yêu thích");
        return prev.filter((x) => x !== id);
      }
      showToast("❤️ Đã lưu vào tủ sách cá nhân!");
      return [...prev, id];
    });
  }

  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = cart.reduce((sum, line) => sum + line.quantity * line.price, 0);
  const wrappingFee = giftWrapping === "vintage" ? 25000 : giftWrapping === "heritage" ? 45000 : 0;
  const grandTotal = subtotal + wrappingFee;
  const activeStore = catalog?.stores.find((store) => store.id === storeId);
  const allProducts = catalog?.products ?? [];

  // Live autocomplete search matching products
  const searchMatches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.name.toLowerCase().includes(q) ||
        p.brand?.name?.toLowerCase().includes(q) ||
        p.author?.name?.toLowerCase().includes(q)
    ).slice(0, 5);
  }, [allProducts, query]);

  // Filter and sort products for main catalog
  const filteredProducts = useMemo(() => {
    let list = [...allProducts];

    // Department filter
    if (activeDepartment !== "all") {
      list = list.filter((p) =>
        p.category.name.toLowerCase().includes(activeDepartment.toLowerCase())
      );
    }

    // Price range filter
    if (priceRange === "under100") {
      list = list.filter((p) => (p.variants[0]?.price ?? 0) < 100000);
    } else if (priceRange === "100to250") {
      list = list.filter((p) => {
        const price = p.variants[0]?.price ?? 0;
        return price >= 100000 && price <= 250000;
      });
    } else if (priceRange === "250to500") {
      list = list.filter((p) => {
        const price = p.variants[0]?.price ?? 0;
        return price >= 250000 && price <= 500000;
      });
    } else if (priceRange === "above500") {
      list = list.filter((p) => (p.variants[0]?.price ?? 0) > 500000);
    }

    // Availability filter
    if (onlyInStock) {
      list = list.filter((p) => (p.variants[0]?.available ?? 0) > 0);
    }

    // Sorting
    if (sortBy === "price_asc") {
      list.sort((a, b) => (a.variants[0]?.price ?? 0) - (b.variants[0]?.price ?? 0));
    } else if (sortBy === "price_desc") {
      list.sort((a, b) => (b.variants[0]?.price ?? 0) - (a.variants[0]?.price ?? 0));
    } else if (sortBy === "name_asc") {
      list.sort((a, b) => a.name.localeCompare(b.name, "vi"));
    } else if (sortBy === "newest") {
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return list;
  }, [allProducts, activeDepartment, priceRange, onlyInStock, sortBy]);

  // Filter products by mood lounge
  const moodFilteredProducts = useMemo(() => {
    const selectedObj = readingAtmospheres.find((m) => m.id === activeMood);
    if (!selectedObj) return allProducts.slice(0, 4);
    return allProducts
      .filter(
        (p) =>
          p.category.name.toLowerCase().includes(selectedObj.filter) ||
          p.name.toLowerCase().includes(selectedObj.filter)
      )
      .slice(0, 4);
  }, [allProducts, activeMood]);

  const spotlightProduct = allProducts[0] ?? null;

  const productByVariant = useMemo(
    () =>
      new Map(
        (catalog?.products ?? []).flatMap((product) =>
          product.variants.map((variant) => [variant.id, { product, variant }] as const)
        )
      ),
    [catalog]
  );

  function addToCart(product: Product) {
    const variant = product.variants[0];
    if (!variant || variant.available <= 0) return;
    setCart((lines) => {
      const current = lines.find((line) => line.variantId === variant.id);
      if (current)
        return lines.map((line) =>
          line.variantId === variant.id
            ? {
                ...line,
                quantity: Math.min(line.quantity + 1, variant.available),
                available: variant.available,
              }
            : line
        );
      return [
        ...lines,
        {
          variantId: variant.id,
          productId: product.id,
          name: product.name,
          category: product.category.name,
          brand: product.brand?.name,
          price: variant.price,
          quantity: 1,
          available: variant.available,
        },
      ];
    });
    showToast(`✨ Đã thêm "${product.name}" vào giỏ hàng!`);
    setCartOpen(true);
  }

  function addComboToCart(bundle: typeof comboBundles[0]) {
    const firstProduct = allProducts[0];
    if (firstProduct && firstProduct.variants[0]) {
      addToCart(firstProduct);
      showToast(`🎁 Đã thêm trọn gói "${bundle.title}" vào giỏ hàng!`);
    }
  }

  function addAllWishlistToCart() {
    let addedCount = 0;
    wishlist.forEach((id) => {
      const prod = allProducts.find((p) => p.id === id);
      if (prod && prod.variants[0]?.available > 0) {
        addToCart(prod);
        addedCount++;
      }
    });
    if (addedCount > 0) {
      showToast(`📚 Đã chuyển ${addedCount} sản phẩm từ tủ sách vào giỏ hàng!`);
      setWishlistOpen(false);
      setCartOpen(true);
    } else {
      showToast("Không có sản phẩm nào có sẵn để thêm vào giỏ");
    }
  }

  function resetAllFilters() {
    setCategoryId("");
    setActiveDepartment("all");
    setPriceRange("all");
    setOnlyInStock(false);
    setSortBy("popular");
    setQuery("");
  }

  function changeQuantity(variantId: string, delta: number) {
    setCart((lines) =>
      lines.flatMap((line) => {
        if (line.variantId !== variantId) return [line];
        const latest = productByVariant.get(variantId)?.variant.available ?? line.available;
        const quantity = Math.min(line.quantity + delta, latest);
        return quantity > 0 ? [{ ...line, quantity, available: latest }] : [];
      })
    );
  }

  function changeStore(nextStoreId: string) {
    if (cart.length && !window.confirm("Đổi chi nhánh sẽ làm mới giỏ hàng để cập nhật tồn kho thực tế. Bạn có muốn tiếp tục?"))
      return;
    setCart([]);
    setStoreId(nextStoreId);
  }

  function applyVoucherCode(code: string) {
    setCouponInput(code);
    navigator.clipboard.writeText(code);
    showToast(`🎟️ Đã sao chép mã ưu đãi "${code}"!`);
  }

  async function checkout() {
    setError("");
    if (!cart.length) return;
    const request = {
      storeId,
      fulfillment,
      customer: {
        ...customer,
        address: customer.address + (giftWrapping !== "none" ? ` [Gói quà: ${giftWrapping}, Lời nhắn: ${giftMessage}]` : ""),
      },
      couponCode: couponInput.trim() || undefined,
      items: cart.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
    };
    const signature = JSON.stringify(request);
    if (checkoutAttempt.current?.signature !== signature)
      checkoutAttempt.current = { signature, key: crypto.randomUUID() };
    setSubmitting(true);
    try {
      const response = await fetch("/api/storefront", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, idempotencyKey: checkoutAttempt.current.key }),
      });
      const data = await response.json();
      setSubmitting(false);
      if (!response.ok) {
        setError(data.message ?? "Không thể đặt hàng, vui lòng kiểm tra lại");
        return;
      }
      checkoutAttempt.current = null;
      setSuccess({ number: data.number, total: data.total });
      setCart([]);
      setCheckoutOpen(false);
    } catch {
      setError("Lỗi kết nối khi gửi đơn hàng");
      setSubmitting(false);
    }
  }

  const freeShippingThreshold = 250000;
  const progressToFreeShipping = Math.min(100, Math.round((subtotal / freeShippingThreshold) * 100));
  const activeHero = featuredCampaigns[currentSlide];
  const hasActiveFilters =
    Boolean(categoryId) ||
    activeDepartment !== "all" ||
    priceRange !== "all" ||
    onlyInStock ||
    sortBy !== "popular" ||
    Boolean(query);

  return (
    <main className="min-h-screen bg-[#faf7f2] text-[#1c1917] pb-24 font-sans selection:bg-[#c83f49] selection:text-white">
      {/* 1. TOP ANNOUNCEMENT BAR */}
      <div className="bg-[#1c1917] text-[#e7ded1] px-4 py-2 text-xs font-bold shadow-xs border-b border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1.5">
          <div className="flex items-center gap-2 text-center sm:text-left">
            <span className="bg-[#c83f49] text-white px-2.5 py-0.5 rounded-full text-[10px] uppercase font-black tracking-wider">
              FLAGSHIP STORE 2026
            </span>
            <span className="font-serif italic">
              Tặng Bookmark mạ vàng dập nổi &amp; Miễn phí giao hàng COD toàn quốc cho đơn từ <b>250.000 ₫</b>
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-[#c9bea9]">
            <Link href="/track" className="inline-flex items-center gap-1 hover:text-white transition-colors">
              <Truck className="w-3.5 h-3.5 text-amber-300" /> Tra cứu đơn hàng
            </Link>
            <button
              onClick={() => setWishlistOpen(true)}
              className="inline-flex items-center gap-1 hover:text-white transition-colors"
            >
              <Heart className="w-3.5 h-3.5 fill-[#c83f49] text-[#c83f49]" />
              Tủ sách cá nhân ({wishlist.length})
            </button>
            <span className="inline-flex items-center gap-1 bg-white/10 px-2.5 py-0.5 rounded-full text-white font-serif">
              <MapPin className="w-3 h-3 text-amber-300" />
              {activeStore?.name ?? "Đang chọn chi nhánh..."}
            </span>
          </div>
        </div>
      </div>

      {/* 2. REFINED EDITORIAL HEADER */}
      <header className="sticky top-0 z-40 bg-[#fbf9f5]/95 backdrop-blur-xl border-b border-[#ede5d8] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-3 sm:gap-6">
          {/* Heritage Logo */}
          <Link href="/shop" className="flex items-center gap-2.5 shrink-0 group" aria-label="Melio Bookstore">
            <div className="size-11 rounded-2xl bg-[#1c1917] text-[#ffd56a] flex items-center justify-center shadow-md group-hover:scale-105 transition-all">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="font-serif font-black text-2xl text-[#1c1917] tracking-tight leading-none">
                  Melio
                </span>
                <span className="text-[10px] font-serif uppercase tracking-[0.2em] bg-[#8c2d19] text-white px-1.5 py-0.5 rounded font-bold">
                  Flagship
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-serif italic tracking-wide">Hiệu Sách &amp; Không Gian Sống</p>
            </div>
          </Link>

          {/* Mega Search Bar with Smart Autocomplete Dropdown */}
          <div ref={searchContainerRef} className="relative flex-1 max-w-xl">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onFocus={() => setSearchFocused(true)}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm kiếm tác phẩm, bút Thiên Long, đồ chơi LEGO, ISBN..."
                className="w-full bg-white border border-[#ede5d8] rounded-2xl pl-10 pr-9 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 focus:border-[#8c2d19] transition-all shadow-2xs"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 size-5 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center text-xs"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Smart Autocomplete Dropdown */}
            {searchFocused && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-[#ede5d8] p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
                {query.trim() ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[11px] font-serif font-bold text-slate-500 border-b border-[#ede5d8] pb-2">
                      <span>Sản phẩm gợi ý cho &quot;{query}&quot;</span>
                      <span>{searchMatches.length} kết quả</span>
                    </div>

                    {searchMatches.length > 0 ? (
                      <div className="space-y-2">
                        {searchMatches.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => {
                              setQuickViewProduct(p);
                              setSearchFocused(false);
                            }}
                            className="flex items-center justify-between p-2 rounded-xl hover:bg-[#faf6ef] transition-colors cursor-pointer group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="size-10 rounded-lg bg-[#1c1917] text-white flex items-center justify-center text-[8px] font-serif p-1 text-center font-bold">
                                {p.category.name.slice(0, 4)}
                              </div>
                              <div>
                                <h5 className="font-serif font-bold text-xs text-slate-900 group-hover:text-[#8c2d19] line-clamp-1">
                                  {p.name}
                                </h5>
                                <span className="text-[10px] text-slate-400 font-serif">
                                  {p.author?.name ?? p.brand?.name ?? p.category.name}
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <b className="font-serif text-xs font-black text-[#1c1917] block">
                                {p.variants[0] ? money(p.variants[0].price) : "Liên hệ"}
                              </b>
                              <span className="text-[9px] text-[#14532d] font-bold">
                                Còn {p.variants[0]?.available ?? 0}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-xs font-serif text-slate-400">
                        Không tìm thấy sản phẩm khớp với từ khóa
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <span className="text-[11px] font-serif font-bold text-slate-400 uppercase tracking-wider block">
                      🔥 Từ khóa tìm kiếm thịnh hành:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {hotSearchKeywords.map((kw, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setQuery(kw);
                            setSearchFocused(false);
                          }}
                          className="px-3 py-1.5 rounded-full bg-[#faf7f2] hover:bg-[#ede5d8] text-xs font-serif text-slate-700 transition-colors border border-[#ede5d8]"
                        >
                          {kw}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Page Hubs */}
          <div className="hidden lg:flex items-center gap-2 text-xs font-serif font-bold text-slate-700">
            <Link href="/bestsellers" className="px-3 py-1.5 rounded-xl hover:bg-[#faf6ef] hover:text-[#8c2d19] transition-colors flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-amber-600" /> Bestsellers
            </Link>
            <Link href="/gift-finder" className="px-3 py-1.5 rounded-xl hover:bg-[#faf6ef] hover:text-[#8c2d19] transition-colors flex items-center gap-1">
              <Gift className="w-3.5 h-3.5 text-rose-600" /> Quà Tặng
            </Link>
            <Link href="/reading-challenge" className="px-3 py-1.5 rounded-xl hover:bg-[#faf6ef] hover:text-[#8c2d19] transition-colors flex items-center gap-1">
              <BookMarked className="w-3.5 h-3.5 text-emerald-600" /> Thử Thách
            </Link>
            <Link href="/stores" className="px-3 py-1.5 rounded-xl hover:bg-[#faf6ef] hover:text-[#8c2d19] transition-colors flex items-center gap-1">
              <Store className="w-3.5 h-3.5 text-blue-600" /> Chi Nhánh
            </Link>
          </div>

          {/* Store Switcher */}
          <div className="hidden md:flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-2xl border border-[#ede5d8] text-xs">
            <Store className="w-3.5 h-3.5 text-[#8c2d19] shrink-0" />
            <select
              value={storeId}
              onChange={(e) => changeStore(e.target.value)}
              className="bg-transparent text-slate-800 font-serif font-semibold outline-none cursor-pointer text-xs"
            >
              {catalog?.stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          {/* Cart Button */}
          <button
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] text-white font-serif font-bold text-xs shadow-md transition-all hover:scale-105 active:scale-95 shrink-0"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="hidden sm:inline">Giỏ hàng</span>
            {itemCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-[#8c2d19] text-white font-mono font-bold text-[10px]">
                {itemCount}
              </span>
            )}
          </button>
        </div>

        {/* Secondary Department Sub-Navigation */}
        <div className="border-t border-[#ede5d8] bg-white overflow-x-auto py-2">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 text-xs font-serif font-bold text-slate-700 whitespace-nowrap">
            <div className="flex items-center gap-1.5">
              {departments.map((dept) => {
                const Icon = dept.icon;
                const isSelected = activeDepartment === dept.id;
                return (
                  <button
                    key={dept.id}
                    onClick={() => {
                      setActiveDepartment(dept.id);
                      if (dept.id === "all") setCategoryId("");
                      else {
                        const matched = catalog?.categories.find((c) => c.name.toLowerCase().includes(dept.id.toLowerCase()));
                        if (matched) setCategoryId(matched.id);
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${
                      isSelected ? "bg-[#1c1917] text-white shadow-xs" : "hover:bg-[#faf7f2] hover:text-[#8c2d19]"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{dept.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Dedicated Landing Page Badges */}
            <div className="flex items-center gap-2 border-l border-[#ede5d8] pl-3">
              <Link
                href="/back-to-school"
                className="flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors text-[11px]"
              >
                🎒 Mùa Tựu Trường
              </Link>
              <Link
                href="/toys"
                className="flex items-center gap-1 px-3 py-1 rounded-full bg-purple-50 text-purple-800 hover:bg-purple-100 transition-colors text-[11px]"
              >
                🧸 Đồ Chơi LEGO
              </Link>
              <Link
                href="/deals"
                className="flex items-center gap-1 px-3 py-1 rounded-full bg-rose-50 text-[#c83f49] hover:bg-rose-100 transition-colors text-[11px]"
              >
                ⚡ Săn Giờ Vàng
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* 3. HERO CAMPAIGN SHOWCASE SPREAD */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-16">
        <section className="relative overflow-hidden rounded-3xl shadow-2xl border border-white/10">
          <div className={`relative bg-gradient-to-r ${activeHero.bg} p-8 sm:p-14 text-white min-h-[420px] flex flex-col justify-between overflow-hidden`}>
            {/* Ambient Graphics */}
            <div className="absolute top-0 right-0 -mt-16 -mr-16 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 space-y-4 max-w-2xl">
              <div className="flex items-center gap-2.5">
                <span className={`font-mono text-[10px] font-black uppercase tracking-[0.25em] px-3 py-1 rounded-full shadow-xs ${activeHero.tagColor}`}>
                  {activeHero.tag}
                </span>
                <span className="font-serif italic text-xs text-amber-200">
                  {activeHero.badge}
                </span>
              </div>

              <h1 className="font-serif font-black text-3xl sm:text-6xl leading-[1.08] tracking-tight">
                {activeHero.title} <br />
                <span className="text-amber-200 font-serif">
                  {activeHero.highlight}
                </span>
              </h1>

              <p className="text-xs sm:text-sm text-slate-300 font-serif leading-relaxed italic max-w-xl">
                &ldquo;{activeHero.desc}&rdquo;
              </p>
            </div>

            {/* Actions & Slide Navigation */}
            <div className="relative z-10 pt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/15">
              <div className="flex items-center gap-3">
                <Link
                  href={activeHero.ctaLink}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-[#fbf8f3] text-[#1c1917] font-serif font-bold text-xs sm:text-sm shadow-xl hover:bg-white hover:scale-105 transition-all"
                >
                  {activeHero.ctaText} <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href={activeHero.secondaryLink}
                  className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-serif text-xs sm:text-sm backdrop-blur-md transition-colors"
                >
                  <Flame className="w-4 h-4 text-amber-300" /> {activeHero.secondaryText}
                </Link>
              </div>

              {/* Slider Dots */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentSlide((prev) => (prev === 0 ? featuredCampaigns.length - 1 : prev - 1))}
                  className="size-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1 px-1">
                  {featuredCampaigns.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentSlide(i)}
                      className={`h-2 rounded-full transition-all ${
                        currentSlide === i ? "w-6 bg-amber-400" : "w-2 bg-white/30"
                      }`}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setCurrentSlide((prev) => (prev + 1) % featuredCampaigns.length)}
                  className="size-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 4. DEPARTMENT DISCOVERY CARDS */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#ede5d8] pb-3">
            <div>
              <span className="text-[10px] font-serif uppercase tracking-widest text-[#8c2d19] font-bold">
                KHÁM PHÁ CÁC NGÀNH HÀNG
              </span>
              <h2 className="font-serif font-black text-2xl text-slate-900 mt-0.5">
                Các Phân Khu Trưng Bày Tiêu Điểm
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-serif italic">Hơn 5.000+ sản phẩm có sẵn</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {departments.slice(1).map((dept) => {
              const Icon = dept.icon;
              return (
                <button
                  key={dept.id}
                  onClick={() => {
                    setActiveDepartment(dept.id);
                    const matched = catalog?.categories.find((c) => c.name.toLowerCase().includes(dept.id.toLowerCase()));
                    if (matched) setCategoryId(matched.id);
                    document.querySelector("#catalog")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="p-4 rounded-3xl bg-white paper-card hover:shadow-xl hover:-translate-y-1 transition-all text-center flex flex-col items-center justify-between min-h-36 group"
                >
                  <div className="size-14 rounded-2xl bg-[#faf4ea] text-[#8c2d19] flex items-center justify-center border border-[#e8dac5] group-hover:scale-110 group-hover:bg-[#1c1917] group-hover:text-white transition-all">
                    <Icon className="w-7 h-7" />
                  </div>
                  <div>
                    <h4 className="font-serif font-black text-xs sm:text-sm text-slate-900 group-hover:text-[#8c2d19] transition-colors mt-2">
                      {dept.name}
                    </h4>
                    <span className="text-[10px] text-slate-400 font-serif block">{dept.count}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 5. FLASH SALE "GIỜ VÀNG GIÁ SỐC" */}
        <section id="flash-sale" className="rounded-3xl bg-[#1c1917] p-6 sm:p-10 text-white shadow-2xl space-y-6 border border-white/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-2xl bg-[#c83f49] text-white flex items-center justify-center shadow-lg shadow-rose-900/40 animate-pulse">
                <Flame className="w-6 h-6 fill-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-serif font-black text-2xl text-white tracking-tight">
                    Giờ Vàng Săn Sách &amp; Đồ Chơi
                  </h2>
                  <span className="bg-amber-400 text-amber-950 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                    Flash Deals
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-serif mt-0.5">
                  Đồng loạt trợ giá các ấn phẩm hay và dụng cụ học tập tại <b>{activeStore?.name}</b>
                </p>
              </div>
            </div>

            {/* Live Clock */}
            <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10">
              <span className="text-xs text-slate-300 font-serif flex items-center gap-1">
                <Clock3 className="w-3.5 h-3.5 text-amber-400" /> Kết thúc sau:
              </span>
              <div className="flex items-center gap-1 font-mono font-black text-sm text-amber-300">
                <span className="bg-slate-800 px-2 py-1 rounded-lg">{String(countdown.hours).padStart(2, "0")}</span>:
                <span className="bg-slate-800 px-2 py-1 rounded-lg">{String(countdown.minutes).padStart(2, "0")}</span>:
                <span className="bg-slate-800 px-2 py-1 rounded-lg">{String(countdown.seconds).padStart(2, "0")}</span>
              </div>
            </div>
          </div>

          {/* Flash Deals Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {allProducts.slice(0, 5).map((product, idx) => {
              const variant = product.variants[0];
              const discountPcts = [35, 25, 40, 30, 20];
              const discount = discountPcts[idx % discountPcts.length];
              const fakeSold = (idx * 4 + 11) % 25 + 2;

              return (
                <div
                  key={product.id}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-3xl p-4 flex flex-col justify-between transition-all group"
                >
                  <div className="relative aspect-square rounded-2xl bg-black/40 p-4 flex flex-col items-center justify-center text-center">
                    <span className="absolute top-2 left-2 bg-[#c83f49] text-white font-black text-[10px] px-2 py-0.5 rounded-full shadow-md">
                      -{discount}%
                    </span>
                    <Sparkles className="w-8 h-8 text-amber-300 group-hover:scale-110 transition-transform" />
                    <span className="mt-2 text-[10px] font-serif font-bold text-slate-300 uppercase tracking-wider">
                      {product.brand?.name ?? product.category.name}
                    </span>
                  </div>

                  <div className="mt-3 flex-1 flex flex-col justify-between space-y-2">
                    <div>
                      <h4 className="font-serif font-black text-xs sm:text-sm text-white line-clamp-2 min-h-9 group-hover:text-amber-300 transition-colors">
                        {product.name}
                      </h4>
                      <div className="mt-1 flex items-baseline gap-2">
                        <b className="font-serif text-base font-black text-amber-400">
                          {variant ? money(variant.price) : "Liên hệ"}
                        </b>
                        <small className="text-[10px] text-slate-500 line-through">
                          {variant ? money(Math.round(variant.price * 1.35)) : ""}
                        </small>
                      </div>
                    </div>

                    {/* Sold progress */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-slate-400 font-serif font-semibold">
                        <span>Đã bán {fakeSold}/30 cuốn</span>
                        <span className="text-amber-300 font-bold">Cháy hàng</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-amber-400 to-rose-500 h-full rounded-full"
                          style={{ width: `${(fakeSold / 30) * 100}%` }}
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => addToCart(product)}
                      disabled={!variant?.available}
                      className="w-full py-2.5 bg-[#c83f49] hover:bg-rose-600 disabled:bg-slate-700 text-white font-serif font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" /> Săn Deal Ngay
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 6. READING LOUNGE BY ATMOSPHERE & MOOD */}
        <section className="rounded-3xl bg-white p-6 sm:p-10 paper-card shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#ede5d8] pb-5">
            <div>
              <span className="text-[10px] font-serif uppercase tracking-widest text-[#8c2d19] font-bold">
                KHÔNG GIAN ĐỌC CẢM XÚC
              </span>
              <h2 className="font-serif font-black text-2xl sm:text-3xl text-slate-900 mt-0.5">
                Tủ Sách Theo Trạng Thái &amp; Không Gian
              </h2>
            </div>

            {/* Mood selector buttons */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-xl">
              {readingAtmospheres.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setActiveMood(m.id)}
                  className={`px-4 py-2 rounded-2xl text-xs font-serif font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    activeMood === m.id
                      ? "bg-[#1c1917] text-white shadow-md"
                      : "bg-[#faf7f2] border border-[#ede5d8] text-slate-700 hover:bg-white"
                  }`}
                >
                  <span>{m.icon}</span>
                  <span>{m.title}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {moodFilteredProducts.map((p) => {
              const variant = p.variants[0];
              return (
                <div
                  key={p.id}
                  onClick={() => setQuickViewProduct(p)}
                  className="p-4 rounded-2xl bg-[#faf8f5] border border-[#ede5d8] hover:bg-white hover:shadow-xl transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div className="aspect-[4/5] rounded-xl bg-[#1c1917] text-white p-3 flex flex-col justify-between mb-3 shadow-md">
                    <span className="text-[9px] font-serif uppercase text-amber-300">{p.category.name}</span>
                    <h4 className="font-serif font-black text-xs sm:text-sm line-clamp-3 text-amber-100">{p.name}</h4>
                    <span className="text-[9px] font-serif italic text-slate-400">✍️ {p.author?.name ?? "Melio"}</span>
                  </div>
                  <div>
                    <h5 className="font-serif font-bold text-xs text-slate-900 line-clamp-1 group-hover:text-[#8c2d19]">{p.name}</h5>
                    <b className="font-serif text-sm font-black text-[#1c1917] mt-1 block">{variant ? money(variant.price) : "Liên hệ"}</b>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 7. AUTHOR OF THE WEEK SPOTLIGHT */}
        <section className="rounded-3xl bg-[#faf4ea] p-8 sm:p-12 border border-[#e8dac5] shadow-xs relative overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-4 text-center sm:text-left space-y-3">
              <span className="text-[10px] font-serif uppercase tracking-widest text-[#8c2d19] bg-white px-3 py-1 rounded-full border border-[#e8dac5] font-bold inline-block">
                TÁC GIẢ TIÊU ĐIỂM TRONG TUẦN
              </span>
              <h2 className="font-serif font-black text-2xl sm:text-3xl text-slate-900">
                {authorSpotlight.name}
              </h2>
              <p className="text-xs text-slate-600 font-serif leading-relaxed">
                {authorSpotlight.bio}
              </p>
              <div className="p-4 rounded-2xl bg-white border border-[#e8dac5] text-xs font-serif italic text-[#574431]">
                &ldquo;{authorSpotlight.quote}&rdquo;
              </div>
            </div>

            <div className="lg:col-span-8 space-y-3 font-serif">
              <b className="block text-xs uppercase tracking-wider text-[#8c2d19]">
                Tuyển Tập Tác Phẩm Nổi Bật Được Yêu Thích Nhất:
              </b>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {authorSpotlight.notableBooks.map((bName, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-2xl bg-white border border-[#e8dac5] shadow-2xs hover:shadow-md transition-all text-center space-y-2 flex flex-col justify-between"
                  >
                    <div className="aspect-[4/5] rounded-xl bg-[#1c1917] text-white p-3 flex flex-col justify-between text-left">
                      <span className="text-[8px] uppercase text-amber-300 font-mono">BẢN IN #{i + 1}</span>
                      <h4 className="font-black text-xs line-clamp-3 text-amber-100">{bName}</h4>
                      <span className="text-[8px] italic text-slate-400">Nguyễn Nhật Ánh</span>
                    </div>
                    <span className="font-bold text-xs text-slate-900 block line-clamp-1">{bName}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 8. COMBO BUNDLE SAVINGS ("MUA CÙNG NHAU") */}
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-[#ede5d8] pb-3">
            <div>
              <span className="text-[10px] font-serif uppercase tracking-widest text-[#8c2d19] font-bold">
                COMBO SIÊU TIẾT KIỆM
              </span>
              <h2 className="font-serif font-black text-2xl sm:text-3xl text-slate-900 mt-0.5">
                Mua Trọn Gói &amp; Tiết Kiệm Đến 30%
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-serif italic">Đã gồm hộp quà &amp; Freeship</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {comboBundles.map((bundle) => (
              <div
                key={bundle.id}
                className="p-6 rounded-3xl bg-white paper-card shadow-xs space-y-4 flex flex-col justify-between hover:shadow-xl transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase bg-[#8c2d19] text-white px-2.5 py-0.5 rounded-full">
                      {bundle.tag}
                    </span>
                    <Gift className="w-4 h-4 text-amber-600" />
                  </div>

                  <h3 className="font-serif font-black text-lg text-slate-900 leading-snug">{bundle.title}</h3>
                  <p className="text-xs text-slate-500 font-serif">{bundle.desc}</p>

                  <div className="p-3.5 rounded-2xl bg-[#faf7f2] border border-[#ede5d8] space-y-1.5 text-xs font-serif">
                    <b className="block text-[11px] text-[#8c2d19] uppercase tracking-wider">Bao Gồm:</b>
                    {bundle.items.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-slate-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="line-clamp-1">{it}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-[#ede5d8] flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] text-slate-400 line-through block">{money(bundle.originalPrice)}</span>
                    <b className="text-lg font-serif font-black text-[#c83f49]">{money(bundle.price)}</b>
                  </div>
                  <button
                    onClick={() => addComboToCart(bundle)}
                    className="px-4 py-2.5 rounded-xl bg-[#1c1917] hover:bg-[#8c2d19] text-white font-serif font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" /> Mua Combo
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 9. BOOK OF THE MONTH SPOTLIGHT SPREAD */}
        {spotlightProduct && (
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#241c17] via-[#1a1512] to-[#120f0d] text-white p-8 sm:p-14 shadow-2xl border border-white/10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* 3D Book Jacket (5 cols) */}
              <div className="lg:col-span-5 flex justify-center">
                <div className="w-56 sm:w-64 book-shadow animate-float p-6 rounded-2xl bg-gradient-to-tr from-amber-900 via-rose-950 to-slate-900 border border-white/20 text-white flex flex-col justify-between aspect-[4/5] relative">
                  <div className="bookmark-ribbon" />
                  <div className="border-b border-white/20 pb-2 flex justify-between text-[10px] uppercase font-mono tracking-widest text-amber-200">
                    <span>{spotlightProduct.category.name}</span>
                    <span>BẢN ĐẶC BIỆT</span>
                  </div>
                  <h3 className="font-serif font-black text-xl sm:text-2xl my-auto line-clamp-3 text-amber-100">
                    {spotlightProduct.name}
                  </h3>
                  <div className="border-t border-white/20 pt-2 text-[10px] font-serif italic text-slate-300">
                    ✍️ {spotlightProduct.author?.name ?? spotlightProduct.publisher?.name ?? "Melio Press"}
                  </div>
                </div>
              </div>

              {/* Story (7 cols) */}
              <div className="lg:col-span-7 space-y-4 font-serif">
                <div className="inline-flex items-center gap-2 bg-[#8c2d19] text-white px-3.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-bold">
                  <Award className="w-3.5 h-3.5" /> Tác Phẩm Tiêu Điểm Trong Tháng
                </div>

                <h2 className="font-black text-2xl sm:text-4xl leading-tight text-white">
                  {spotlightProduct.name}
                </h2>

                <p className="text-xs sm:text-sm text-slate-300 italic leading-relaxed">
                  &ldquo;{spotlightProduct.description ?? "Một tác phẩm mang tính biểu tượng, khai mở những góc nhìn sâu sắc về nhân loại và thế giới nội tâm con người."}&rdquo;
                </p>

                {/* Acclaim score */}
                <div className="flex items-center gap-3 py-1 text-xs text-amber-300">
                  <div className="flex text-amber-400">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-amber-400" />
                    ))}
                  </div>
                  <span>4.9/5 · Tuyển chọn bởi Hội đồng Độc giả Melio</span>
                </div>

                {/* Actions */}
                <div className="pt-3 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => addToCart(spotlightProduct)}
                    className="px-6 py-3.5 rounded-full bg-[#8c2d19] hover:bg-[#a33721] text-white font-bold text-xs sm:text-sm shadow-xl transition-all hover:scale-105 flex items-center gap-2"
                  >
                    <ShoppingBag className="w-4 h-4" /> Đặt Mua Ấn Bản {money(spotlightProduct.variants[0]?.price ?? 0)}
                  </button>
                  <button
                    onClick={() => setFlipbookProduct(spotlightProduct)}
                    className="px-5 py-3.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm backdrop-blur-md transition-colors flex items-center gap-2"
                  >
                    <BookOpen className="w-4 h-4" /> Đọc thử 3D lật trang
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 10. FULL CATALOG WITH FACETED FILTERS, SORTING & VIEW MODES */}
        <section
          id="catalog"
          className="scroll-mt-24 rounded-3xl bg-white p-6 sm:p-10 paper-card shadow-xs space-y-6"
        >
          {/* Header & Title */}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-[#ede5d8]">
            <div>
              <p className="text-[11px] font-serif uppercase tracking-[0.2em] text-[#8c2d19] font-bold">
                Kho Hàng Tuyển Chọn
              </p>
              <h2 className="mt-1 font-serif font-black text-2xl sm:text-3xl text-slate-900 tracking-tight">
                {query
                  ? `Kết quả tìm kiếm cho "${query}"`
                  : categoryId
                  ? catalog?.categories.find((c) => c.id === categoryId)?.name
                  : activeDepartment !== "all"
                  ? `Ngành Hàng: ${activeDepartment}`
                  : "Toàn Bộ Sản Phẩm Đang Mở Bán"}
              </h2>
              <p className="text-xs text-slate-500 font-serif mt-1">
                Hiển thị {filteredProducts.length} sản phẩm sẵn sàng phục vụ tại{" "}
                <b>{activeStore?.name}</b>
              </p>
            </div>

            {/* View Mode & Sort Controls */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Sort selector */}
              <div className="flex items-center gap-1.5 bg-[#faf7f2] px-3 py-1.5 rounded-2xl border border-[#ede5d8] text-xs font-serif">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#8c2d19]" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-slate-800 font-semibold outline-none cursor-pointer text-xs"
                >
                  <option value="popular">Phổ biến &amp; Nổi bật</option>
                  <option value="price_asc">Giá: Thấp đến Cao</option>
                  <option value="price_desc">Giá: Cao đến Thấp</option>
                  <option value="name_asc">Tên: A - Z</option>
                  <option value="newest">Mới nhất 2026</option>
                </select>
              </div>

              {/* View mode toggle */}
              <div className="flex items-center bg-[#faf7f2] p-1 rounded-2xl border border-[#ede5d8]">
                <button
                  onClick={() => setViewMode("grid5")}
                  className={`p-1.5 rounded-xl transition-all ${
                    viewMode === "grid5" ? "bg-white text-[#8c2d19] shadow-xs" : "text-slate-500"
                  }`}
                  title="Lưới tiêu chuẩn 5 cột"
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("grid3")}
                  className={`p-1.5 rounded-xl transition-all ${
                    viewMode === "grid3" ? "bg-white text-[#8c2d19] shadow-xs" : "text-slate-500"
                  }`}
                  title="Lưới lớn 3 cột"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-xl transition-all ${
                    viewMode === "list" ? "bg-white text-[#8c2d19] shadow-xs" : "text-slate-500"
                  }`}
                  title="Danh sách chi tiết"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Secondary Filter Chips: Categories, Price Range, In-stock Toggle */}
          <div className="space-y-3">
            {/* Categories */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => {
                  setCategoryId("");
                  setActiveDepartment("all");
                }}
                className={`px-4 py-1.5 rounded-full text-xs font-serif font-bold transition-all shrink-0 ${
                  !categoryId && activeDepartment === "all"
                    ? "bg-[#1c1917] text-white shadow-xs"
                    : "bg-[#faf7f2] hover:bg-[#ede5d8] text-slate-700 border border-[#ede5d8]"
                }`}
              >
                Tất cả ({allProducts.length})
              </button>
              {catalog?.categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategoryId(c.id)}
                  className={`px-4 py-1.5 rounded-full text-xs font-serif font-semibold transition-all shrink-0 ${
                    categoryId === c.id
                      ? "bg-[#1c1917] text-white font-bold shadow-xs"
                      : "bg-[#faf7f2] hover:bg-[#ede5d8] text-slate-700 border border-[#ede5d8]"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {/* Price & Stock quick filter bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#ede5d8] text-xs font-serif">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <span className="text-slate-500 font-bold">Mức giá:</span>
                {[
                  { id: "all", label: "Tất cả" },
                  { id: "under100", label: "< 100k" },
                  { id: "100to250", label: "100k - 250k" },
                  { id: "250to500", label: "250k - 500k" },
                  { id: "above500", label: "> 500k" },
                ].map((pr) => (
                  <button
                    key={pr.id}
                    onClick={() => setPriceRange(pr.id as any)}
                    className={`px-3 py-1 rounded-xl transition-all ${
                      priceRange === pr.id
                        ? "bg-[#8c2d19] text-white font-bold"
                        : "bg-[#faf7f2] text-slate-700 hover:bg-[#ede5d8]"
                    }`}
                  >
                    {pr.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={onlyInStock}
                    onChange={(e) => setOnlyInStock(e.target.checked)}
                    className="size-4 rounded accent-[#8c2d19]"
                  />
                  <span>Chỉ hiện sản phẩm sẵn hàng</span>
                </label>

                {hasActiveFilters && (
                  <button
                    onClick={resetAllFilters}
                    className="text-[#8c2d19] hover:underline flex items-center gap-1 font-bold"
                  >
                    <RotateCcw className="w-3 h-3" /> Xóa bộ lọc
                  </button>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Skeletons or Product Grid */}
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 py-6">
              {Array.from({ length: 10 }).map((_, index) => (
                <div
                  key={index}
                  className="h-80 rounded-3xl bg-[#faf7f2] animate-pulse border border-[#ede5d8]"
                />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-16 text-center space-y-3 font-serif">
              <BookOpen className="w-12 h-12 mx-auto text-slate-300" />
              <h3 className="text-base font-bold text-slate-800">
                Không tìm thấy sản phẩm phù hợp với bộ lọc
              </h3>
              <p className="text-xs text-slate-500">
                Hãy thử chọn lại mức giá hoặc danh mục khác để tìm kiếm nhé.
              </p>
              <button
                onClick={resetAllFilters}
                className="px-4 py-2 rounded-xl bg-[#1c1917] text-white text-xs font-bold"
              >
                Đặt lại bộ lọc
              </button>
            </div>
          ) : viewMode === "list" ? (
            /* LIST VIEW MODE */
            <div className="space-y-4">
              {filteredProducts.map((product) => {
                const variant = product.variants[0];
                const isAvailable = variant && variant.available > 0;
                const isFav = wishlist.includes(product.id);

                return (
                  <article
                    key={product.id}
                    className="p-5 rounded-3xl bg-white border border-[#ede5d8] shadow-2xs hover:shadow-lg transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-6 group"
                  >
                    <div className="flex items-start sm:items-center gap-4">
                      {/* Cover preview */}
                      <div
                        onClick={() => setQuickViewProduct(product)}
                        className="size-24 rounded-2xl bg-gradient-to-tr from-[#1c1917] via-[#2d2521] to-[#171412] text-white p-3 flex flex-col justify-between shrink-0 cursor-pointer shadow-md relative overflow-hidden"
                      >
                        <div className="bookmark-ribbon" />
                        <span className="text-[8px] font-mono text-amber-300 uppercase">
                          {product.category.name}
                        </span>
                        <h4 className="font-serif font-bold text-xs line-clamp-2 text-white">
                          {product.name}
                        </h4>
                      </div>

                      {/* Details */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-serif uppercase tracking-widest text-[#8c2d19] font-bold">
                            {product.brand?.name ?? product.category.name}
                          </span>
                          <span className="text-slate-400 font-mono text-[9px]">
                            {isAvailable ? `Còn ${variant.available} sp` : "Tạm hết"}
                          </span>
                        </div>

                        <h3
                          onClick={() => setQuickViewProduct(product)}
                          className="font-serif font-black text-base sm:text-lg text-slate-900 line-clamp-1 cursor-pointer group-hover:text-[#8c2d19] transition-colors"
                        >
                          {product.name}
                        </h3>

                        <p className="text-xs text-slate-500 font-serif italic line-clamp-1">
                          ✍️{" "}
                          {product.author?.name ??
                            product.brand?.name ??
                            product.publisher?.name ??
                            "Melio"}
                        </p>

                        <div className="flex items-center gap-3 pt-1 text-xs">
                          <button
                            onClick={() => setShelfProduct(product)}
                            className="text-slate-500 hover:text-slate-900 flex items-center gap-1 font-serif"
                          >
                            📍 Kệ sách
                          </button>
                          <button
                            onClick={() => setFlipbookProduct(product)}
                            className="text-[#8c2d19] hover:underline flex items-center gap-1 font-serif"
                          >
                            📖 Đọc thử
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-6 pt-3 sm:pt-0 border-t sm:border-t-0 border-[#ede5d8]">
                      <div className="text-left sm:text-right">
                        <b className="text-lg font-serif font-black text-[#1c1917] block">
                          {variant ? money(variant.price) : "Liên hệ"}
                        </b>
                        <span className="text-[10px] text-slate-400">Giá niêm yết</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleFavorite(product.id)}
                          className={`size-10 rounded-2xl flex items-center justify-center transition-all ${
                            isFav
                              ? "bg-[#8c2d19] text-white"
                              : "bg-[#faf7f2] hover:bg-[#ede5d8] text-slate-600"
                          }`}
                          title="Lưu vào tủ sách"
                        >
                          <Heart className={`w-4 h-4 ${isFav ? "fill-white" : ""}`} />
                        </button>

                        <button
                          onClick={() => addToCart(product)}
                          disabled={!isAvailable}
                          className="px-5 py-3 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] disabled:bg-slate-200 text-white font-serif font-bold text-xs shadow-md transition-all flex items-center gap-2"
                        >
                          <ShoppingBag className="w-4 h-4" /> Thêm vào giỏ
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            /* GRID VIEW MODE (5 or 3 cols) */
            <div
              className={`grid gap-4 ${
                viewMode === "grid3"
                  ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                  : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
              }`}
            >
              {filteredProducts.map((product) => {
                const variant = product.variants[0];
                const isAvailable = variant && variant.available > 0;
                const isFav = wishlist.includes(product.id);

                return (
                  <article
                    key={product.id}
                    className="group relative flex flex-col rounded-3xl bg-white p-4 paper-card shadow-2xs hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300 book-3d"
                  >
                    {/* Favorite Heart */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(product.id);
                      }}
                      className={`absolute top-6 right-6 z-20 size-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all shadow-md ${
                        isFav
                          ? "bg-[#8c2d19] text-white scale-110"
                          : "bg-white/90 hover:bg-white text-slate-600 hover:text-[#8c2d19]"
                      }`}
                      title={isFav ? "Bỏ yêu thích" : "Lưu vào tủ sách cá nhân"}
                    >
                      <Heart className={`w-4 h-4 ${isFav ? "fill-white" : ""}`} />
                    </button>

                    {/* Book / Product Box */}
                    <div
                      onClick={() => setQuickViewProduct(product)}
                      className="relative aspect-[4/5] rounded-2xl overflow-hidden cursor-pointer bg-gradient-to-tr from-[#1c1917] via-[#2d2521] to-[#171412] p-4 text-white flex flex-col justify-between shadow-md border border-white/10"
                    >
                      <div className="bookmark-ribbon" />
                      <div className="relative z-10 flex items-center justify-between border-b border-white/15 pb-1.5">
                        <span className="font-serif uppercase tracking-[0.2em] text-[9px] font-bold text-amber-300">
                          {product.category.name}
                        </span>
                        <BookOpen className="w-3.5 h-3.5 text-white/60" />
                      </div>

                      <div className="relative z-10 my-auto py-2">
                        <h4 className="font-serif font-black text-sm sm:text-base leading-snug line-clamp-3 text-white">
                          {product.name}
                        </h4>
                      </div>

                      <div className="relative z-10 pt-2 border-t border-white/15 text-[10px] font-serif italic text-white/70 line-clamp-1">
                        ✍️{" "}
                        {product.author?.name ??
                          product.brand?.name ??
                          product.publisher?.name ??
                          "Melio Books"}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex flex-1 flex-col pt-3.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-serif font-bold uppercase tracking-widest text-[#8c2d19]">
                        <span>{product.brand?.name ?? product.category.name}</span>
                        <span className="text-slate-400 font-mono text-[9px]">SẴN HÀNG</span>
                      </div>

                      <h3
                        onClick={() => setQuickViewProduct(product)}
                        className="font-serif font-black text-slate-900 leading-snug text-sm sm:text-base line-clamp-2 min-h-11 cursor-pointer group-hover:text-[#8c2d19] transition-colors"
                      >
                        {product.name}
                      </h3>

                      <div className="mt-auto pt-3 border-t border-[#ede7de] flex items-end justify-between gap-2">
                        <div>
                          <span className="block text-base sm:text-lg font-serif font-black text-[#1c1917]">
                            {variant ? money(variant.price) : "Liên hệ"}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span
                              className={`size-2 rounded-full ${
                                isAvailable ? "bg-[#14532d] animate-pulse" : "bg-slate-300"
                              }`}
                            />
                            <span className="text-[10px] font-medium text-slate-600">
                              {isAvailable ? `Còn ${variant.available} sp` : "Tạm hết"}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => addToCart(product)}
                          disabled={!isAvailable}
                          className="size-10 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] text-white disabled:bg-slate-200 disabled:text-slate-400 flex items-center justify-center shadow-md transition-all hover:scale-105 active:scale-95 shrink-0"
                          title="Thêm vào giỏ"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* 11. MELIO LITERARY MAGAZINE & BLOG REVIEWS */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#ede5d8] pb-3">
            <div>
              <span className="text-[10px] font-serif uppercase tracking-widest text-[#8c2d19] font-bold">
                TẠP CHÍ VĂN HÓA ĐỌC
              </span>
              <h2 className="font-serif font-black text-2xl text-slate-900 mt-0.5">
                Bản Tin Tri Thức &amp; Góc Bình Luận Sách
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-serif italic">Tuyển tập bởi Ban Biên Tập Melio</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {blogArticles.map((art) => (
              <div
                key={art.id}
                className="p-6 rounded-3xl bg-white paper-card shadow-xs space-y-3 font-serif flex flex-col justify-between hover:shadow-xl transition-all"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold text-amber-700">
                    <span>{art.category}</span>
                    <span className="text-slate-400">{art.readTime}</span>
                  </div>
                  <h3 className="font-black text-base text-slate-900 leading-snug hover:text-[#8c2d19] transition-colors cursor-pointer">
                    {art.title}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed italic">
                    &ldquo;{art.snippet}&rdquo;
                  </p>
                </div>
                <div className="pt-3 border-t border-[#ede5d8] flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>{art.date}</span>
                  <span className="text-[#8c2d19] font-serif font-bold flex items-center gap-1 cursor-pointer">
                    Đọc tiếp <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 12. PROMOTION VOUCHERS HUB */}
        <section className="rounded-3xl bg-[#1c1917] p-6 sm:p-10 text-white shadow-xl space-y-4 border border-white/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-serif uppercase tracking-widest text-amber-300 bg-white/10 px-3 py-1 rounded-full font-bold">
                KHO VOUCHER ĐỘC QUYỀN
              </span>
              <h2 className="font-serif font-black text-2xl sm:text-3xl mt-1 tracking-tight">
                Ưu Đãi Đặc Quyền Của Bạn Hôm Nay
              </h2>
            </div>
            <p className="text-xs text-slate-400 font-serif italic">Bấm sao chép mã và hệ thống sẽ tự động áp dụng tại bước thanh toán COD</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { code: "MELIOVIP", title: "Giảm 20.000 ₫", desc: "Cho đơn mua sách & VPP từ 200k" },
              { code: "FREESHIP", title: "Miễn Phí Vận Chuyển", desc: "Toàn quốc cho đơn từ 250k" },
              { code: "BOOKFEST", title: "Giảm Thêm 10%", desc: "Tủ sách Văn học & Đồ chơi LEGO" },
            ].map((v) => (
              <div
                key={v.code}
                className="p-5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-3 group hover:bg-white/10 transition-all font-serif"
              >
                <div>
                  <b className="block text-base font-bold text-white">{v.title}</b>
                  <span className="text-xs text-slate-300">{v.desc}</span>
                  <div className="mt-2 text-[11px] font-mono bg-black/40 px-2 py-0.5 rounded text-amber-300 inline-block font-bold">
                    MÃ: {v.code}
                  </div>
                </div>
                <button
                  onClick={() => applyVoucherCode(v.code)}
                  className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold text-xs shadow-md transition-all hover:scale-105 shrink-0"
                >
                  Sao chép
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* 13. NEWSLETTER SUBSCRIPTION BOX */}
        <section className="rounded-3xl bg-[#faf4ea] p-8 sm:p-12 border border-[#e8dac5] shadow-xs text-center space-y-4">
          <div className="max-w-xl mx-auto space-y-2">
            <span className="text-[10px] font-serif uppercase tracking-widest text-[#8c2d19] font-bold">
              BẢN TIN VĂN HÓA ĐỌC
            </span>
            <h2 className="font-serif font-black text-2xl sm:text-3xl text-slate-900">
              Nhận Tuyển Tập Sách Mới &amp; Voucher 20.000 ₫
            </h2>
            <p className="text-xs text-slate-600 font-serif italic">
              Đăng ký email để nhận danh sách ấn phẩm tuyển chọn mỗi tuần và vé mời tham dự Workshop tác giả độc quyền.
            </p>
          </div>

          {newsletterSubscribed ? (
            <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-800 text-xs font-bold font-serif max-w-md mx-auto border border-emerald-200">
              🎉 Cảm ơn bạn! Mã ưu đãi <b>MELIONEW20</b> đã được gửi tới email của bạn.
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newsletterEmail.trim()) setNewsletterSubscribed(true);
              }}
              className="max-w-md mx-auto flex gap-2"
            >
              <input
                type="email"
                required
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                placeholder="Nhập địa chỉ email của bạn..."
                className="flex-1 bg-white border border-[#ede5d8] rounded-2xl px-4 py-3 text-xs font-serif text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20"
              />
              <button
                type="submit"
                className="px-6 py-3 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] text-white font-serif font-bold text-xs shadow-md transition-all shrink-0"
              >
                Đăng Ký
              </button>
            </form>
          )}
        </section>

        {/* 14. TESTIMONIALS & SOCIAL PROOF */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#ede5d8] pb-3">
            <div>
              <span className="text-[10px] font-serif uppercase tracking-widest text-[#8c2d19] font-bold">
                GÓC ĐỘC GIẢ MELIO
              </span>
              <h2 className="font-serif font-black text-2xl text-slate-900 mt-0.5">
                Cảm Nhận Từ Bạn Đọc Thân Thiết
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-serif italic">Hơn 28.000+ độc giả đồng hành</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {customerReviews.map((rev, i) => (
              <div
                key={i}
                className="p-6 rounded-3xl bg-white paper-card shadow-xs space-y-3 font-serif flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex text-amber-500">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <Star key={idx} className="w-4 h-4 fill-amber-400" />
                    ))}
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 italic leading-relaxed">
                    &ldquo;{rev.text}&rdquo;
                  </p>
                </div>

                <div className="pt-3 border-t border-[#ede5d8] flex items-center justify-between text-xs">
                  <div>
                    <b className="block text-slate-900">{rev.avatar} {rev.name}</b>
                    <span className="text-[10px] text-slate-400">{rev.role}</span>
                  </div>
                  <span className="text-[10px] font-bold text-[#8c2d19] bg-[#faf4ea] px-2 py-0.5 rounded">
                    Đã mua hàng
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 15. EDITORIAL FOOTER */}
      <footer className="mt-20 bg-[#1c1917] text-[#e7ded1] border-t border-white/10 font-serif">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="size-10 rounded-2xl bg-[#8c2d19] text-white flex items-center justify-center">
                <BookOpen className="w-5 h-5" />
              </div>
              <span className="font-serif font-black text-2xl text-white">Melio Flagship</span>
            </div>
            <p className="text-xs text-[#b8ab97] leading-relaxed">
              Không gian văn hóa đọc và hiệu sách tuyển chọn kết nối trực tiếp với từng chi nhánh vật lý, nâng niu từng ấn bản trao tận tay bạn đọc.
            </p>
            <div className="pt-2 text-xs text-[#a3947e] space-y-1">
              <p>📍 Chi nhánh Nguyễn Huệ: 124 Nguyễn Huệ, Quận 1, TP.HCM</p>
              <p>📍 Chi nhánh Hoàn Kiếm: 45 Đinh Lễ, Hoàn Kiếm, Hà Nội</p>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-sm text-white mb-3">Dịch Vụ Độc Quyền</h4>
            <ul className="space-y-2 text-xs text-[#b8ab97]">
              <li>• Tra cứu vị trí kệ sách tại chi nhánh</li>
              <li>• Đọc thử trích đoạn sách 3D lật trang</li>
              <li>• Gói quà Vintage &amp; Thiệp viết tay</li>
              <li>• Giao hàng hỏa tốc COD 1-3 ngày toàn quốc</li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-sm text-white mb-3">Hỗ Trợ Bạn Đọc</h4>
            <ul className="space-y-2 text-xs text-[#b8ab97]">
              <li>• Hướng dẫn mua hàng &amp; Thanh toán COD</li>
              <li>• Đổi trả ấn bản lỗi trong vòng 7 ngày</li>
              <li>• Đăng ký vé tham gia Workshop tác giả</li>
              <li>• Tra cứu hành trình vận đơn trực tuyến</li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-sm text-white mb-3">Tổng Đài Thủ Thư</h4>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-amber-300 font-bold">
                <Phone className="w-4 h-4" /> 1900 6868 (8:00 - 21:30)
              </div>
              <p className="text-[#a3947e]">
                Chi nhánh đang trực tuyến: <b>{activeStore?.name}</b>
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 py-5 text-center text-xs text-[#a3947e]">
          © 2026 Melio Bookstore · Hiệu Sách Tri Thức &amp; Nghệ Thuật Đọc
        </div>
      </footer>

      {/* 16. QUICK VIEW PRODUCT MODAL WITH SPECIFICATIONS & REVIEW */}
      {quickViewProduct && (
        <div
          className="fixed inset-0 z-50 bg-[#1c1917]/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onMouseDown={() => setQuickViewProduct(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quickview-title"
            className="w-full max-w-3xl bg-[#fbf9f5] rounded-3xl p-6 sm:p-8 shadow-2xl border border-[#ede5d8] relative max-h-[90vh] overflow-y-auto space-y-6 animate-in zoom-in-95 duration-200"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setQuickViewProduct(null)}
              aria-label="Đóng xem nhanh tác phẩm"
              className="absolute top-5 right-5 size-9 rounded-full bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors shadow-xs"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-start">
              {/* Product Cover Box (5 cols) */}
              <div className="sm:col-span-5">
                <div className="aspect-[4/5] rounded-2xl bg-gradient-to-tr from-[#1c1917] via-[#2d2521] to-[#171412] p-6 text-white flex flex-col justify-between shadow-xl border border-white/15 relative">
                  <div className="bookmark-ribbon" />
                  <span className="text-[10px] font-serif uppercase tracking-widest text-amber-300 font-bold">
                    {quickViewProduct.category.name}
                  </span>
                  <h3 className="font-serif font-black text-xl sm:text-2xl text-amber-100 leading-snug my-auto">
                    {quickViewProduct.name}
                  </h3>
                  <div className="border-t border-white/20 pt-2 text-xs font-serif italic text-slate-300">
                    ✍️ {quickViewProduct.author?.name ?? quickViewProduct.brand?.name ?? "Melio Press"}
                  </div>
                </div>
              </div>

              {/* Details & Specs (7 cols) */}
              <div className="sm:col-span-7 space-y-4 font-serif">
                <div>
                  <span className="inline-block px-3 py-1 rounded-full text-[10px] uppercase tracking-widest bg-[#faf4ea] text-[#8c2d19] border border-[#e8dac5] font-bold">
                    {quickViewProduct.category.name}
                  </span>
                  <h3 id="quickview-title" className="font-black text-2xl text-slate-900 leading-tight mt-2">
                    {quickViewProduct.name}
                  </h3>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 italic">
                    {quickViewProduct.author && <span>✍️ {quickViewProduct.author.name}</span>}
                    {quickViewProduct.publisher && <span>🏢 {quickViewProduct.publisher.name}</span>}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-[#ede5d8] space-y-1">
                  <span className="text-xs text-slate-500">Giá niêm yết chính hãng</span>
                  <div className="text-2xl font-black text-[#1c1917]">
                    {quickViewProduct.variants[0] ? money(quickViewProduct.variants[0].price) : "Liên hệ"}
                  </div>
                  <div className="flex items-center gap-1.5 pt-1 text-xs font-medium text-[#14532d]">
                    <span className="size-2 rounded-full bg-[#14532d]" />
                    <span>
                      Tồn kho khả dụng: {quickViewProduct.variants[0]?.available ?? 0} cuốn tại{" "}
                      <b>{activeStore?.name}</b>
                    </span>
                  </div>
                </div>

                {/* Action Buttons: Shelf Locator + 3D Flipbook */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => setShelfProduct(quickViewProduct)}
                    className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    📍 Xem Vị Trí Kệ Sách
                  </button>
                  <button
                    onClick={() => setFlipbookProduct(quickViewProduct)}
                    className="py-2.5 rounded-xl bg-[#faf4ea] hover:bg-[#ede5d8] text-[#8c2d19] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    📖 Đọc Thử 3D Lật Trang
                  </button>
                </div>

                {quickViewProduct.description && (
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 mb-1">Lời tựa tác phẩm:</h5>
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-4 italic">
                      {quickViewProduct.description}
                    </p>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    onClick={() => {
                      addToCart(quickViewProduct);
                      setQuickViewProduct(null);
                    }}
                    disabled={!quickViewProduct.variants[0]?.available}
                    className="w-full py-3.5 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] disabled:bg-slate-200 text-white font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    Thêm Vào Giỏ Hàng Ngay
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 17. WISHLIST SLIDE-OVER DRAWER */}
      {wishlistOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#1c1917]/50 backdrop-blur-xs flex justify-end animate-in fade-in duration-200"
          onMouseDown={() => setWishlistOpen(false)}
        >
          <aside
            className="w-full max-w-md bg-[#fbf9f5] h-full shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-200 font-serif"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-[#ede5d8] flex items-center justify-between">
              <div>
                <h3 className="font-black text-xl text-slate-900 flex items-center gap-2">
                  <Heart className="w-5 h-5 fill-[#8c2d19] text-[#8c2d19]" /> Tủ Sách Cá Nhân
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {wishlist.length} tác phẩm đã lưu lại
                </p>
              </div>
              <button
                onClick={() => setWishlistOpen(false)}
                className="size-9 rounded-full bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center border border-[#ede5d8]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {wishlist.map((id) => {
                const product = allProducts.find((p) => p.id === id);
                if (!product) return null;
                const variant = product.variants[0];

                return (
                  <div
                    key={id}
                    className="p-3.5 rounded-2xl bg-white border border-[#ede5d8] flex items-center gap-3"
                  >
                    <div className="size-16 rounded-xl bg-[#1c1917] text-white p-2 text-[8px] flex flex-col justify-between shrink-0">
                      <span className="line-clamp-1 text-amber-300">{product.category.name}</span>
                      <span className="line-clamp-2 font-bold">{product.name}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-xs text-slate-900 line-clamp-1">{product.name}</h4>
                      <p className="text-[11px] font-bold text-[#8c2d19] mt-0.5">
                        {variant ? money(variant.price) : "Liên hệ"}
                      </p>

                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => {
                            addToCart(product);
                            setWishlistOpen(false);
                          }}
                          className="px-3 py-1 rounded-lg bg-[#1c1917] text-white text-[11px] font-bold hover:bg-[#8c2d19]"
                        >
                          + Thêm vào giỏ
                        </button>
                        <button
                          onClick={() => toggleFavorite(id)}
                          className="text-slate-400 hover:text-rose-600 text-xs p-1"
                        >
                          Bỏ lưu
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {wishlist.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-16 space-y-3">
                  <Heart className="w-12 h-12 opacity-30 text-[#8c2d19]" />
                  <p className="text-sm font-bold text-slate-700">Tủ sách cá nhân đang trống</p>
                  <p className="text-xs text-slate-400">Bấm biểu tượng trái tim trên sản phẩm để lưu lại xem sau nhé!</p>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-[#ede5d8] bg-white space-y-2">
              {wishlist.length > 0 && (
                <button
                  onClick={addAllWishlistToCart}
                  className="w-full py-3 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all hover:scale-[1.01]"
                >
                  <ShoppingBag className="w-4 h-4" /> Chuyển Tất Cả Vào Giỏ Hàng
                </button>
              )}
              <button
                onClick={() => setWishlistOpen(false)}
                className="w-full py-2.5 rounded-2xl bg-[#faf7f2] hover:bg-[#ede5d8] text-slate-800 font-bold text-xs"
              >
                Đóng danh sách
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* 18. CART SLIDE-OVER DRAWER */}
      {cartOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#1c1917]/50 backdrop-blur-xs flex justify-end animate-in fade-in duration-200"
          onMouseDown={() => setCartOpen(false)}
        >
          <aside
            className="w-full max-w-md bg-[#fbf9f5] h-full shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-200 font-serif"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-[#ede5d8] flex items-center justify-between">
              <div>
                <h3 className="font-black text-xl text-slate-900">Giỏ Hàng Của Bạn</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {itemCount} món hàng · {activeStore?.name}
                </p>
              </div>
              <button
                onClick={() => setCartOpen(false)}
                className="size-9 rounded-full bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center border border-[#ede5d8]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Freeship Progress */}
            <div className="px-5 py-3 bg-[#faf4ea] border-b border-[#e8dac5] text-xs space-y-1.5">
              <div className="flex items-center justify-between font-semibold text-[#4a3b2c]">
                <span>
                  {subtotal >= freeShippingThreshold ? (
                    <span className="text-[#14532d] flex items-center gap-1 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Đủ điều kiện miễn phí giao hàng!
                    </span>
                  ) : (
                    <span>
                      Mua thêm <b>{money(freeShippingThreshold - subtotal)}</b> để được miễn phí giao hàng
                    </span>
                  )}
                </span>
                <span className="font-bold">{progressToFreeShipping}%</span>
              </div>
              <div className="w-full bg-[#e8dac5] rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-[#8c2d19] h-full rounded-full transition-all duration-300"
                  style={{ width: `${progressToFreeShipping}%` }}
                />
              </div>
            </div>

            {/* Line items */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {cart.map((line) => (
                <div
                  key={line.variantId}
                  className="p-3.5 rounded-2xl bg-white border border-[#ede5d8] flex items-center gap-3"
                >
                  <div className="size-16 rounded-xl bg-[#1c1917] text-white p-2 text-[8px] flex flex-col justify-between shrink-0">
                    <span className="line-clamp-1 text-amber-300">{line.category}</span>
                    <span className="line-clamp-2 font-bold">{line.name}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-xs text-slate-900 line-clamp-1">{line.name}</h4>
                    <p className="text-[11px] font-bold text-[#8c2d19] mt-0.5">
                      {money(line.price)}
                    </p>

                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1 bg-[#faf7f2] rounded-lg border border-[#ede5d8] p-0.5">
                        <button
                          onClick={() => changeQuantity(line.variantId, -1)}
                          className="size-5 rounded hover:bg-white flex items-center justify-center text-slate-700"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center text-xs font-bold text-slate-900">
                          {line.quantity}
                        </span>
                        <button
                          onClick={() => changeQuantity(line.variantId, 1)}
                          disabled={line.quantity >= line.available}
                          className="size-5 rounded hover:bg-white disabled:opacity-30 flex items-center justify-center text-slate-700"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        onClick={() =>
                          setCart((lines) => lines.filter((l) => l.variantId !== line.variantId))
                        }
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {cart.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-16 space-y-3">
                  <ShoppingBag className="w-12 h-12 opacity-30 text-[#8c2d19]" />
                  <p className="text-sm font-bold text-slate-700">Giỏ hàng của bạn đang trống</p>
                  <p className="text-xs text-slate-400">Hãy thêm những cuốn sách hay vào giỏ nhé!</p>
                  <button
                    onClick={() => setCartOpen(false)}
                    className="px-4 py-2 rounded-xl bg-[#faf4ea] text-[#8c2d19] text-xs font-bold hover:bg-[#ede5d8]"
                  >
                    Duyệt kho hàng
                  </button>
                </div>
              )}
            </div>

            {/* Cart Footer */}
            {cart.length > 0 && (
              <div className="p-5 border-t border-[#ede5d8] bg-white space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Tạm tính giỏ hàng:</span>
                  <span className="text-lg font-black text-slate-900">{money(subtotal)}</span>
                </div>

                <button
                  onClick={() => {
                    setCartOpen(false);
                    setCheckoutOpen(true);
                  }}
                  className="w-full py-3.5 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] text-white font-bold text-xs sm:text-sm shadow-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
                >
                  Tiến hành thanh toán COD <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* 19. CHECKOUT MODAL */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 bg-[#1c1917]/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-modal-title"
            className="w-full max-w-xl bg-[#fbf9f5] rounded-3xl p-6 sm:p-8 shadow-2xl border border-[#ede5d8] my-8 space-y-5 animate-in zoom-in-95 duration-200 font-serif"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase tracking-widest text-[#8c2d19] bg-[#faf4ea] px-2.5 py-0.5 rounded font-bold border border-[#e8dac5]">
                  Thanh Toán Khi Nhận Hàng (COD)
                </span>
                <h3 id="checkout-modal-title" className="font-black text-2xl sm:text-3xl text-slate-900 mt-1">
                  Thông Tin Giao Nhận
                </h3>
              </div>
              <button
                onClick={() => setCheckoutOpen(false)}
                aria-label="Đóng cửa sổ thanh toán"
                className="size-9 rounded-full bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center border border-[#ede5d8]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Delivery vs Pickup */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setFulfillment("delivery")}
                className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                  fulfillment === "delivery"
                    ? "bg-white border-[#8c2d19] ring-2 ring-[#8c2d19]/20 shadow-xs"
                    : "bg-[#faf7f2] border-[#ede5d8] hover:bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <Truck className={`w-5 h-5 ${fulfillment === "delivery" ? "text-[#8c2d19]" : "text-slate-500"}`} />
                  {fulfillment === "delivery" && <Check className="w-4 h-4 text-[#8c2d19]" />}
                </div>
                <div className="mt-2">
                  <b className="block text-xs sm:text-sm text-slate-900 font-bold">Giao Hàng Tận Nơi</b>
                  <span className="text-[11px] text-slate-500">Kiểm tra hàng &amp; Thanh toán COD</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFulfillment("pickup")}
                className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                  fulfillment === "pickup"
                    ? "bg-white border-[#8c2d19] ring-2 ring-[#8c2d19]/20 shadow-xs"
                    : "bg-[#faf7f2] border-[#ede5d8] hover:bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <Store className={`w-5 h-5 ${fulfillment === "pickup" ? "text-[#8c2d19]" : "text-slate-500"}`} />
                  {fulfillment === "pickup" && <Check className="w-4 h-4 text-[#8c2d19]" />}
                </div>
                <div className="mt-2">
                  <b className="block text-xs sm:text-sm text-slate-900 font-bold">Nhận Tại Cửa Hàng</b>
                  <span className="text-[11px] text-slate-500">{activeStore?.name}</span>
                </div>
              </button>
            </div>

            {/* Customer Inputs */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="customer-name" className="block text-xs font-bold text-slate-700 mb-1">
                    Họ và tên người nhận *
                  </label>
                  <input
                    id="customer-name"
                    required
                    value={customer.name}
                    onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                    placeholder="VD: Nguyễn Văn A"
                    className="w-full bg-white border border-[#ede5d8] rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 focus:border-[#8c2d19]"
                  />
                </div>
                <div>
                  <label htmlFor="customer-phone" className="block text-xs font-bold text-slate-700 mb-1">
                    Số điện thoại nhận hàng *
                  </label>
                  <input
                    id="customer-phone"
                    type="tel"
                    required
                    pattern="[0-9+ ]{9,15}"
                    value={customer.phone}
                    onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                    placeholder="VD: 0901234567"
                    className="w-full bg-white border border-[#ede5d8] rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 focus:border-[#8c2d19]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="customer-email" className="block text-xs font-bold text-slate-700 mb-1">
                  Email nhận hoá đơn điện tử
                </label>
                <input
                  id="customer-email"
                  type="email"
                  value={customer.email}
                  onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                  placeholder="VD: docgia@gmail.com"
                  className="w-full bg-white border border-[#ede5d8] rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 focus:border-[#8c2d19]"
                />
              </div>

              {fulfillment === "delivery" && (
                <div>
                  <label htmlFor="customer-address" className="block text-xs font-bold text-slate-700 mb-1">
                    Địa chỉ giao hàng chi tiết *
                  </label>
                  <textarea
                    id="customer-address"
                    rows={2}
                    required
                    value={customer.address}
                    onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                    placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành phố..."
                    className="w-full bg-white border border-[#ede5d8] rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 focus:border-[#8c2d19]"
                  />
                </div>
              )}

              {/* Gift Wrapping Selector */}
              <div className="p-3.5 rounded-2xl bg-[#faf4ea] border border-[#e8dac5] space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[#8c2d19]">
                  <span className="flex items-center gap-1.5">
                    <Gift className="w-4 h-4" /> Dịch vụ gói quà thủ công &amp; Thiệp viết tay:
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "none", label: "Tiêu chuẩn (0đ)" },
                    { id: "vintage", label: "Vintage Kraft (+25k)" },
                    { id: "heritage", label: "Hộp Di Sản (+45k)" },
                  ].map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGiftWrapping(g.id as any)}
                      className={`p-2 rounded-xl text-[11px] font-bold border transition-all ${
                        giftWrapping === g.id
                          ? "bg-[#1c1917] text-white border-[#1c1917]"
                          : "bg-white text-slate-700 border-[#ede5d8] hover:bg-[#fbf9f5]"
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>

                {giftWrapping !== "none" && (
                  <div>
                    <label htmlFor="customer-gift-msg" className="sr-only">
                      Lời nhắn viết thiệp
                    </label>
                    <input
                      id="customer-gift-msg"
                      value={giftMessage}
                      onChange={(e) => setGiftMessage(e.target.value)}
                      placeholder="Lời nhắn viết thiệp gửi tặng người nhận..."
                      className="w-full bg-white border border-[#ede5d8] rounded-lg px-2.5 py-1.5 text-xs text-slate-900 mt-2"
                    />
                  </div>
                )}
              </div>

              {/* Coupon Code Input */}
              <div>
                <label htmlFor="checkout-coupon-code" className="block text-xs font-bold text-slate-700 mb-1">
                  Mã giảm giá / Voucher ưu đãi (nếu có)
                </label>
                <div className="flex gap-2">
                  <input
                    id="checkout-coupon-code"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="Nhập mã: MELIOVIP, FREESHIP..."
                    className="flex-1 bg-white border border-[#ede5d8] rounded-xl px-3 py-2 text-xs font-mono uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 focus:border-[#8c2d19]"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                {error}
              </div>
            )}

            {/* Total Breakdown & Submit */}
            <div className="pt-4 border-t border-[#ede5d8] flex items-center justify-between gap-4">
              <div>
                <span className="text-xs text-slate-500">Tổng thanh toán COD:</span>
                <span className="block text-2xl font-black text-[#1c1917]">{money(grandTotal)}</span>
              </div>

              <button
                onClick={checkout}
                disabled={
                  submitting ||
                  !customer.name ||
                  !customer.phone ||
                  (fulfillment === "delivery" && !customer.address)
                }
                className="px-6 py-3.5 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs sm:text-sm shadow-xl transition-all hover:scale-[1.02]"
              >
                {submitting ? "Đang xử lý đơn..." : "Xác Nhận Đặt Hàng"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 20. ORDER SUCCESS CELEBRATION MODAL */}
      {success && (
        <div className="fixed inset-0 z-50 bg-[#1c1917]/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#fbf9f5] rounded-3xl p-8 text-center shadow-2xl border border-[#ede5d8] space-y-4 animate-in zoom-in-95 duration-200 font-serif">
            <div className="size-16 rounded-full bg-[#faf4ea] text-[#8c2d19] flex items-center justify-center mx-auto border border-[#e8dac5]">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h3 className="font-black text-2xl sm:text-3xl text-slate-900">
                Đặt Hàng Thành Công!
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Ấn bản của bạn đang được thủ thư Melio chuẩn bị chu đáo
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#1c1917] text-white space-y-1">
              <span className="text-[10px] text-slate-400 font-mono">MÃ ĐƠN HÀNG CỦA BẠN</span>
              <div className="flex items-center justify-center gap-2">
                <span className="font-mono text-xl font-black text-amber-200 tracking-wider">
                  {success.number}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(success.number);
                    setCopiedOrder(true);
                    setTimeout(() => setCopiedOrder(false), 2000);
                  }}
                  className="p-1 rounded bg-white/10 hover:bg-white/20 text-slate-300 transition-colors"
                  title="Sao chép mã đơn hàng"
                >
                  {copiedOrder ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-600 bg-white p-3.5 rounded-2xl border border-[#ede5d8] text-left space-y-1">
              <div className="flex justify-between">
                <span>Tổng tiền thu khi giao (COD):</span>
                <b className="text-[#8c2d19] font-bold">{money(success.total)}</b>
              </div>
              <p className="text-[11px] text-slate-500 pt-1">
                📞 Thủ thư chi nhánh <b>{activeStore?.name}</b> sẽ sớm liên hệ xác nhận đơn hàng với bạn.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Link
                href={`/track?q=${encodeURIComponent(success.number)}`}
                className="w-full py-3.5 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] text-white font-bold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Truck className="w-4 h-4 text-amber-300" /> Theo Dõi Hành Trình Đơn Hàng
              </Link>
              <button
                onClick={() => setSuccess(null)}
                className="w-full py-2.5 rounded-2xl bg-[#faf7f2] hover:bg-[#ede5d8] text-slate-800 font-bold text-xs"
              >
                Tiếp Tục Mua Sắm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 21. IN-STORE SHELF FINDER MODAL */}
      {shelfProduct && (
        <ShelfFinderModal
          productName={shelfProduct.name}
          categoryName={shelfProduct.category.name}
          storeName={activeStore?.name ?? "Melio Central"}
          onClose={() => setShelfProduct(null)}
        />
      )}

      {/* 22. 3D FLIPBOOK READER MODAL */}
      {flipbookProduct && (
        <FlipbookReaderModal
          productName={flipbookProduct.name}
          authorName={flipbookProduct.author?.name ?? flipbookProduct.publisher?.name}
          price={flipbookProduct.variants[0]?.price ?? 0}
          onClose={() => setFlipbookProduct(null)}
          onAddToCart={() => addToCart(flipbookProduct)}
        />
      )}

      {/* 23. AI SMART CONCIERGE CHATBOT */}
      <AIConciergeModal
        onAddToCart={(item) => {
          const matched = allProducts.find((p) => p.name.toLowerCase().includes(item.name.toLowerCase())) ?? allProducts[0];
          if (matched) addToCart(matched);
        }}
      />

      {/* 24. GAMIFICATION LUCKY SPIN WHEEL */}
      <LuckyWheelModal
        onRewardWon={(prize) => {
          showToast(`🎉 Chúc mừng bạn đã quay trúng: ${prize}!`);
        }}
      />

      {/* 25. FLOATING TOAST NOTIFICATION */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1c1917] text-[#fbf8f3] px-5 py-3.5 rounded-2xl shadow-2xl border border-white/10 text-xs font-serif font-semibold flex items-center gap-2.5 animate-in slide-in-from-bottom-5 duration-200">
          <Feather className="w-4 h-4 text-amber-400" />
          <span>{toast}</span>
        </div>
      )}
    </main>
  );
}
