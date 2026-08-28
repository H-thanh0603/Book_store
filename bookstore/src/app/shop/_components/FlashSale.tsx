// Section 5: FLASH SALE "GIỜ VÀNG GIÁ SỐC"
import { Clock3, Flame, ShoppingBag, Sparkles } from "lucide-react";
import type { Product } from "./types";

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
    <section id="flash-sale" className="rounded-3xl bg-[#1c1917] p-6 sm:p-10 text-white shadow-2xl space-y-6 border border-white/10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-2xl bg-[#c83f49] text-white flex items-center justify-center shadow-lg shadow-rose-900/40 animate-pulse">
            <Flame className="w-6 h-6 fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif font-black text-2xl text-white tracking-tight">Giờ Vàng Săn Sách &amp; Đồ Chơi</h2>
              <span className="bg-amber-400 text-amber-950 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                Flash Deals
              </span>
            </div>
            <p className="text-xs text-slate-400 font-serif mt-0.5">
              Đồng loạt trợ giá các ấn phẩm hay và dụng cụ học tập tại <b>{activeStoreName}</b>
            </p>
          </div>
        </div>

        {/* Live Clock */}
        <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10">
          <span className="text-xs text-slate-300 font-serif flex items-center gap-1">
            <Clock3 className="w-3.5 h-3.5 text-amber-400" /> Kết thúc sau:
          </span>
          <div className="flex items-center gap-1 font-mono font-black text-sm text-amber-300" role="timer" aria-label="Đếm ngược kết thúc flash sale">
            <span className="bg-slate-800 px-2 py-1 rounded-lg">{String(countdown.hours).padStart(2, "0")}</span>:
            <span className="bg-slate-800 px-2 py-1 rounded-lg">{String(countdown.minutes).padStart(2, "0")}</span>:
            <span className="bg-slate-800 px-2 py-1 rounded-lg">{String(countdown.seconds).padStart(2, "0")}</span>
          </div>
        </div>
      </div>

      {/* Flash Deals Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {products.slice(0, 5).map((product) => {
          const variant = product.variants[0];
          return (
            <div
              key={product.id}
              className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-3xl p-4 flex flex-col justify-between transition-all group"
            >
              <div className="relative aspect-square rounded-2xl bg-black/40 p-4 flex flex-col items-center justify-center text-center">
                <span className="absolute top-2 left-2 bg-[#c83f49] text-white font-black text-[10px] px-2 py-0.5 rounded-full shadow-md">
                  Deal hôm nay
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
                  </div>
                </div>

                <div className="flex justify-between text-[10px] text-slate-400 font-serif font-semibold">
                  <span>{variant?.available ? "Còn hàng" : "Tạm hết"}</span>
                  <span className="text-amber-300 font-bold">Kết thúc 24:00 hôm nay</span>
                </div>

                <button
                  onClick={() => onAddToCart(product)}
                  disabled={!variant?.available}
                  className="w-full py-2.5 bg-[#c83f49] hover:bg-[#b33640] disabled:bg-[#574431] disabled:text-[#a8a29e] text-white font-serif font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                >
                  <ShoppingBag className="w-3.5 h-3.5" /> {variant?.available ? "Săn Deal Ngay" : "Hết Deal"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
