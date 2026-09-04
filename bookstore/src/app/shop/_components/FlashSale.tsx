// Section 5: FLASH SALE "GIỜ VÀNG GIÁ SỐC" — heritage edition.
// Honest pricing only: the strike-through and sold bars were removed because
// they were fabricated from index-based arrays (P0 trust fix). The countdown
// is the real midnight deadline owned by useStorefront.
import Link from "next/link";
import { ArrowRight, Clock3, Flame, ShoppingBag } from "lucide-react";
import type { Product } from "./types";
import ProductCover from "./ProductCover";

export default function FlashSale({
  products,
  countdown,
  activeStoreName,
  money,
  onAddToCart,
}: {
  products: Product[];
  countdown: { hours: number; minutes: number; seconds: number };
  activeStoreName: string;
  money: (v: number) => string;
  onAddToCart: (p: Product) => void;
}) {
  return (
    <section id="flash-sale" className="rounded-3xl bg-gradient-to-br from-[#8c2d19] via-[#a63a1f] to-[#6b2113] p-6 sm:p-10 text-white shadow-xl space-y-6 border border-[#e8dac5] relative overflow-hidden">
      {/* Ambient paper glow */}
      <div className="absolute top-0 right-0 -mt-16 -mr-16 size-96 bg-[#d97706]/20 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/20 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="size-12 rounded-2xl bg-[#faf4ea] text-[#8c2d19] flex items-center justify-center shadow-lg shadow-black/10">
            <Flame className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif font-black text-2xl sm:text-3xl text-white tracking-tight">
                Giờ Vàng Săn Sách &amp; Quà Tặng
              </h2>
              <span className="bg-[#ffd56a] text-[#6b2113] text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full">
                Đến Nửa Đêm
              </span>
            </div>
            <p className="text-xs text-[#f3e5d0] mt-0.5 font-semibold">
              Ưu đãi trình bày tại <b>{activeStoreName}</b> — cập nhật theo tồn kho thực tế
            </p>
          </div>
        </div>

        {/* Live Digital Clock */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/15 px-4 py-2.5 rounded-2xl border border-white/25">
            <span className="text-xs text-white font-black flex items-center gap-1.5">
              <Clock3 className="w-4 h-4 text-[#ffd56a]" />
              Kết thúc sau:
            </span>
            <div className="flex items-center gap-1 font-mono font-black text-sm text-[#6b2113]" role="timer" aria-label="Đếm ngược kết thúc flash sale">
              <span className="bg-white px-2.5 py-1 rounded-xl">
                {String(countdown.hours).padStart(2, "0")}h
              </span>
              :
              <span className="bg-white px-2.5 py-1 rounded-xl">
                {String(countdown.minutes).padStart(2, "0")}m
              </span>
              :
              <span className="bg-white px-2.5 py-1 rounded-xl">
                {String(countdown.seconds).padStart(2, "0")}s
              </span>
            </div>
          </div>

          <Link
            href="/deals"
            className="hidden lg:inline-flex items-center gap-1 px-4 py-2.5 rounded-2xl bg-white text-[#8c2d19] hover:bg-[#ffd56a] hover:text-[#6b2113] text-xs font-bold transition-all shadow-md"
          >
            <span>Tất cả deal</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Flash Deals Cards Grid */}
      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {products.slice(0, 5).map((product) => {
          const variant = product.variants[0];
          const isAvailable = Boolean(variant && variant.available > 0);

          return (
            <div
              key={product.id}
              className="bg-white text-slate-900 rounded-3xl p-4 flex flex-col justify-between transition-all duration-300 group hover:-translate-y-1.5 hover:shadow-2xl shadow-md relative"
            >
              {/* Cover Preview */}
              <div className="relative cursor-pointer">
                <ProductCover
                  id={product.id}
                  name={product.name}
                  categoryName={product.category.name}
                  authorName={product.author?.name}
                  image={product.image ?? null}
                />
              </div>

              {/* Card Details */}
              <div className="mt-3 flex-1 flex flex-col justify-between space-y-2.5">
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-slate-900 line-clamp-2 min-h-10 group-hover:text-[#8c2d19] transition-colors">
                    {product.name}
                  </h4>
                  <div className="mt-1 flex items-baseline gap-2">
                    <b className="text-base font-black text-[#8c2d19]">
                      {variant ? money(variant.price) : "Liên hệ"}
                    </b>
                    {variant && variant.available > 0 && variant.available <= 5 && (
                      <span className="text-[11px] text-amber-700 font-bold">Chỉ còn {variant.available}</span>
                    )}
                  </div>
                </div>

                {/* Săn Ngay Button */}
                <button
                  onClick={() => onAddToCart(product)}
                  disabled={!isAvailable}
                  className="w-full py-2.5 bg-[#1c1917] hover:bg-[#8c2d19] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs rounded-2xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-95"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>{isAvailable ? "Săn Deal Ngay" : "Tạm Hết Hàng"}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
