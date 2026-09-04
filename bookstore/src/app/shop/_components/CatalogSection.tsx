// Section 10: FULL CATALOG WITH FACETED FILTERS, SORTING & VIEW MODES
import {
  BookOpen, Grid3X3, Heart, LayoutGrid, List, Plus, RotateCcw, ShoppingBag, SlidersHorizontal,
} from "lucide-react";
import type { Product } from "./types";
import ProductCover from "./ProductCover";

type ViewMode = "grid5" | "grid3" | "list";

const PRICE_RANGES = [
  { id: "all", label: "Tất cả" },
  { id: "under100", label: "Dưới 100k" },
  { id: "100to250", label: "100k–250k" },
  { id: "250to500", label: "250k–500k" },
  { id: "above500", label: "Trên 500k" },
] as const;

export default function CatalogSection({
  products, allCount, categories, query, categoryId, activeDepartment, activeStoreName,
  wishlist, loading, error, hasActiveFilters,
  sortBy, onSortBy, viewMode, onViewMode, priceRange, onPriceRange,
  onlyInStock, onOnlyInStock,
  onCategory, onResetFilters, onQuickView, onShelfFinder, onFlipbook,
  onToggleFavorite, onAddToCart,
}: {
  products: Product[];
  allCount: number;
  categories: { id: string; name: string }[];
  query: string;
  categoryId: string;
  activeDepartment: string;
  activeStoreName: string;
  wishlist: string[];
  loading: boolean;
  error: string;
  hasActiveFilters: boolean;
  sortBy: string;
  onSortBy: (v: "popular" | "price_asc" | "price_desc" | "name_asc" | "newest") => void;
  viewMode: ViewMode;
  onViewMode: (v: ViewMode) => void;
  priceRange: string;
  onPriceRange: (v: (typeof PRICE_RANGES)[number]["id"]) => void;
  onlyInStock: boolean;
  onOnlyInStock: (v: boolean) => void;
  onCategory: (id: string) => void;
  onResetFilters: () => void;
  onQuickView: (p: Product) => void;
  onShelfFinder: (p: Product) => void;
  onFlipbook: (p: Product) => void;
  onToggleFavorite: (id: string) => void;
  onAddToCart: (p: Product) => void;
}) {
  const money = (v: number) => `${v.toLocaleString("vi-VN")} ₫`;

  return (
    <section id="catalog" className="scroll-mt-24 rounded-3xl bg-white p-6 sm:p-10 border border-[#ede5d8] shadow-xs space-y-6">
      {/* Header & Title */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-[#ede5d8]">
        <div>
          <span className="text-[11px] uppercase tracking-widest text-[#8c2d19] font-black">
            KHO HÀNG TUYỂN CHỌN
          </span>
          <h2 className="mt-1 font-serif font-black text-2xl sm:text-3xl text-slate-900 tracking-tight">
            {query
              ? `Kết quả tìm kiếm cho "${query}"`
              : categoryId
              ? categories.find((c) => c.id === categoryId)?.name
              : activeDepartment !== "all"
              ? `Ngành Hàng: ${activeDepartment}`
              : "Toàn Bộ Sản Phẩm Đang Mở Bán"}
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Hiển thị {products.length} sản phẩm sẵn sàng giao nhanh tại <b>{activeStoreName}</b>
          </p>
        </div>

        {/* View Mode & Sort Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 bg-[#faf4ea] px-3.5 py-2 rounded-2xl border border-[#ede5d8] text-xs font-semibold">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#8c2d19]" />
            <select
              value={sortBy}
              onChange={(e) => onSortBy(e.target.value as Parameters<typeof onSortBy>[0])}
              aria-label="Sắp xếp sản phẩm"
              className="bg-transparent text-slate-800 font-bold outline-none cursor-pointer text-xs"
            >
              <option value="popular">Phổ biến &amp; Bán chạy</option>
              <option value="price_asc">Giá: Thấp đến Cao</option>
              <option value="price_desc">Giá: Cao đến Thấp</option>
              <option value="name_asc">Tên: A - Z</option>
              <option value="newest">Mới nhất</option>
            </select>
          </div>

          <div className="flex items-center bg-[#faf4ea] p-1 rounded-2xl border border-[#ede5d8]">
            {([
              ["grid5", Grid3X3, "Lưới tiêu chuẩn 5 cột"],
              ["grid3", LayoutGrid, "Lưới lớn 3 cột"],
              ["list", List, "Danh sách chi tiết"],
            ] as const).map(([mode, Icon, title]) => (
              <button
                key={mode}
                onClick={() => onViewMode(mode)}
                aria-label={title}
                title={title}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                  viewMode === mode
                    ? "bg-white text-[#8c2d19] shadow-xs font-black scale-105"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Secondary Filter Chips */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => onCategory("")}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
              !categoryId
                ? "bg-[#1c1917] text-[#ffd56a] shadow-md"
                : "bg-[#faf4ea] hover:bg-[#ede5d8] text-slate-700 border border-[#ede5d8]"
            }`}
          >
            Tất cả ({allCount})
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => onCategory(c.id)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
                categoryId === c.id
                  ? "bg-[#1c1917] text-[#ffd56a] shadow-md font-black"
                  : "bg-[#faf4ea] hover:bg-[#ede5d8] text-slate-700 border border-[#ede5d8]"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Price & Stock quick filter bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#f3ece1] text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-slate-500 font-bold">Mức giá:</span>
            {PRICE_RANGES.map((pr) => (
              <button
                key={pr.id}
                onClick={() => onPriceRange(pr.id)}
                className={`px-3 py-1.5 rounded-xl transition-all font-semibold cursor-pointer ${
                  priceRange === pr.id
                    ? "bg-[#8c2d19] text-white font-black shadow-xs"
                    : "bg-[#faf4ea] text-slate-700 hover:bg-[#ede5d8] border border-[#ede5d8]"
                }`}
              >
                {pr.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-slate-700 select-none font-medium">
              <input
                type="checkbox"
                checked={onlyInStock}
                onChange={(e) => onOnlyInStock(e.target.checked)}
                className="size-4 rounded accent-[#8c2d19] cursor-pointer"
              />
              <span>Chỉ hiện có sẵn</span>
            </label>

            {hasActiveFilters && (
              <button
                onClick={onResetFilters}
                className="text-[#8c2d19] hover:underline flex items-center gap-1 font-bold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Xóa bộ lọc
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold whitespace-pre-line">
          {error}
        </div>
      )}

      {/* Skeletons or Product Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 py-6">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="h-80 rounded-3xl bg-[#faf7f2] animate-pulse border border-[#ede5d8]" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState onReset={onResetFilters} />
      ) : viewMode === "list" ? (
        /* LIST VIEW MODE */
        <div className="space-y-4">
          {products.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              isFav={wishlist.includes(product.id)}
              money={money}
              onQuickView={onQuickView}
              onShelfFinder={onShelfFinder}
              onFlipbook={onFlipbook}
              onToggleFavorite={onToggleFavorite}
              onAddToCart={onAddToCart}
            />
          ))}
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
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              isFav={wishlist.includes(product.id)}
              money={money}
              onQuickView={onQuickView}
              onToggleFavorite={onToggleFavorite}
              onAddToCart={onAddToCart}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="py-16 text-center space-y-3 font-serif">
      <BookOpen className="w-12 h-12 mx-auto text-slate-300" />
      <h3 className="text-base font-bold text-slate-800">Không tìm thấy sản phẩm phù hợp với bộ lọc</h3>
      <p className="text-xs text-slate-500">Hãy thử chọn lại mức giá hoặc danh mục khác để tìm kiếm nhé.</p>
      <button onClick={onReset} className="px-4 py-2 rounded-xl bg-[#1c1917] text-white text-xs font-bold">
        Đặt lại bộ lọc
      </button>
    </div>
  );
}

/** LIST VIEW row */
function ProductRow({
  product, isFav, money, onQuickView, onShelfFinder, onFlipbook, onToggleFavorite, onAddToCart,
}: {
  product: Product;
  isFav: boolean;
  money: (v: number) => string;
  onQuickView: (p: Product) => void;
  onShelfFinder: (p: Product) => void;
  onFlipbook: (p: Product) => void;
  onToggleFavorite: (id: string) => void;
  onAddToCart: (p: Product) => void;
}) {
  const variant = product.variants[0];
  const isAvailable = Boolean(variant && variant.available > 0);
  return (
    <article className="p-5 rounded-3xl bg-white border border-[#ede5d8] shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-6 group">
      <div className="flex items-start sm:items-center gap-4">
        {/* Cover preview */}
        <button onClick={() => onQuickView(product)} className="shrink-0 cursor-pointer text-left w-24" aria-label={`Xem nhanh ${product.name}`}>
          <ProductCover
            id={product.id}
            name={product.name}
            categoryName={product.category.name}
            image={product.image ?? null}
          />
        </button>

        {/* Details */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-[#8c2d19] font-bold bg-[#faf4ea] px-2 py-0.5 rounded-full">
              {product.brand?.name ?? product.category.name}
            </span>
            <span className={`font-mono text-[11px] ${isAvailable ? "text-[#14532d] font-bold" : "text-[#8c2d19] font-bold"}`}>
              {isAvailable ? `Còn ${variant!.available} sp` : "Tạm hết"}
            </span>
          </div>

          <h3
            onClick={() => onQuickView(product)}
            className="font-bold text-base sm:text-lg text-slate-900 line-clamp-1 cursor-pointer group-hover:text-[#8c2d19] transition-colors"
          >
            {product.name}
          </h3>

          <p className="text-xs text-slate-500 italic line-clamp-1">
            {product.author?.name ?? product.brand?.name ?? product.publisher?.name ?? "Melio"}
          </p>

          <div className="flex items-center gap-3 pt-1 text-xs">
            <button onClick={() => onShelfFinder(product)} className="text-slate-600 hover:text-slate-950 flex items-center gap-1 font-medium cursor-pointer">
              📍 Vị trí kệ sách
            </button>
            <button onClick={() => onFlipbook(product)} className="text-[#8c2d19] hover:underline flex items-center gap-1 font-bold cursor-pointer">
              📖 Đọc thử 3D
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-6 pt-3 sm:pt-0 border-t sm:border-t-0 border-[#f3ece1]">
        <div className="text-left sm:text-right">
          <b className="text-lg font-black text-slate-900 block">
            {variant ? money(variant.price) : "Liên hệ"}
          </b>
          <span className="text-[11px] text-slate-400 font-medium">Giá niêm yết</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggleFavorite(product.id)}
            aria-label={isFav ? `Bỏ yêu thích ${product.name}` : `Lưu ${product.name} vào tủ sách`}
            aria-pressed={isFav}
            className={`size-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
              isFav ? "bg-[#8c2d19] text-white shadow-md" : "bg-[#faf4ea] hover:bg-[#ede5d8] hover:text-[#8c2d19] text-slate-600 border border-[#ede5d8]"
            }`}
          >
            <Heart className={`w-4 h-4 ${isFav ? "fill-white" : ""}`} />
          </button>

          {/* Buy button */}
          <button
            onClick={() => onAddToCart(product)}
            disabled={!isAvailable}
            className="px-5 py-3 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <ShoppingBag className="w-4 h-4" /> {isAvailable ? "Thêm vào giỏ" : "Hết hàng"}
          </button>
        </div>
      </div>
    </article>
  );
}

/** GRID VIEW card */
function ProductCard({
  product, isFav, money, onQuickView, onToggleFavorite, onAddToCart,
}: {
  product: Product;
  isFav: boolean;
  money: (v: number) => string;
  onQuickView: (p: Product) => void;
  onToggleFavorite: (id: string) => void;
  onAddToCart: (p: Product) => void;
}) {
  const variant = product.variants[0];
  const isAvailable = Boolean(variant && variant.available > 0);
  return (
    <article className="group relative flex flex-col rounded-3xl bg-white p-4 border border-[#ede5d8] shadow-xs hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 book-3d">
      {/* Favorite Heart — pinned to the card's top-right corner, clear of the
          cover so a scroll-tap on mobile never wishlist-adds accidentally. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(product.id);
        }}
        aria-label={isFav ? `Bỏ yêu thích ${product.name}` : `Lưu ${product.name} vào tủ sách`}
        aria-pressed={isFav}
        className={`absolute top-3 right-3 z-20 size-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
          isFav ? "bg-[#8c2d19] text-white" : "bg-white/95 hover:bg-white text-slate-600 hover:text-[#8c2d19] border border-[#ede5d8] shadow-sm"
        }`}
      >
        <Heart className={`w-4 h-4 ${isFav ? "fill-white" : ""}`} />
      </button>

      {/* Book / Product Box */}
      <button onClick={() => onQuickView(product)} className="relative cursor-pointer" aria-label={`Xem nhanh ${product.name}`}>
        <ProductCover
          id={product.id}
          name={product.name}
          categoryName={product.category.name}
          authorName={product.author?.name}
          image={product.image ?? null}
        />
      </button>

      {/* Info */}
      <div className="flex flex-1 flex-col pt-3.5 space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#8c2d19]">
          <span className="truncate max-w-[70%]">{product.brand?.name ?? product.category.name}</span>
          <span className={`font-mono text-[11px] font-bold ${isAvailable ? "text-[#14532d] bg-[#dcfce7] px-1.5 py-0.5 rounded" : "text-[#8c2d19] bg-[#fef3c7] px-1.5 py-0.5 rounded"}`}>
            {isAvailable ? "SẴN HÀNG" : "HẾT HÀNG"}
          </span>
        </div>

        <h3
          onClick={() => onQuickView(product)}
          className="font-bold text-slate-900 leading-snug text-sm sm:text-base line-clamp-2 min-h-11 cursor-pointer group-hover:text-[#8c2d19] transition-colors"
        >
          {product.name}
        </h3>

        <div className="mt-auto pt-3 border-t border-[#f3ece1] flex items-end justify-between gap-2">
          <div>
            <span className="block text-base sm:text-lg font-black text-slate-900">
              {variant ? money(variant.price) : "Liên hệ"}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`size-2 rounded-full ${isAvailable ? "bg-[#14532d]" : "bg-slate-300"}`} />
              <span className="text-[11px] font-medium text-slate-500">
                {isAvailable ? `Còn ${variant!.available} sp` : "Tạm hết"}
              </span>
            </div>
          </div>

          {/* Buy button */}
          <button
            onClick={() => onAddToCart(product)}
            disabled={!isAvailable}
            aria-label={isAvailable ? `Thêm ${product.name} vào giỏ` : `${product.name} tạm hết hàng`}
            className="size-11 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white flex items-center justify-center shadow-md transition-all hover:scale-110 active:scale-95 shrink-0 cursor-pointer"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>
    </article>
  );
}

