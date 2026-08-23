"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Clock3,
  Flame,
  ShoppingBag,
  Sparkles,
  TicketPercent,
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
  variants: Variant[];
};
type Catalog = { products: Product[]; categories: { id: string; name: string }[]; stores: { id: string; name: string; code: string }[]; storeId: string };
type CartLine = { variantId: string; productId: string; name: string; category: string; price: number; quantity: number; available: number };

const CART_KEY = "melio.storefront.cart.v1";

const voucherHub = [
  { code: "MELIODEAL50", title: "Giảm 50.000 ₫", condition: "Cho đơn mua sắm từ 500k", color: "from-rose-600 to-orange-500", badge: "HOT NHẤT" },
  { code: "FREESHIPMAX", title: "Miễn Phí Vận Chuyển", condition: "Toàn quốc không giới hạn số lượng", color: "from-emerald-600 to-teal-500", badge: "FREESHIP" },
  { code: "BACK2SCHOOL", title: "Giảm 15% Dụng Cụ Học Tập", condition: "Áp dụng cho vở viết, bút Thiên Long", color: "from-amber-600 to-orange-500", badge: "TỰU TRƯỜNG" },
  { code: "TOYFEST20", title: "Giảm 20.000 ₫ Đồ Chơi", condition: "Đơn đồ chơi LEGO & Sanrio từ 250k", color: "from-rose-600 to-amber-500", badge: "ĐỒ CHƠI" },
];

function money(v: number) {
  return `${v.toLocaleString("vi-VN")} ₫`;
}

export default function DealsPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [countdown, setCountdown] = useState({ h: 3, m: 28, s: 45 });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setCart(JSON.parse(localStorage.getItem(CART_KEY) ?? "[]")); } catch {}
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev.s > 0) return { ...prev, s: prev.s - 1 };
        if (prev.m > 0) return { ...prev, m: prev.m - 1, s: 59 };
        if (prev.h > 0) return { h: prev.h - 1, m: 59, s: 59 };
        return { h: 4, m: 0, s: 0 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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

  function copyVoucher(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    showToast(`🎟️ Đã sao chép mã ưu đãi "${code}"!`);
    setTimeout(() => setCopiedCode(null), 2500);
  }

  function addToCart(p: Product) {
    const v = p.variants[0];
    if (!v || v.available <= 0) return;
    setCart((lines) => {
      const cur = lines.find((l) => l.variantId === v.id);
      if (cur) return lines.map((l) => (l.variantId === v.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...lines, { variantId: v.id, productId: p.id, name: p.name, category: p.category.name, price: v.price, quantity: 1, available: v.available }];
    });
    showToast(`⚡ Đã thêm deal "${p.name}" vào giỏ hàng!`);
    setCartOpen(true);
  }

  const products = catalog?.products ?? [];
  const itemCount = cart.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <main className="min-h-screen bg-[#0b0f19] text-white pb-24 font-sans selection:bg-[#f43f5e] selection:text-white">
      {/* 1. TOP TICKER */}
      <div className="bg-gradient-to-r from-rose-600 via-orange-500 to-amber-500 text-white px-4 py-2 text-xs font-black shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="bg-black/30 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-black tracking-wider">
              FLASH DEALS 24H
            </span>
            <span>🔥 Săn hàng nghìn deal giảm giá sốc đến 50% cho Sách, VPP &amp; Đồ chơi mỗi ngày</span>
          </div>
          <Link href="/shop" className="hover:underline hidden sm:inline text-[11px]">
            ← Về Cửa Hàng Chính
          </Link>
        </div>
      </div>

      {/* 2. HEADER */}
      <header className="sticky top-0 z-40 bg-[#0f172a]/95 backdrop-blur-xl border-b border-white/10 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <Link href="/deals" className="flex items-center gap-2.5 group">
            <div className="size-11 rounded-2xl bg-gradient-to-tr from-rose-600 to-orange-500 text-white flex items-center justify-center shadow-lg shadow-rose-900/40 group-hover:scale-105 transition-all">
              <Zap className="w-6 h-6 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="font-black text-2xl tracking-tight leading-none text-white">
                  Melio
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white px-1.5 py-0.5 rounded">
                  Mega Deals
                </span>
              </div>
              <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Đại Tiệc Ưu Đãi &amp; Giảm Giá</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link href="/back-to-school" className="hidden sm:inline-block text-xs font-bold text-slate-300 hover:text-white">
              🎒 Mùa Tựu Trường
            </Link>
            <Link href="/toys" className="hidden sm:inline-block text-xs font-bold text-slate-300 hover:text-white">
              🧸 Vương Quốc Đồ Chơi
            </Link>
            <button
              onClick={() => setCartOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-gradient-to-r from-rose-600 to-orange-500 text-white font-bold text-xs shadow-lg hover:scale-105 transition-all"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Giỏ hàng ({itemCount})</span>
            </button>
          </div>
        </div>
      </header>

      {/* 3. HERO BANNER */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-rose-950 via-slate-900 to-indigo-950 border border-rose-500/30 p-8 sm:p-14 shadow-2xl">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-96 h-96 bg-rose-600/20 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 bg-rose-600 text-white px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider animate-pulse">
              <Flame className="w-4 h-4 fill-white" /> ĐẠI TIỆC GIÁ SỐC
            </div>
            <h1 className="font-black text-3xl sm:text-6xl leading-[1.08] tracking-tight">
              Giờ Vàng Săn Deal <br />
              <span className="text-amber-400 font-black">
                Ưu Đãi Lên Tới 50%
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl">
              Hàng trăm đầu sách hay, dụng cụ học tập Thiên Long và đồ chơi LEGO chính hãng đang được trợ giá trực tiếp hôm nay.
            </p>

            {/* Live Timer Box */}
            <div className="pt-2 flex items-center gap-3">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1">
                <Clock3 className="w-4 h-4" /> Kết thúc sau:
              </span>
              <div className="flex items-center gap-1.5 font-mono font-black text-base text-amber-400">
                <span className="bg-black/60 px-2.5 py-1.5 rounded-xl border border-white/10">{String(countdown.h).padStart(2, "0")}h</span>:
                <span className="bg-black/60 px-2.5 py-1.5 rounded-xl border border-white/10">{String(countdown.m).padStart(2, "0")}m</span>:
                <span className="bg-black/60 px-2.5 py-1.5 rounded-xl border border-white/10">{String(countdown.s).padStart(2, "0")}s</span>
              </div>
            </div>
          </div>
        </section>

        {/* 4. VOUCHER MATRIX */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-xl text-white flex items-center gap-2">
              <TicketPercent className="w-5 h-5 text-rose-500" />
              <span>Kho Mã Giảm Giá Đang Mở</span>
            </h3>
            <span className="text-xs text-slate-400">Tự động áp dụng tại giỏ hàng</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {voucherHub.map((v) => (
              <div
                key={v.code}
                className="rounded-3xl bg-slate-900/80 border border-white/10 p-5 space-y-3 relative overflow-hidden shadow-lg hover:border-amber-400/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-gradient-to-r ${v.color} text-white shadow-xs`}>
                    {v.badge}
                  </span>
                  <TicketPercent className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-white">{v.title}</h4>
                  <p className="text-xs text-slate-400 mt-1">{v.condition}</p>
                </div>
                <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                  <span className="font-mono font-black text-xs text-amber-300 bg-black/40 px-2.5 py-1 rounded-lg">
                    {v.code}
                  </span>
                  <button
                    onClick={() => copyVoucher(v.code)}
                    className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-amber-950 font-black text-xs shadow transition-all hover:scale-105"
                  >
                    {copiedCode === v.code ? "Đã chép!" : "Lấy mã"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 5. HOT DEALS GRID */}
        <section className="rounded-3xl bg-slate-900/90 border border-white/10 p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-500">
                Sản Phẩm Đang Giảm Giá Sốc
              </span>
              <h2 className="text-2xl font-black text-white tracking-tight mt-0.5">
                Deal Hời Trong Ngày
              </h2>
            </div>
            <span className="text-xs text-amber-300 font-bold">100% Chính Hãng</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {products.map((p, idx) => {
              const v = p.variants[0];
              const discount = [40, 35, 30, 25, 50][idx % 5];
              return (
                <div
                  key={p.id}
                  className="rounded-3xl bg-slate-800/80 border border-white/10 p-4 flex flex-col justify-between hover:border-rose-500/80 transition-all group shadow-md"
                >
                  <div className="relative aspect-square rounded-2xl bg-black/40 p-4 flex flex-col items-center justify-center text-center">
                    <span className="absolute top-2 left-2 bg-rose-600 text-white font-black text-[10px] px-2 py-0.5 rounded-full">
                      -{discount}%
                    </span>
                    <Sparkles className="w-8 h-8 text-amber-400 group-hover:scale-110 transition-transform" />
                    <span className="mt-2 text-[10px] font-bold text-slate-400 uppercase">
                      {p.category.name}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    <h4 className="font-bold text-xs text-white line-clamp-2 min-h-8 group-hover:text-amber-300 transition-colors">
                      {p.name}
                    </h4>
                    <div className="flex items-baseline gap-2">
                      <b className="text-base font-black text-rose-400">
                        {v ? money(v.price) : "Liên hệ"}
                      </b>
                      <small className="text-[10px] text-slate-500 line-through">
                        {v ? money(Math.round(v.price * 1.4)) : ""}
                      </small>
                    </div>

                    <button
                      onClick={() => addToCart(p)}
                      className="w-full py-2 bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" /> Săn Ngay
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* CART DRAWER */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex justify-end">
          <aside className="w-full max-w-md bg-slate-900 text-white h-full shadow-2xl flex flex-col justify-between p-6 border-l border-white/10">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="font-black text-xl">Giỏ Hàng Ưu Đãi</h3>
              <button onClick={() => setCartOpen(false)} className="p-2 rounded-full hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {cart.map((l) => (
                <div key={l.variantId} className="p-3 rounded-2xl bg-slate-800 border border-white/10 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-xs line-clamp-1">{l.name}</h4>
                    <p className="text-xs font-black text-rose-400 mt-0.5">{money(l.price)} x {l.quantity}</p>
                  </div>
                  <span className="font-mono font-bold text-xs">{money(l.price * l.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-white/10 pt-4 space-y-3">
              <div className="flex justify-between font-black text-base">
                <span>Tổng tạm tính:</span>
                <span className="text-amber-400">{money(cart.reduce((s, l) => s + l.quantity * l.price, 0))}</span>
              </div>
              <Link
                href="/shop"
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-orange-500 text-white font-black text-center text-xs flex items-center justify-center gap-2 shadow-xl"
              >
                Tiến Hành Thanh Toán COD <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </aside>
        </div>
      )}

      {/* FLOATING TOAST */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-white text-slate-900 px-5 py-3 rounded-2xl shadow-2xl text-xs font-black flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-rose-600" />
          <span>{toast}</span>
        </div>
      )}
    </main>
  );
}
