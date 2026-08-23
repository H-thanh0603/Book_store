"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Baby,
  Bot,
  Gamepad2,
  Heart,
  PartyPopper,
  Plus,
  Rocket,
  Search,
  ShieldCheck,
  ShoppingBag,
  Smile,
  Sparkles,
  ToyBrick,
  X,
} from "lucide-react";

type Variant = { id: string; name: string; sku: string; price: number; available: number };
type Product = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  category: { id: string; name: string };
  brand?: { name: string } | null;
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

const toyCategories = [
  { id: "all", name: "Tất Cả Đồ Chơi", icon: ToyBrick, color: "bg-amber-100 text-amber-900 border-amber-300" },
  { id: "lego", name: "Lắp Ráp LEGO & Khối Xây Dựng", icon: ToyBrick, color: "bg-rose-100 text-rose-900 border-rose-300" },
  { id: "plush", name: "Gấu Bông & Sanrio Hello Kitty", icon: Smile, color: "bg-pink-100 text-pink-900 border-pink-300" },
  { id: "boardgame", name: "Board Game & Trò Chơi Gia Đình", icon: Gamepad2, color: "bg-indigo-100 text-indigo-900 border-indigo-300" },
  { id: "steam", name: "Đồ Chơi Khoa Học & STEAM", icon: Rocket, color: "bg-emerald-100 text-emerald-900 border-emerald-300" },
  { id: "figure", name: "Mô Hình Nhân Vật & Búp Bê", icon: Bot, color: "bg-purple-100 text-purple-900 border-purple-300" },
];

const ageGroups = [
  { label: "Mọi lứa tuổi", value: "all" },
  { label: "0 - 3 Tuổi (Mầm non)", value: "0-3" },
  { label: "3 - 6 Tuổi (Mẫu giáo)", value: "3-6" },
  { label: "6 - 12 Tuổi (Tiểu học)", value: "6-12" },
  { label: "12+ Tuổi & Gia đình", value: "12+" },
];

function money(v: number) {
  return `${v.toLocaleString("vi-VN")} ₫`;
}

export default function ToysPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [storeId, setStoreId] = useState("");
  const [query, setQuery] = useState("");
  const [selectedToyCategory, setSelectedToyCategory] = useState("all");
  const [selectedAge, setSelectedAge] = useState("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [, setQuickViewProduct] = useState<Product | null>(null);
  const [, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setCart(JSON.parse(localStorage.getItem(CART_KEY) ?? "[]"));
        setWishlist(JSON.parse(localStorage.getItem(WISHLIST_KEY) ?? "[]"));
      } catch {}
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
  }, [wishlist]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (storeId) params.set("storeId", storeId);
      try {
        const res = await fetch(`/api/storefront?${params}`);
        const data = await res.json();
        if (res.ok) {
          setCatalog(data);
          if (!storeId) setStoreId(data.storeId);
        }
      } catch {}
      setLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, storeId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function toggleWishlist(id: string) {
    setWishlist((prev) => {
      const exists = prev.includes(id);
      if (exists) {
        showToast("Đã bỏ khỏi danh sách yêu thích");
        return prev.filter((x) => x !== id);
      }
      showToast("💖 Đã thêm vào danh sách đồ chơi yêu thích!");
      return [...prev, id];
    });
  }

  const allProducts = useMemo(() => catalog?.products ?? [], [catalog?.products]);
  const toyProducts = useMemo(() => {
    return allProducts.filter(
      (p) =>
        p.category.name.toLowerCase().includes("đồ chơi") ||
        p.brand?.name?.toLowerCase().includes("lego") ||
        p.brand?.name?.toLowerCase().includes("sanrio") ||
        p.name.toLowerCase().includes("lego") ||
        p.name.toLowerCase().includes("gấu bông") ||
        p.name.toLowerCase().includes("board game")
    );
  }, [allProducts]);

  const activeStore = catalog?.stores.find((s) => s.id === storeId);
  const itemCount = cart.reduce((sum, l) => sum + l.quantity, 0);
  const subtotal = cart.reduce((sum, l) => sum + l.quantity * l.price, 0);

  function addToCart(product: Product) {
    const variant = product.variants[0];
    if (!variant || variant.available <= 0) return;
    setCart((lines) => {
      const current = lines.find((l) => l.variantId === variant.id);
      if (current)
        return lines.map((l) =>
          l.variantId === variant.id
            ? { ...l, quantity: Math.min(l.quantity + 1, variant.available) }
            : l
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
    showToast(`🎁 Đã thêm "${product.name}" vào giỏ đồ chơi!`);
    setCartOpen(true);
  }

  return (
    <main className="min-h-screen bg-[#fffdf7] text-slate-900 pb-24 font-sans selection:bg-[#f59e0b] selection:text-white">
      {/* 1. TOP ANNOUNCEMENT */}
      <div className="bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 text-white px-4 py-2 text-xs font-black shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="bg-white text-rose-600 px-2 py-0.5 rounded-full text-[10px] uppercase font-black">
              VƯƠNG QUỐC ĐỒ CHƠI
            </span>
            <span>🎪 Thế giới đồ chơi chính hãng 100% LEGO, Sanrio Hello Kitty, Board Game an toàn cho bé</span>
          </div>
          <div className="hidden md:flex items-center gap-4 text-[11px]">
            <Link href="/shop" className="hover:underline flex items-center gap-1">
              ← Trở về siêu thị sách &amp; VPP
            </Link>
            <span className="bg-black/20 px-2 py-0.5 rounded">📍 {activeStore?.name}</span>
          </div>
        </div>
      </div>

      {/* 2. HEADER */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-amber-100 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <Link href="/toys" className="flex items-center gap-2.5 group">
            <div className="size-11 rounded-2xl bg-gradient-to-tr from-amber-400 via-rose-500 to-purple-500 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-all">
              <ToyBrick className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="font-black text-2xl text-slate-900 tracking-tight leading-none">
                  Melio
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400 text-amber-950 px-1.5 py-0.5 rounded-full">
                  Toys &amp; Play
                </span>
              </div>
              <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Thế Giới Đồ Chơi Sáng Tạo</p>
            </div>
          </Link>

          {/* Search bar */}
          <div className="relative flex-1 max-w-md hidden sm:block">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm kiếm LEGO, Hello Kitty, Board Game..."
              className="w-full bg-white border border-amber-200 rounded-2xl pl-10 pr-9 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Links & Cart */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/back-to-school"
              className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors"
            >
              🎒 Mùa Tựu Trường
            </Link>
            <Link
              href="/deals"
              className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-rose-50 text-rose-700 text-xs font-bold hover:bg-rose-100 transition-colors"
            >
              ⚡ Săn Ưu Đãi
            </Link>

            <button
              onClick={() => setCartOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 text-white font-bold text-xs shadow-md hover:scale-105 transition-all"
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="hidden sm:inline">Giỏ đồ chơi</span>
              {itemCount > 0 && (
                <span className="size-5 rounded-full bg-white text-rose-600 font-black text-[10px] flex items-center justify-center">
                  {itemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* 3. HERO SHOWCASE */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-8">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#4c1d95] via-[#831843] to-[#9a3412] p-8 sm:p-12 text-white shadow-2xl">
          <div className="absolute -top-10 -right-10 w-96 h-96 bg-amber-400/20 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 bg-amber-400 text-amber-950 px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider shadow-sm">
              <PartyPopper className="w-4 h-4" /> Lễ Hội Đồ Chơi Sáng Tạo 2026
            </div>
            <h1 className="font-serif font-black text-3xl sm:text-5xl leading-tight">
              Khơi Dậy Trí Tuệ &amp; <br />
              <span className="text-amber-300">Niềm Vui Tuổi Thơ Bất Tận</span>
            </h1>
            <p className="text-xs sm:text-sm text-purple-100 leading-relaxed max-w-xl">
              Tuyển tập những bộ xếp hình LEGO trí tuệ, gấu bông Sanrio siêu mềm mại và Board Game kết nối cả gia đình trong từng khoảnh khắc sum vầy.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <a
                href="#toy-grid"
                className="px-6 py-3.5 rounded-full bg-amber-400 hover:bg-amber-300 text-amber-950 font-black text-xs sm:text-sm shadow-xl transition-all hover:scale-105"
              >
                Khám phá ngay bộ sưu tập
              </a>
              <div className="flex items-center gap-1.5 text-xs text-amber-200 font-bold bg-white/10 px-3.5 py-2.5 rounded-full backdrop-blur-md">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Nhựa an toàn EN71 &amp; CR chuẩn quốc tế
              </div>
            </div>
          </div>
        </section>

        {/* 4. TOY CATEGORY CARDS */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {toyCategories.map((c) => {
            const Icon = c.icon;
            const isSelected = selectedToyCategory === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedToyCategory(c.id)}
                className={`p-4 rounded-3xl border flex flex-col items-center text-center transition-all ${
                  isSelected
                    ? "bg-amber-500 text-white border-amber-600 shadow-md scale-105"
                    : "bg-white hover:bg-amber-50 border-amber-100 text-amber-950 shadow-2xs"
                }`}
              >
                <div className={`size-12 rounded-2xl flex items-center justify-center mb-2 ${isSelected ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <span className="text-xs font-black line-clamp-2">{c.name}</span>
              </button>
            );
          })}
        </section>

        {/* 5. AGE FILTER */}
        <section className="rounded-3xl bg-white p-6 shadow-xs border border-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Baby className="w-4 h-4 text-rose-500" />
            <span>Chọn đồ chơi theo độ tuổi của bé:</span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {ageGroups.map((a) => (
              <button
                key={a.value}
                onClick={() => setSelectedAge(a.value)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  selectedAge === a.value
                    ? "bg-rose-500 text-white shadow-xs"
                    : "bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-200/60"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </section>

        {/* 6. TOY PRODUCT CATALOG */}
        <section id="toy-grid" className="rounded-3xl bg-white p-6 sm:p-8 shadow-xs border border-amber-100 space-y-6">
          <div className="flex items-center justify-between border-b border-amber-100 pb-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                Kho Đồ Chơi Chính Hãng
              </span>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                Các Món Đồ Chơi Nổi Bật
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-bold">
              Có sẵn tại {activeStore?.name}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {(toyProducts.length > 0 ? toyProducts : allProducts).map((product) => {
              const variant = product.variants[0];
              const isAvailable = variant && variant.available > 0;
              const isFav = wishlist.includes(product.id);

              return (
                <div
                  key={product.id}
                  className="group relative rounded-3xl bg-gradient-to-b from-[#fffefc] to-amber-50/30 p-4 border border-amber-200/80 shadow-2xs hover:shadow-xl hover:-translate-y-1.5 transition-all flex flex-col justify-between"
                >
                  <button
                    onClick={() => toggleWishlist(product.id)}
                    className={`absolute top-4 right-4 z-10 size-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-xs ${
                      isFav ? "bg-rose-600 text-white" : "bg-white text-rose-950/60 hover:text-rose-600"
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${isFav ? "fill-white" : ""}`} />
                  </button>

                  <div
                    onClick={() => setQuickViewProduct(product)}
                    className="relative aspect-square rounded-2xl bg-white p-6 flex flex-col items-center justify-center text-center cursor-pointer border border-amber-100 shadow-xs"
                  >
                    <div className="size-20 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <ToyBrick className="w-10 h-10" />
                    </div>
                    {product.brand?.name && (
                      <span className="mt-3 px-2.5 py-0.5 rounded-full bg-slate-900 text-white text-[10px] font-black uppercase">
                        {product.brand.name}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 space-y-1.5">
                    <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                      {product.category.name}
                    </span>
                    <h3
                      onClick={() => setQuickViewProduct(product)}
                      className="font-bold text-sm text-slate-900 line-clamp-2 cursor-pointer hover:text-rose-600 min-h-10"
                    >
                      {product.name}
                    </h3>
                    <div className="flex items-center justify-between pt-2 border-t border-amber-100">
                      <span className="text-base font-black text-rose-600">
                        {variant ? money(variant.price) : "Liên hệ"}
                      </span>
                      <button
                        onClick={() => addToCart(product)}
                        disabled={!isAvailable}
                        className="size-9 rounded-xl bg-amber-500 hover:bg-rose-500 disabled:bg-slate-200 text-white flex items-center justify-center shadow-md transition-all hover:scale-105"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* CART DRAWER */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end">
          <aside className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between p-6">
            <div className="flex items-center justify-between border-b pb-4">
              <h3 className="font-black text-xl text-slate-900">Giỏ Đồ Chơi Của Bé</h3>
              <button onClick={() => setCartOpen(false)} className="p-2 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {cart.map((l) => (
                <div key={l.variantId} className="p-3 rounded-2xl bg-amber-50/50 border border-amber-100 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-xs text-slate-900 line-clamp-1">{l.name}</h4>
                    <p className="text-xs font-black text-rose-600 mt-0.5">{money(l.price)} x {l.quantity}</p>
                  </div>
                  <span className="font-mono font-bold text-xs">{money(l.price * l.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-4 space-y-3">
              <div className="flex justify-between font-black text-base">
                <span>Tổng tiền:</span>
                <span className="text-rose-600">{money(subtotal)}</span>
              </div>
              <Link
                href="/shop"
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 text-white font-black text-center text-xs flex items-center justify-center gap-2 shadow-lg"
              >
                Chuyển Đến Trang Thanh Toán COD <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </aside>
        </div>
      )}

      {/* FLOATING TOAST */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-950 text-white px-5 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>{toast}</span>
        </div>
      )}
    </main>
  );
}
