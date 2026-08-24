// Section 16: QUICK VIEW PRODUCT MODAL
import { X, ShoppingBag } from "lucide-react";
import type { Product } from "./types";

export default function QuickViewModal({
  product,
  storeName,
  money,
  onClose,
  onShelfFinder,
  onFlipbook,
  onAddToCart,
}: {
  product: Product;
  storeName: string;
  money: (v: number) => string;
  onClose: () => void;
  onShelfFinder: (p: Product) => void;
  onFlipbook: (p: Product) => void;
  onAddToCart: (p: Product) => void;
}) {
  const variant = product.variants[0];
  return (
    <div
      className="fixed inset-0 z-50 bg-[#1c1917]/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quickview-title"
        className="w-full max-w-3xl bg-[#fbf9f5] rounded-3xl p-6 sm:p-8 shadow-2xl border border-[#ede5d8] relative max-h-[90vh] overflow-y-auto space-y-6 animate-in zoom-in-95 duration-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Đóng xem nhanh tác phẩm"
          className="absolute top-5 right-5 size-9 rounded-full bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors shadow-xs"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-start">
          {/* Product Cover Box (5 cols) */}
          <div className="sm:col-span-5">
            <div className="aspect-[4/5] rounded-2xl bg-gradient-to-tr from-[#1c1917] via-[#2d2521] to-[#171412] p-6 text-white flex flex-col justify-between shadow-xl border border-white/15 relative">
              <div className="bookmark-ribbon" />
              <span className="text-[10px] font-serif uppercase tracking-widest text-amber-300 font-bold">
                {product.category.name}
              </span>
              <h3 className="font-serif font-black text-xl sm:text-2xl text-amber-100 leading-snug my-auto">
                {product.name}
              </h3>
              <div className="border-t border-white/20 pt-2 text-xs font-serif italic text-slate-300">
                ✍️ {product.author?.name ?? product.brand?.name ?? "Melio Press"}
              </div>
            </div>
          </div>

          {/* Details & Specs (7 cols) */}
          <div className="sm:col-span-7 space-y-4 font-serif">
            <div>
              <span className="inline-block px-3 py-1 rounded-full text-[10px] uppercase tracking-widest bg-[#faf4ea] text-[#8c2d19] border border-[#e8dac5] font-bold">
                {product.category.name}
              </span>
              <h3 id="quickview-title" className="font-black text-2xl text-slate-900 leading-tight mt-2">
                {product.name}
              </h3>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 italic">
                {product.author && <span>✍️ {product.author.name}</span>}
                {product.publisher && <span>🏢 {product.publisher.name}</span>}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#ede5d8] space-y-1">
              <span className="text-xs text-slate-500">Giá niêm yết chính hãng</span>
              <div className="text-2xl font-black text-[#1c1917]">
                {variant ? money(variant.price) : "Liên hệ"}
              </div>
              <div className={`flex items-center gap-1.5 pt-1 text-xs font-medium ${variant?.available ? "text-[#14532d]" : "text-red-600"}`}>
                <span className={`size-2 rounded-full ${variant?.available ? "bg-[#14532d]" : "bg-red-400"}`} />
                <span>
                  Tồn kho khả dụng: {variant?.available ?? 0} cuốn tại <b>{storeName}</b>
                </span>
              </div>
            </div>

            {/* Action Buttons: Shelf Locator + 3D Flipbook */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => onShelfFinder(product)}
                className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                📍 Xem Vị Trí Kệ Sách
              </button>
              <button
                onClick={() => onFlipbook(product)}
                className="py-2.5 rounded-xl bg-[#faf4ea] hover:bg-[#ede5d8] text-[#8c2d19] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                📖 Đọc Thử 3D Lật Trang
              </button>
            </div>

            {product.description && (
              <div>
                <h5 className="text-xs font-bold text-slate-900 mb-1">Lời tựa tác phẩm:</h5>
                <p className="text-xs text-slate-600 leading-relaxed line-clamp-4 italic">{product.description}</p>
              </div>
            )}

            <div className="pt-2">
              <button
                onClick={() => {
                  onAddToCart(product);
                  onClose();
                }}
                disabled={!variant?.available}
                className="w-full py-3.5 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
              >
                <ShoppingBag className="w-4 h-4" />
                {variant?.available ? "Thêm Vào Giỏ Hàng Ngay" : "Tạm Hết Hàng"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
