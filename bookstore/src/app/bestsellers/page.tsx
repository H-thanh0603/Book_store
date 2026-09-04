"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Award, Crown, Flame, Medal, Plus, ShoppingBag, Sparkles, Trophy } from "lucide-react";
import ProductCover from "../shop/_components/ProductCover";
import { useCart } from "@/contexts/CartContext";

type Variant = { id: string; name: string; sku: string; price: number; available: number };
type Product = {
  id: string;
  name: string;
  description: string | null;
  category: { id: string; name: string };
  brand?: { name: string } | null;
  author?: { name: string } | null;
  publisher?: { name: string } | null;
  image?: string | null;
  variants: Variant[];
};
type Catalog = { products: Product[]; categories: { id: string; name: string }[]; stores: { id: string; name: string; code: string }[]; storeId: string };

const rankBadges = [
  { rank: 1, bg: "bg-amber-400 text-amber-950 font-black ring-4 ring-amber-200", icon: Crown, label: "QUÁN QUÂN" },
  { rank: 2, bg: "bg-slate-200 text-slate-900 font-black ring-4 ring-slate-100", icon: Medal, label: "Á QUÂN" },
  { rank: 3, bg: "bg-amber-700 text-white ring-4 ring-amber-900/20", icon: Award, label: "HẠNG 3" },
];

function money(v: number) {
  return `${v.toLocaleString("vi-VN")} ₫`;
}

export default function BestsellersPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [timeframe, setTimeframe] = useState<"week" | "month" | "year">("week");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const { addItem, itemCount } = useCart();
  const [toast, setToast] = useState<string | null>(null);

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
    addItem({
      variantId: v.id, productId: p.id, name: p.name,
      category: p.category.name, price: v.price, available: v.available,
    });
    showToast(`Đã thêm "${p.name}" vào giỏ hàng!`);
  }

  const products = useMemo(() => catalog?.products ?? [], [catalog]);
  const filtered = useMemo(() => {
    if (selectedCategory === "all") return products;
    return products.filter((p) =>
      p.category.name.toLowerCase().includes(selectedCategory.toLowerCase())
    );
  }, [products, selectedCategory]);

  return (
    <main className="min-h-screen bg-slate-50/70 text-slate-900 pb-24 font-sans selection:bg-amber-500 selection:text-white">
      {/* 1. TOP ANNOUNCEMENT BAR */}
      <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 gradient-animated text-white px-4 py-2 text-xs font-bold shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="bg-white text-amber-950 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-black">
              MELIO CHARTS 2026
            </span>
            <span className="drop-shadow-xs">🏆 Bảng xếp hạng 100 tác phẩm &amp; ấn phẩm bán chạy nhất được cập nhật mỗi thứ Hai</span>
          </div>
          <Link href="/shop" className="hover:text-yellow-200 text-[11px] hidden sm:inline font-bold">
            ← Trở về siêu thị sách
          </Link>
        </div>
      </div>

      {/* 2. HEADER */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-slate-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <Link href="/bestsellers" className="flex items-center gap-2.5 group">
            <div className="size-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-500/25 group-hover:scale-105 transition-all">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-serif font-black text-2xl text-slate-900 tracking-tight leading-none">
                  Melio
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 px-2 py-0.5 rounded-full shadow-2xs">
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
            <Link href="/deals" className="text-xs font-bold text-slate-600 hover:text-amber-700 hidden sm:inline">
              ⚡ Săn Giờ Vàng
            </Link>
            <Link
              href="/shop"
              className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all hover:scale-105"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Giỏ hàng ({itemCount})</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 3. HERO SPREAD */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        <section className="rounded-3xl bg-gradient-to-r from-amber-500 via-yellow-500 to-orange-500 text-white p-8 sm:p-14 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 size-96 bg-white/20 rounded-full blur-3xl pointer-events-none animate-pulse-glow" />
          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 bg-black/20 text-white px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider backdrop-blur-xs border border-white/20">
              <Flame className="w-4 h-4 text-amber-200" /> BẢNG XẾP HẠNG THỊNH HÀNH
            </div>
            <h1 className="font-serif font-black text-3xl sm:text-5xl leading-tight text-white drop-shadow-sm">
              Những Tác Phẩm &amp; Ấn Bản <br />
              <span className="text-slate-950 font-serif">Được Yêu Thích Nhất 2026</span>
            </h1>
            <p className="text-sm sm:text-base text-white/90 font-medium leading-relaxed">
              Tổng hợp dữ liệu doanh số thực tế từ hệ thống siêu thị nhà sách Melio và kênh bán lẻ trực tuyến giao hàng 2H toàn quốc.
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
                  onClick={() => setTimeframe(t.id as "week" | "month" | "year")}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                    timeframe === t.id
                      ? "bg-slate-950 text-white shadow-md font-black scale-105"
                      : "bg-white/20 text-white hover:bg-white/30"
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
              className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === c.id
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md font-black scale-105"
                  : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
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

            return (
              <div
                key={product.id}
                className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
              >
                <div className="flex items-center gap-4">
                  {/* Rank Number */}
                  <div
                    className={`size-12 rounded-2xl flex items-center justify-center font-black text-base shrink-0 shadow-xs ${
                      badge ? badge.bg : "bg-slate-100 text-slate-700 font-mono"
                    }`}
                  >
                    #{rank}
                  </div>

                  {/* Cover thumbnail */}
                  <div className="w-16 shrink-0 hidden sm:block">
                    <ProductCover
                      id={product.id}
                      name={product.name}
                      categoryName={product.category.name}
                      authorName={product.author?.name}
                      image={product.image ?? null}
                    />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
                        {product.category.name}
                      </span>
                      {rank <= 3 && (
                        <span className="text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full">
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
                    <b className="text-lg font-serif font-black text-slate-900">
                      {variant ? money(variant.price) : "Liên hệ"}
                    </b>
                  </div>

                  <button
                    onClick={() => addToCart(product)}
                    disabled={!variant?.available}
                    className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:bg-slate-200 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all flex items-center gap-2 cursor-pointer hover:scale-105 active:scale-95"
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
