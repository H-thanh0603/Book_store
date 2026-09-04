// Section 9: BOOK OF THE MONTH SPOTLIGHT SPREAD
import { Award, BookOpen, ShoppingBag, Star } from "lucide-react";
import type { Product } from "./types";
import ProductCover from "./ProductCover";

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
  const variant = product.variants[0];
  const isAvailable = Boolean(variant && variant.available > 0);

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#8c2d19] via-[#a63a1f] to-[#d97706] text-white p-8 sm:p-14 shadow-xl border border-[#e8dac5]">
      {/* Ambient Glows */}
      <div className="absolute top-0 right-0 -mt-16 -mr-16 size-96 bg-white/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 -mb-16 size-80 bg-yellow-300/25 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* 3D Book Jacket (5 cols) */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="w-56 sm:w-64 book-shadow animate-float aspect-[3/4] relative">
            <ProductCover
              id={product.id}
              name={product.name}
              categoryName={product.category.name}
              authorName={product.author?.name}
              image={product.image ?? null}
            />
            {/* Floating Review Badge */}
            <div className="absolute -bottom-3 -right-3 bg-white text-slate-900 px-3 py-1.5 rounded-2xl shadow-xl flex items-center gap-1.5 text-xs font-black">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>4.9 / 5.0</span>
            </div>
          </div>
        </div>

        {/* Story & Details (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="inline-flex items-center gap-2 bg-amber-400 text-amber-950 px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider shadow-sm">
            <Award className="w-4 h-4" /> TÁC PHẨM TIÊU ĐIỂM TRONG THÁNG
          </div>

          <h2 className="font-serif font-black text-3xl sm:text-5xl leading-tight text-white drop-shadow-sm">
            {product.name}
          </h2>

          <p className="text-sm sm:text-base text-rose-100 font-serif italic leading-relaxed max-w-xl">
            &ldquo;{product.description ?? "Một tác phẩm kinh điển mang tính biểu tượng của văn học Việt Nam, khơi gợi những miền ký ức tuổi thơ trong trẻo, thuần khiết và ngập tràn tình yêu thương."}&rdquo;
          </p>

          {/* Acclaim score */}
          <div className="flex items-center gap-3 py-1 text-xs text-amber-300 font-bold">
            <div className="flex text-amber-400">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-amber-400" />
              ))}
            </div>
            <span>Bình chọn bởi hơn 10.000 độc giả Melio</span>
          </div>

          {/* Actions */}
          <div className="pt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={() => onAddToCart(product)}
              disabled={!isAvailable}
              className="px-6 py-3.5 rounded-2xl bg-[#ffd56a] hover:bg-[#f3e5d0] disabled:bg-slate-700 text-[#6b2113] font-black text-xs sm:text-sm shadow-xl transition-all hover:scale-105 flex items-center gap-2 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              {isAvailable
                ? `Đặt Mua Ấn Bản ${money(variant!.price)}`
                : "Tạm Hết Hàng"}
            </button>
            <button
              onClick={() => onFlipbook(product)}
              className="px-5 py-3.5 rounded-2xl bg-white/15 hover:bg-white/25 text-white text-xs sm:text-sm font-bold backdrop-blur-md border border-white/20 transition-all hover:scale-105 flex items-center gap-2 cursor-pointer"
            >
              <BookOpen className="w-4 h-4 text-amber-300" />
              <span>Đọc thử 3D lật trang</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

