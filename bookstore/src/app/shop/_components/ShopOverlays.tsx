// Sections 17 + 18 + 20: WISHLIST DRAWER, CART DRAWER, ORDER SUCCESS MODAL
import Link from "next/link";
import {
  ArrowRight, Check, CheckCircle2, Copy, Heart, Minus, Plus, ShoppingBag, Trash2, Truck, X,
} from "lucide-react";
import type { CartLine, Product } from "./types";

export function WishlistDrawer({
  open,
  wishlist,
  allProducts,
  money,
  onClose,
  onAddToCart,
  onToggleFavorite,
}: {
  open: boolean;
  wishlist: string[];
  allProducts: Product[];
  money: (v: number) => string;
  onClose: () => void;
  onAddToCart: (p: Product) => void;
  onToggleFavorite: (id: string) => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-[#1c1917]/50 backdrop-blur-xs flex justify-end animate-in fade-in duration-200"
      onMouseDown={onClose}
    >
      <aside
        className="w-full max-w-md bg-[#fbf9f5] h-full shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-200 font-serif"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-[#ede5d8] flex items-center justify-between">
          <div>
            <h3 className="font-black text-xl text-slate-900 flex items-center gap-2">
              <Heart className="w-5 h-5 fill-[#8c2d19] text-[#8c2d19]" /> Tủ Sách Cá Nhân
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{wishlist.length} tác phẩm đã lưu lại</p>
          </div>
          <button
            onClick={onClose}
            className="size-9 rounded-full bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center border border-[#ede5d8]"
            aria-label="Đóng tủ sách"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {wishlist.map((id) => {
            const product = allProducts.find((p) => p.id === id);
            if (!product) return null;
            const variant = product.variants[0];
            return (
              <div key={id} className="p-3.5 rounded-2xl bg-white border border-[#ede5d8] flex items-center gap-3">
                <div className="size-16 rounded-xl bg-[#1c1917] text-white p-2 text-[8px] flex flex-col justify-between shrink-0">
                  <span className="line-clamp-1 text-amber-300">{product.category.name}</span>
                  <span className="line-clamp-2 font-bold">{product.name}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-xs text-slate-900 line-clamp-1">{product.name}</h4>
                  <p className="text-[11px] font-bold text-[#8c2d19] mt-0.5">
                    {variant ? money(variant.price) : "Liên hệ"}
                  </p>

                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => {
                        onAddToCart(product);
                        onClose();
                      }}
                      disabled={!variant?.available}
                      className="px-3 py-1 rounded-lg bg-[#1c1917] text-white text-[11px] font-bold hover:bg-[#8c2d19] disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      {variant?.available ? "+ Thêm vào giỏ" : "Hết hàng"}
                    </button>
                    <button onClick={() => onToggleFavorite(id)} className="text-slate-400 hover:text-rose-600 text-xs p-1">
                      Bỏ lưu
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {wishlist.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-16 space-y-3">
              <Heart className="w-12 h-12 opacity-30 text-[#8c2d19]" />
              <p className="text-sm font-bold text-slate-700">Tủ sách cá nhân đang trống</p>
              <p className="text-xs text-slate-400">Bấm biểu tượng trái tim trên sản phẩm để lưu lại xem sau nhé!</p>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-[#ede5d8] bg-white space-y-2">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-2xl bg-[#faf7f2] hover:bg-[#ede5d8] text-slate-800 font-bold text-xs"
          >
            Đóng danh sách
          </button>
        </div>
      </aside>
    </div>
  );
}

export function CartDrawer({
  open,
  cart,
  itemCount,
  subtotal,
  storeName,
  freeShippingThreshold,
  progressToFreeShipping,
  money,
  onClose,
  onChangeQuantity,
  onRemoveLine,
  onCheckout,
}: {
  open: boolean;
  cart: CartLine[];
  itemCount: number;
  subtotal: number;
  storeName: string;
  freeShippingThreshold: number;
  progressToFreeShipping: number;
  money: (v: number) => string;
  onClose: () => void;
  onChangeQuantity: (variantId: string, delta: number) => void;
  onRemoveLine: (variantId: string) => void;
  onCheckout: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-[#1c1917]/50 backdrop-blur-xs flex justify-end animate-in fade-in duration-200"
      onMouseDown={onClose}
    >
      <aside
        className="w-full max-w-md bg-[#fbf9f5] h-full shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-200 font-serif"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-[#ede5d8] flex items-center justify-between">
          <div>
            <h3 className="font-black text-xl text-slate-900">Giỏ Hàng Của Bạn</h3>
            <p className="text-xs text-slate-500 mt-0.5">{itemCount} món hàng · {storeName}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng giỏ hàng"
            className="size-9 rounded-full bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center border border-[#ede5d8]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Freeship Progress */}
        <div className="px-5 py-3 bg-[#faf4ea] border-b border-[#e8dac5] text-xs space-y-1.5">
          <div className="flex items-center justify-between font-semibold text-[#4a3b2c]">
            <span>
              {subtotal >= freeShippingThreshold ? (
                <span className="text-[#14532d] flex items-center gap-1 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Đủ điều kiện miễn phí giao hàng!
                </span>
              ) : (
                <span>
                  Mua thêm <b>{money(freeShippingThreshold - subtotal)}</b> để được miễn phí giao hàng
                </span>
              )}
            </span>
            <span className="font-bold">{progressToFreeShipping}%</span>
          </div>
          <div className="w-full bg-[#e8dac5] rounded-full h-1.5 overflow-hidden">
            <div className="bg-[#8c2d19] h-full rounded-full transition-all duration-300" style={{ width: `${progressToFreeShipping}%` }} />
          </div>
        </div>

        {/* Line items */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {cart.map((line) => (
            <div key={line.variantId} className="p-3.5 rounded-2xl bg-white border border-[#ede5d8] flex items-center gap-3">
              <div className="size-16 rounded-xl bg-[#1c1917] text-white p-2 text-[8px] flex flex-col justify-between shrink-0">
                <span className="line-clamp-1 text-amber-300">{line.category}</span>
                <span className="line-clamp-2 font-bold">{line.name}</span>
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-xs text-slate-900 line-clamp-1">{line.name}</h4>
                <p className="text-[11px] font-bold text-[#8c2d19] mt-0.5">{money(line.price)}</p>

                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1 bg-[#faf7f2] rounded-lg border border-[#ede5d8] p-0.5">
                    <button
                      onClick={() => onChangeQuantity(line.variantId, -1)}
                      aria-label={`Giảm số lượng ${line.name}`}
                      className="size-5 rounded hover:bg-white flex items-center justify-center text-slate-700"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-bold text-slate-900">{line.quantity}</span>
                    <button
                      onClick={() => onChangeQuantity(line.variantId, 1)}
                      disabled={line.quantity >= line.available}
                      aria-label={`Tăng số lượng ${line.name}`}
                      className="size-5 rounded hover:bg-white disabled:opacity-30 flex items-center justify-center text-slate-700"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <button
                    onClick={() => onRemoveLine(line.variantId)}
                    aria-label={`Xóa ${line.name} khỏi giỏ`}
                    className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Stock warnings after a 409 race loss clamped this line */}
                {line.available <= 0 ? (
                  <p className="mt-1 text-[10px] text-red-600 font-semibold">Hết hàng — vui lòng xóa khỏi giỏ</p>
                ) : line.quantity >= line.available ? (
                  <p className="mt-1 text-[10px] text-amber-700 font-semibold">⚠️ Chỉ còn {line.available} sản phẩm</p>
                ) : null}
              </div>
            </div>
          ))}

          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-16 space-y-3">
              <ShoppingBag className="w-12 h-12 opacity-30 text-[#8c2d19]" />
              <p className="text-sm font-bold text-slate-700">Giỏ hàng của bạn đang trống</p>
              <p className="text-xs text-slate-400">Hãy thêm những cuốn sách hay vào giỏ nhé!</p>
              <button onClick={onClose} className="px-4 py-2 rounded-xl bg-[#faf4ea] text-[#8c2d19] text-xs font-bold hover:bg-[#ede5d8]">
                Duyệt kho hàng
              </button>
            </div>
          )}
        </div>

        {/* Cart Footer */}
        {cart.length > 0 && (
          <div className="p-5 border-t border-[#ede5d8] bg-white space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Tạm tính giỏ hàng:</span>
              <span className="text-lg font-black text-slate-900">{money(subtotal)}</span>
            </div>

            <button
              onClick={onCheckout}
              className="w-full py-3.5 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] text-white font-bold text-xs sm:text-sm shadow-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
            >
              Tiến hành thanh toán COD <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

export function OrderSuccessModal({
  success,
  storeName,
  money,
  copiedOrder,
  onCopy,
  onClose,
}: {
  success: { number: string; total: number };
  storeName: string;
  money: (v: number) => string;
  copiedOrder: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-[#1c1917]/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#fbf9f5] rounded-3xl p-8 text-center shadow-2xl border border-[#ede5d8] space-y-4 animate-in zoom-in-95 duration-200 font-serif">
        <div className="size-16 rounded-full bg-[#faf4ea] text-[#8c2d19] flex items-center justify-center mx-auto border border-[#e8dac5]">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <div>
          <h3 className="font-black text-2xl sm:text-3xl text-slate-900">Đặt Hàng Thành Công!</h3>
          <p className="text-xs text-slate-500 mt-1">Ấn bản của bạn đang được thủ thư Melio chuẩn bị chu đáo</p>
        </div>

        <div className="p-4 rounded-2xl bg-[#1c1917] text-white space-y-1">
          <span className="text-[10px] text-slate-400 font-mono">MÃ ĐƠN HÀNG CỦA BẠN</span>
          <div className="flex items-center justify-center gap-2">
            <span className="font-mono text-xl font-black text-amber-200 tracking-wider">{success.number}</span>
            <button
              onClick={onCopy}
              className="p-1 rounded bg-white/10 hover:bg-white/20 text-slate-300 transition-colors"
              title="Sao chép mã đơn hàng"
            >
              {copiedOrder ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-600 bg-white p-3.5 rounded-2xl border border-[#ede5d8] text-left space-y-1">
          <div className="flex justify-between">
            <span>Tổng tiền thu khi giao (COD):</span>
            <b className="text-[#8c2d19] font-bold">{money(success.total)}</b>
          </div>
          <p className="text-[11px] text-slate-500 pt-1">
            📞 Thủ thư chi nhánh <b>{storeName}</b> sẽ sớm liên hệ xác nhận đơn hàng với bạn.
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Link
            href={`/track?q=${encodeURIComponent(success.number)}`}
            className="w-full py-3.5 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] text-white font-bold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2"
          >
            <Truck className="w-4 h-4 text-amber-300" /> Theo Dõi Hành Trình Đơn Hàng
          </Link>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-2xl bg-[#faf7f2] hover:bg-[#ede5d8] text-slate-800 font-bold text-xs"
          >
            Tiếp Tục Mua Sắm
          </button>
        </div>
      </div>
    </div>
  );
}
