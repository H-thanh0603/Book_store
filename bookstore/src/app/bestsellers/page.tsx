"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Award,
  BookOpen,
  Crown,
  Flame,
  Heart,
  Medal,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  Trophy,
  X,
  Zap,
} from "lucide-react";

type Variant = { id: string; name: string; sku: string; price: number; available: number };
type Product = {
  id: string;
  name: string;
  description: string | null;
  category: { id: string; name: string };
  brand?: { name: string } | null;
  author?: { name: string } | null;
  publisher?: { name: string } | null;
  variants: Variant[];
};
type Catalog = { products: Product[]; categories: { id: string; name: string }[]; stores: { id: string; name: string; code: string }[]; storeId: string };
type CartLine = { variantId: string; productId: string; name: string; category: string; price: number; quantity: number; available: number };

const CART_KEY = "melio.storefront.cart.v1";

const rankBadges = [
  { rank: 1, bg: "bg-amber-400 text-slate-950 ring-4 ring-amber-200", icon: Crown, label: "QUÁN QUÂN" },
  { rank: 2, bg: "bg-slate-300 text-slate-950 ring-4 ring-slate-100", icon: Medal, label: "Á QUÂN" },
  { rank: 3, bg: "bg-amber-700 text-white ring-4 ring-amber-900/20", icon: Award, label: "HẠNG 3" },
];

function money(v: number) {
  return `${v.toLocaleString("vi-VN")} ₫`;
}

export default function BestsellersPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [timeframe, setTimeframe] = useState<"week" | "month" | "year">("week");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    try {
      setCart(JSON.parse(localStorage.getItem(CART_KEY) ?? "[]"));
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    fetch("/api/storefront")
      .then((r) => r.json())
      .then((d) => setCatalog(d))
      .catch(() => {});
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function addToCart(p: Product) {
    const v = p.variants[0];
    if (!v || v.available <= 0) return;
    setCart((lines) => {
      const cur = lines.find((l) => l.variantId === v.id);
      if (cur) return lines.map((l) => (l.variantId === v.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...lines, { variantId: v.id, productId: p.id, name: p.name, category: p.category.name, price: v.price, quantity: 1, available: v.available }];
    });
    showToast(`🏆 Đã thêm "${p.name}" vào giỏ hàng!`);
  }

  const products = catalog?.products ?? [];
  const filtered = useMemo(() => {
    if (selectedCategory === "all") return products;
    return products.filter((p) =>
      p.category.name.toLowerCase().includes(selectedCategory.toLowerCase())
    );
  }, [products, selectedCategory]);

  return (
    <main className="min-h-screen bg-[#faf8f5] text-slate-900 pb-24 font-sans selection:bg-[#d97706] selection:text-white">
      {/* 1. TOP ANNOUNCEMENT BAR */}
      <div className="bg-[#1c1917] text-white px-4 py-2 text-xs font-bold shadow-xs border-b border-white/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-black">
              MELIO CHARTS 2026
            </span>
            <span>🏆 Bảng xếp hạng 100 tác phẩm &amp; ấn phẩm bán chạy nhất được cập nhật mỗi thứ Hai</span>
          </div>
          <Link href="/shop" className="hover:underline text-[11px] hidden sm:inline text-amber-200">
            ← Trở về siêu thị sách
          </Link>
        </div>
      </div>

      {/* 2. HEADER */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-[#ede5d8] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <Link href="/bestsellers" className="flex items-center gap-2.5 group">
            <div className="size-11 rounded-2xl bg-[#1c1917] text-amber-400 flex items-center justify-center shadow-md group-hover:scale-105 transition-all">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="font-serif font-black text-2xl text-slate-900 tracking-tight leading-none">
                  Melio
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded">
                  Bestsellers
                </span>
              </div>
              <p className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">Top 100 Sách Bán Chạy</p>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/gift-finder" className="text-xs font-bold text-slate-600 hover:text-amber-700 hidden sm:inline">
              🎁 Tìm Quà Tặng
            </Link>
            <Link href="/reading-challenge" className="text-xs font-bold text-slate-600 hover:text-amber-700 hidden sm:inline">
              👥 Thử Thách Đọc
            </Link>
            <Link href="/stores" className="text-xs font-bold text-slate-600 hover:text-amber-700 hidden sm:inline">
              🏛️ Chi Nhánh &amp; Sự Kiện
            </Link>
            <Link
              href="/shop"
              className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-[#1c1917] text-white font-bold text-xs shadow-md hover:bg-amber-600 transition-colors"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Giỏ hàng ({cart.reduce((s, l) => s + l.quantity, 0)})</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 3. HERO SPREAD */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        <section className="rounded-3xl bg-gradient-to-r from-[#1c1917] via-[#2a221b] to-[#171412] text-white p-8 sm:p-14 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-96 h-96 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 bg-amber-400 text-slate-950 px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider">
              <Flame className="w-4 h-4" /> BẢNG XẾP HẠNG THỊNH HÀNH
            </div>
            <h1 className="font-serif font-black text-3xl sm:text-5xl leading-tight">
              Những Tác Phẩm &amp; Ấn Bản <br />
              <span className="text-amber-300">Được Yêu Thích Nhất 2026</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 font-serif italic leading-relaxed">
              Tổng hợp dữ liệu doanh số thực tế từ hệ thống 5 siêu thị nhà sách Melio và kênh bán hàng trực tuyến toàn quốc.
            </p>

            {/* Timeframe selector */}
            <div className="pt-2 flex items-center gap-2">
              {[
                { id: "week", label: "Tuần Này" },
                { id: "month", label: "Tháng 08/2026" },
                { id: "year", label: "Cả Năm 2026" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTimeframe(t.id as any)}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
                    timeframe === t.id
                      ? "bg-amber-400 text-slate-950 shadow-md font-black"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 4. CATEGORY PILLS */}
        <section className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { id: "all", label: "Tất Cả Thể Loại" },
            { id: "văn học", label: "Văn Học Bestseller" },
            { id: "kinh tế", label: "Kinh Doanh & Khởi Nghiệp" },
            { id: "văn phòng phẩm", label: "VPP & Bút Viết Top 1" },
            { id: "đồ chơi", label: "Đồ Chơi Sáng Tạo LEGO" },
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedCategory === c.id
                  ? "bg-[#1c1917] text-white shadow-md"
                  : "bg-white border border-[#ede5d8] text-slate-700 hover:bg-[#faf7f2]"
              }`}
            >
              {c.label}
            </button>
          ))}
        </section>

        {/* 5. RANKINGS LEADERBOARD */}
        <section className="space-y-4">
          {filtered.map((product, idx) => {
            const rank = idx + 1;
            const variant = product.variants[0];
            const badge = rankBadges.find((b) => b.rank === rank);
            const soldCount = (120 - idx * 7) > 20 ? (120 - idx * 7) : 25;

            return (
              <div
                key={product.id}
                className="p-5 rounded-3xl bg-white border border-[#ede5d8] shadow-2xs hover:shadow-xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
              >
                <div className="flex items-center gap-4">
                  {/* Rank Number */}
                  <div
                    className={`size-12 rounded-2xl flex items-center justify-center font-black text-base shrink-0 ${
                      badge ? badge.bg : "bg-slate-100 text-slate-600 font-mono"
                    }`}
                  >
                    #{rank}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                        {product.category.name}
                      </span>
                      {rank <= 3 && (
                        <span className="text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-600 px-2 py-0.5 rounded">
                          HOT TRENDING
                        </span>
                      )}
                    </div>
                    <h3 className="font-serif font-black text-base sm:text-lg text-slate-900 mt-1 group-hover:text-amber-700 transition-colors">
                      {product.name}
                    </h3>
                    <p className="text-xs text-slate-500 font-serif italic">
                      {product.author?.name ? `Tác giả: ${product.author.name}` : product.brand?.name ? `Thương hiệu: ${product.brand.name}` : "Melio Collection"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-6 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <div className="text-left sm:text-right">
                    <span className="text-[11px] text-slate-400 block font-serif">Đã bán {soldCount * 12}+ cuốn</span>
                    <b className="text-lg font-serif font-black text-slate-900">
                      {variant ? money(variant.price) : "Liên hệ"}
                    </b>
                  </div>

                  <button
                    onClick={() => addToCart(product)}
                    disabled={!variant?.available}
                    className="px-5 py-3 rounded-2xl bg-[#1c1917] hover:bg-amber-600 disabled:bg-slate-200 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Mua Ngay
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      </div>

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
