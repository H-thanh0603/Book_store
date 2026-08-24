// Section 9: BOOK OF THE MONTH SPOTLIGHT SPREAD
import { Award, BookOpen, ShoppingBag, Star } from "lucide-react";
import type { Product } from "./types";

export default function BookOfMonth({
  product,
  money,
  onAddToCart,
  onFlipbook,
}: {
  product: Product;
  money: (v: number) => string;
  onAddToCart: (p: Product) => void;
  onFlipbook: (p: Product) => void;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#241c17] via-[#1a1512] to-[#120f0d] text-white p-8 sm:p-14 shadow-2xl border border-white/10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* 3D Book Jacket (5 cols) */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="w-56 sm:w-64 book-shadow animate-float p-6 rounded-2xl bg-gradient-to-tr from-amber-900 via-rose-950 to-slate-900 border border-white/20 text-white flex flex-col justify-between aspect-[4/5] relative">
            <div className="bookmark-ribbon" />
            <div className="border-b border-white/20 pb-2 flex justify-between text-[10px] uppercase font-mono tracking-widest text-amber-200">
              <span>{product.category.name}</span>
              <span>BẢN ĐẶC BIỆT</span>
            </div>
            <h3 className="font-serif font-black text-xl sm:text-2xl my-auto line-clamp-3 text-amber-100">
              {product.name}
            </h3>
            <div className="border-t border-white/20 pt-2 text-[10px] font-serif italic text-slate-300">
              ✍️ {product.author?.name ?? product.publisher?.name ?? "Melio Press"}
            </div>
          </div>
        </div>

        {/* Story (7 cols) */}
        <div className="lg:col-span-7 space-y-4 font-serif">
          <div className="inline-flex items-center gap-2 bg-[#8c2d19] text-white px-3.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-bold">
            <Award className="w-3.5 h-3.5" /> Tác Phẩm Tiêu Điểm Trong Tháng
          </div>

          <h2 className="font-black text-2xl sm:text-4xl leading-tight text-white">{product.name}</h2>

          <p className="text-xs sm:text-sm text-slate-300 italic leading-relaxed">
            &ldquo;{product.description ?? "Một tác phẩm mang tính biểu tượng, khai mở những góc nhìn sâu sắc về nhân loại và thế giới nội tâm con người."}&rdquo;
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
              onClick={() => onAddToCart(product)}
              disabled={!product.variants[0]?.available}
              className="px-6 py-3.5 rounded-full bg-[#8c2d19] hover:bg-[#a33721] disabled:bg-slate-600 text-white font-bold text-xs sm:text-sm shadow-xl transition-all hover:scale-105 flex items-center gap-2"
            >
              <ShoppingBag className="w-4 h-4" />
              {product.variants[0]?.available
                ? `Đặt Mua Ấn Bản ${money(product.variants[0].price)}`
                : "Tạm Hết Ấn Bản"}
            </button>
            <button
              onClick={() => onFlipbook(product)}
              className="px-5 py-3.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm backdrop-blur-md transition-colors flex items-center gap-2"
            >
              <BookOpen className="w-4 h-4" /> Đọc thử 3D lật trang
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
