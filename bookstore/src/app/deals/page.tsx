"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Sparkles, TicketPercent, X, Zap, ShoppingBag, Clock3 } from "lucide-react";
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
  image?: string | null;
  variants: Variant[];
};
type Catalog = { products: Product[]; categories: { id: string; name: string }[]; stores: { id: string; name: string; code: string }[]; storeId: string };

// Voucher list mirrors the shop VoucherHub — codes only, no invented discounts;
// the value each customer actually receives is computed by the promotion
// engine at checkout.
const voucherHub = [
  { code: "MELIODEAL50", title: "Giảm 50.000 ₫", condition: "Cho đơn mua sắm từ 500k" },
  { code: "FREESHIPMAX", title: "Miễn Phí Vận Chuyển", condition: "Toàn quốc không giới hạn số lượng" },
  { code: "BACK2SCHOOL", title: "Giảm 15% Dụng Cụ Học Tập", condition: "Áp dụng cho vở viết, bút Thiên Long" },
  { code: "TOYFEST20", title: "Giảm 20.000 ₫ Đồ Chơi", condition: "Đơn đồ chơi LEGO & Sanrio từ 250k" },
];

function money(v: number) {
  return `${v.toLocaleString("vi-VN")} ₫`;
}

export default function DealsPage() {
  const { cart, addItem, itemCount, subtotal } = useCart();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Real midnight deadline, same as the shop page — no looping fake timer.
  const [countdown, setCountdown] = useState({ h: 0, m: 0, s: 0 });

  useEffect(() => {
    const timer = setInterval(() => {
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Ho_Chi_Minh", hour12: false,
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
      const now = new Date();
      const get = (type: string) => Number(fmt.formatToParts(now).find((p) => p.type === type)?.value ?? 0);
      const total = 86_400 - ((get("hour") % 24) * 3600 + get("minute") * 60 + get("second"));
      setCountdown({ h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 });
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
    showToast(`🎟️ Đã chép mã "${code}" — dán vào ô mã giảm giá khi thanh toán`);
    setTimeout(() => setCopiedCode(null), 2500);
  }

  /** Adds through the shared CartContext so availability clamps, freeship
   *  progress and the 409 race-recovery all behave identically to /shop. */
  function addToCart(p: Product) {
    const v = p.variants[0];
    if (!v || v.available <= 0) return;
    addItem({
      variantId: v.id, productId: p.id, name: p.name,
      category: p.category.name, price: v.price, available: v.available,
    });
    showToast(`Đã thêm "${p.name}" vào giỏ hàng!`);
    setCartOpen(true);
  }

  const products = catalog?.products ?? [];

  return (
    <main className="min-h-screen bg-[#faf7f2] text-slate-900 pb-24 font-sans selection:bg-[#8c2d19] selection:text-white">
      {/* 1. TOP TICKER */}
      <div className="bg-gradient-to-r from-[#8c2d19] via-[#a63a1f] to-[#8c2d19] text-white px-4 py-2 text-xs font-bold shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="bg-white text-[#8c2d19] px-2.5 py-0.5 rounded-full text-[10px] uppercase font-black tracking-wider">
              GIỜ VÀNG HÀNG NGÀY
            </span>
            <span>Ưu đãi trình bày mỗi ngày cho Sách, VPP &amp; Đồ chơi — theo tồn kho thực tế</span>
          </div>
          <Link href="/shop" className="hover:text-[#ffd56a] hidden sm:inline text-[11px] font-bold">
            ← Về Cửa Hàng Chính
          </Link>
        </div>
      </div>

      {/* 2. HEADER */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-[#ede5d8] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <Link href="/deals" className="flex items-center gap-2.5 group">
            <div className="size-11 rounded-2xl bg-gradient-to-tr from-[#8c2d19] to-[#d97706] text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-all">
              <Zap className="w-6 h-6 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-serif font-black text-2xl tracking-tight leading-none text-slate-900">
                  Melio
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider bg-[#1c1917] text-[#ffd56a] px-2 py-0.5 rounded-full">
                  Mega Deals
                </span>
              </div>
              <p className="text-[10px] text-[#8c2d19] font-bold uppercase tracking-wider">Đại Tiệc Ưu Đãi &amp; Giảm Giá</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link href="/back-to-school" className="hidden sm:inline-block text-xs font-bold text-slate-600 hover:text-[#8c2d19]">
              🎒 Mùa Tựu Trường
            </Link>
            <Link href="/toys" className="hidden sm:inline-block text-xs font-bold text-slate-600 hover:text-[#8c2d19]">
              🧸 Vương Quốc Đồ Chơi
            </Link>
            <button
              onClick={() => setCartOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Giỏ hàng ({itemCount})</span>
            </button>
          </div>
        </div>
      </header>

      {/* 3. HERO BANNER */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#8c2d19] via-[#a63a1f] to-[#d97706] border border-[#e8dac5] p-8 sm:p-14 shadow-xl text-white">
          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 bg-white text-[#8c2d19] px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider shadow-md">
              <Clock3 className="w-4 h-4" /> ƯU ĐÃI TRONG HÔM NAY
            </div>
            <h1 className="font-serif font-black text-3xl sm:text-6xl leading-[1.08] tracking-tight">
              Giờ Vàng Săn Deal <br />
              <span className="text-[#ffd56a]">
                Trị Giá Lên Tới 50%
              </span>
            </h1>
            <p className="text-sm sm:text-base text-white/95 leading-relaxed max-w-xl font-medium">
              Hàng trăm đầu sách hay, dụng cụ học tập Thiên Long và đồ chơi LEGO chính hãng đang được trợ giá trực tiếp hôm nay.
            </p>

            {/* Real midnight timer */}
            <div className="pt-2 flex items-center gap-3">
              <span className="text-xs font-bold text-[#ffd56a] flex items-center gap-1">
                <Clock3 className="w-4 h-4" /> Kết thúc sau:
              </span>
              <div className="flex items-center gap-1.5 font-mono font-black text-base text-[#6b2113]" role="timer" aria-label="Đếm ngược kết thúc giờ vàng">
                <span className="bg-white px-2.5 py-1.5 rounded-xl shadow-md">{String(countdown.h).padStart(2, "0")}h</span>:
                <span className="bg-white px-2.5 py-1.5 rounded-xl shadow-md">{String(countdown.m).padStart(2, "0")}m</span>:
                <span className="bg-white px-2.5 py-1.5 rounded-xl shadow-md">{String(countdown.s).padStart(2, "0")}s</span>
              </div>
            </div>
          </div>
        </section>

        {/* 4. VOUCHER MATRIX */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif font-black text-xl text-slate-900 flex items-center gap-2">
              <TicketPercent className="w-5 h-5 text-[#8c2d19]" />
              <span>Kho Mã Giảm Giá Đang Mở</span>
            </h3>
            <span className="text-xs text-slate-500 font-medium">Sao chép và dán tại bước thanh toán</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {voucherHub.map((v) => (
              <div
                key={v.code}
                className="rounded-3xl bg-white border border-[#ede5d8] p-5 space-y-3 shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all"
              >
                <div className="flex items-center justify-between">
                  <TicketPercent className="w-4 h-4 text-[#d97706]" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-900">{v.title}</h4>
                  <p className="text-xs text-slate-500 mt-1 font-medium">{v.condition}</p>
                </div>
                <div className="pt-2 border-t border-[#f3ece1] flex items-center justify-between">
                  <span className="font-mono font-black text-xs text-[#8c2d19] bg-[#faf4ea] border border-[#e8dac5] px-2.5 py-1 rounded-xl">
                    {v.code}
                  </span>
                  <button
                    onClick={() => copyVoucher(v.code)}
                    className="px-3.5 py-1.5 rounded-xl bg-[#1c1917] hover:bg-[#8c2d19] text-white font-black text-xs transition-all cursor-pointer"
                  >
                    {copiedCode === v.code ? "Đã chép!" : "Lấy mã"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 5. DEALS GRID — real prices only, no fabricated strike-throughs */}
        <section className="rounded-3xl bg-white border border-[#ede5d8] p-6 sm:p-8 space-y-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#f3ece1] pb-4">
            <div>
              <span className="text-[11px] font-black uppercase tracking-widest text-[#8c2d19]">
                Sản Phẩm Đang Được Trị Giá
              </span>
              <h2 className="text-2xl font-serif font-black text-slate-900 tracking-tight mt-0.5">
                Deal Hời Trong Ngày
              </h2>
            </div>
            <span className="text-xs text-[#14532d] font-bold bg-[#dcfce7] px-2.5 py-1 rounded-full">100% Chính Hãng</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {products.map((p) => {
              const v = p.variants[0];
              const isAvailable = Boolean(v && v.available > 0);
              return (
                <div
                  key={p.id}
                  className="rounded-3xl bg-white border border-[#ede5d8] p-4 flex flex-col justify-between hover:border-[#e8dac5] hover:shadow-xl transition-all duration-300 group shadow-xs hover:-translate-y-1.5 relative"
                >
                  <div className="relative">
                    <ProductCover
                      id={p.id}
                      name={p.name}
                      categoryName={p.category.name}
                      authorName={p.author?.name}
                      image={p.image ?? null}
                    />
                  </div>

                  <div className="mt-3 space-y-2">
                    <h4 className="font-bold text-xs text-slate-900 line-clamp-2 min-h-8 group-hover:text-[#8c2d19] transition-colors">
                      {p.name}
                    </h4>
                    <div className="flex items-baseline gap-2">
                      <b className="text-base font-black text-[#8c2d19]">
                        {v ? money(v.price) : "Liên hệ"}
                      </b>
                      {v && v.available > 0 && v.available <= 5 && (
                        <small className="text-[11px] text-amber-700 font-bold">Chỉ còn {v.available}</small>
                      )}
                    </div>

                    <button
                      onClick={() => addToCart(p)}
                      disabled={!isAvailable}
                      className="w-full py-2.5 bg-[#1c1917] hover:bg-[#8c2d19] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" /> {isAvailable ? "Săn Ngay" : "Tạm Hết"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* CART DRAWER — reads the shared cart; checkout lives on /shop where the
          full checkout modal + coupon preview run. */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Giỏ hàng ưu đãi"
            className="w-full max-w-md bg-[#fbf9f5] text-slate-900 h-full shadow-2xl flex flex-col justify-between p-6 border-l border-[#ede5d8] font-serif"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#ede5d8] pb-4">
              <h3 className="font-black text-xl text-slate-900">Giỏ Hàng Ưu Đãi</h3>
              <button onClick={() => setCartOpen(false)} className="p-2 rounded-full hover:bg-[#ede5d8] text-slate-500 cursor-pointer" aria-label="Đóng giỏ hàng">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {cart.length === 0 && (
                <p className="text-center text-xs text-slate-400 py-8">Chưa có deal nào trong giỏ — thêm ngay thôi!</p>
              )}
              {cart.map((l) => (
                <div key={l.variantId} className="p-3 rounded-2xl bg-white border border-[#ede5d8] flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-xs text-slate-900 line-clamp-1">{l.name}</h4>
                    <p className="text-xs font-black text-[#8c2d19] mt-0.5">{money(l.price)} × {l.quantity}</p>
                  </div>
                  <span className="font-mono font-bold text-xs text-slate-800">{money(l.price * l.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-[#ede5d8] pt-4 space-y-3">
              <div className="flex justify-between font-black text-base text-slate-900">
                <span>Tổng tạm tính:</span>
                <span className="text-[#8c2d19]">{money(subtotal)}</span>
              </div>
              <Link
                href="/shop"
                className="w-full py-3.5 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] text-white font-black text-center text-xs flex items-center justify-center gap-2 shadow-xl transition-colors"
              >
                Đến Trang Thanh Toán <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </aside>
        </div>
      )}

      {/* FLOATING TOAST */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-white text-slate-900 px-5 py-3 rounded-2xl shadow-2xl text-xs font-black flex items-center gap-2 border border-[#ede5d8]">
          <Sparkles className="w-4 h-4 text-[#8c2d19]" />
          <span>{toast}</span>
        </div>
      )}
    </main>
  );
}
