// Section 19: CHECKOUT MODAL
// Loaded via next/dynamic from page.tsx so its JS ships in a separate chunk
// and is only fetched when the customer actually opens checkout.
import { Banknote, Check, CreditCard, Gift, Store, Truck, X } from "lucide-react";
import type { CartLine, Fulfillment, GiftWrapping, PaymentMethodChoice } from "./types";

export default function CheckoutModal({
  cart,
  grandTotal,
  fulfillment,
  onFulfillment,
  paymentMethod,
  onPaymentMethod,
  giftWrapping,
  onGiftWrapping,
  giftMessage,
  onGiftMessage,
  customer,
  onCustomer,
  couponInput,
  onCouponInput,
  storeName,
  money,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  cart: CartLine[];
  grandTotal: number;
  fulfillment: Fulfillment;
  onFulfillment: (v: Fulfillment) => void;
  paymentMethod: PaymentMethodChoice;
  onPaymentMethod: (v: PaymentMethodChoice) => void;
  giftWrapping: GiftWrapping;
  onGiftWrapping: (v: GiftWrapping) => void;
  giftMessage: string;
  onGiftMessage: (v: string) => void;
  customer: { name: string; phone: string; email: string; address: string };
  onCustomer: (v: { name: string; phone: string; email: string; address: string }) => void;
  couponInput: string;
  onCouponInput: (v: string) => void;
  storeName: string;
  money: (v: number) => string;
  submitting: boolean;
  error: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-[#1c1917]/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-modal-title"
        className="w-full max-w-xl bg-[#fbf9f5] rounded-3xl p-6 sm:p-8 shadow-2xl border border-[#ede5d8] my-8 space-y-5 animate-in zoom-in-95 duration-200 font-serif"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-[#8c2d19] bg-[#faf4ea] px-2.5 py-0.5 rounded font-bold border border-[#e8dac5]">
              {paymentMethod === "VNPAY" ? "Thanh Toán Qua VNPay"
                : paymentMethod === "MOMO" ? "Thanh Toán Qua MoMo"
                : paymentMethod === "ZALOPAY" ? "Thanh Toán Qua ZaloPay"
                : "Thanh Toán Khi Nhận Hàng (COD)"}
            </span>
            <h3 id="checkout-modal-title" className="font-black text-2xl sm:text-3xl text-slate-900 mt-1">
              Thông Tin Giao Nhận
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng cửa sổ thanh toán"
            className="size-9 rounded-full bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center border border-[#ede5d8]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Delivery vs Pickup */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => onFulfillment("delivery")}
            className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all ${
              fulfillment === "delivery"
                ? "bg-white border-[#8c2d19] ring-2 ring-[#8c2d19]/20 shadow-xs"
                : "bg-[#faf7f2] border-[#ede5d8] hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <Truck className={`w-5 h-5 ${fulfillment === "delivery" ? "text-[#8c2d19]" : "text-slate-500"}`} />
              {fulfillment === "delivery" && <Check className="w-4 h-4 text-[#8c2d19]" />}
            </div>
            <div className="mt-2">
              <b className="block text-xs sm:text-sm text-slate-900 font-bold">Giao Hàng Tận Nơi</b>
              <span className="text-[11px] text-slate-500">Kiểm tra hàng &amp; Thanh toán COD</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onFulfillment("pickup")}
            className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all ${
              fulfillment === "pickup"
                ? "bg-white border-[#8c2d19] ring-2 ring-[#8c2d19]/20 shadow-xs"
                : "bg-[#faf7f2] border-[#ede5d8] hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <Store className={`w-5 h-5 ${fulfillment === "pickup" ? "text-[#8c2d19]" : "text-slate-500"}`} />
              {fulfillment === "pickup" && <Check className="w-4 h-4 text-[#8c2d19]" />}
            </div>
            <div className="mt-2">
              <b className="block text-xs sm:text-sm text-slate-900 font-bold">Nhận Tại Cửa Hàng</b>
              <span className="text-[11px] text-slate-500">{storeName}</span>
            </div>
          </button>
        </div>

        {/* Payment method */}
        <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Phương thức thanh toán">
          {/* 4 payment options: COD / VNPay / MoMo / ZaloPay */}
          <button
            type="button"
            role="radio"
            aria-checked={paymentMethod === "COD"}
            onClick={() => onPaymentMethod("COD")}
            className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all ${
              paymentMethod === "COD"
                ? "bg-white border-[#8c2d19] ring-2 ring-[#8c2d19]/20 shadow-xs"
                : "bg-[#faf7f2] border-[#ede5d8] hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <Banknote className={`w-5 h-5 ${paymentMethod === "COD" ? "text-[#8c2d19]" : "text-slate-500"}`} />
              {paymentMethod === "COD" && <Check className="w-4 h-4 text-[#8c2d19]" />}
            </div>
            <div className="mt-2">
              <b className="block text-xs sm:text-sm text-slate-900 font-bold">Tiền Mặt (COD)</b>
              <span className="text-[11px] text-slate-500">Thanh toán khi nhận hàng</span>
            </div>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={paymentMethod === "VNPAY"}
            onClick={() => onPaymentMethod("VNPAY")}
            className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all ${
              paymentMethod === "VNPAY"
                ? "bg-white border-[#8c2d19] ring-2 ring-[#8c2d19]/20 shadow-xs"
                : "bg-[#faf7f2] border-[#ede5d8] hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <CreditCard className={`w-5 h-5 ${paymentMethod === "VNPAY" ? "text-[#8c2d19]" : "text-slate-500"}`} />
              {paymentMethod === "VNPAY" && <Check className="w-4 h-4 text-[#8c2d19]" />}
            </div>
            <div className="mt-2">
              <b className="block text-xs sm:text-sm text-slate-900 font-bold">VNPay</b>
              <span className="text-[11px] text-slate-500">QR / Ngân hàng / Ví điện tử</span>
            </div>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={paymentMethod === "MOMO"}
            onClick={() => onPaymentMethod("MOMO")}
            className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all ${
              paymentMethod === "MOMO"
                ? "bg-white border-[#8c2d19] ring-2 ring-[#8c2d19]/20 shadow-xs"
                : "bg-[#faf7f2] border-[#ede5d8] hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <CreditCard className={`w-5 h-5 ${paymentMethod === "MOMO" ? "text-[#8c2d19]" : "text-slate-500"}`} />
              {paymentMethod === "MOMO" && <Check className="w-4 h-4 text-[#8c2d19]" />}
            </div>
            <div className="mt-2">
              <b className="block text-xs sm:text-sm text-slate-900 font-bold">MoMo</b>
              <span className="text-[11px] text-slate-500">Ví MoMo</span>
            </div>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={paymentMethod === "ZALOPAY"}
            onClick={() => onPaymentMethod("ZALOPAY")}
            className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all ${
              paymentMethod === "ZALOPAY"
                ? "bg-white border-[#8c2d19] ring-2 ring-[#8c2d19]/20 shadow-xs"
                : "bg-[#faf7f2] border-[#ede5d8] hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <CreditCard className={`w-5 h-5 ${paymentMethod === "ZALOPAY" ? "text-[#8c2d19]" : "text-slate-500"}`} />
              {paymentMethod === "ZALOPAY" && <Check className="w-4 h-4 text-[#8c2d19]" />}
            </div>
            <div className="mt-2">
              <b className="block text-xs sm:text-sm text-slate-900 font-bold">ZaloPay</b>
              <span className="text-[11px] text-slate-500">Ví ZaloPay</span>
            </div>
          </button>
        </div>

        {/* Customer Inputs */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="customer-name" className="block text-xs font-bold text-slate-700 mb-1">
                Họ và tên người nhận *
              </label>
              <input
                id="customer-name"
                required
                value={customer.name}
                onChange={(e) => onCustomer({ ...customer, name: e.target.value })}
                placeholder="VD: Nguyễn Văn A"
                className="w-full bg-white border border-[#ede5d8] rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 focus:border-[#8c2d19]"
              />
            </div>
            <div>
              <label htmlFor="customer-phone" className="block text-xs font-bold text-slate-700 mb-1">
                Số điện thoại nhận hàng *
              </label>
              <input
                id="customer-phone"
                type="tel"
                required
                pattern="[0-9+ ]{9,15}"
                value={customer.phone}
                onChange={(e) => onCustomer({ ...customer, phone: e.target.value })}
                placeholder="VD: 0901234567"
                className="w-full bg-white border border-[#ede5d8] rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 focus:border-[#8c2d19]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="customer-email" className="block text-xs font-bold text-slate-700 mb-1">
              Email nhận hoá đơn điện tử
            </label>
            <input
              id="customer-email"
              type="email"
              value={customer.email}
              onChange={(e) => onCustomer({ ...customer, email: e.target.value })}
              placeholder="VD: docgia@gmail.com"
              className="w-full bg-white border border-[#ede5d8] rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 focus:border-[#8c2d19]"
            />
          </div>

          {fulfillment === "delivery" && (
            <div>
              <label htmlFor="customer-address" className="block text-xs font-bold text-slate-700 mb-1">
                Địa chỉ giao hàng chi tiết *
              </label>
              <textarea
                id="customer-address"
                rows={2}
                required
                value={customer.address}
                onChange={(e) => onCustomer({ ...customer, address: e.target.value })}
                placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành phố..."
                className="w-full bg-white border border-[#ede5d8] rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 focus:border-[#8c2d19]"
              />
            </div>
          )}

          {/* Gift Wrapping Selector */}
          <div className="p-3.5 rounded-2xl bg-[#faf4ea] border border-[#e8dac5] space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-[#8c2d19]">
              <span className="flex items-center gap-1.5">
                <Gift className="w-4 h-4" /> Dịch vụ gói quà thủ công &amp; Thiệp viết tay:
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "none", label: "Tiêu chuẩn (0đ)" },
                { id: "vintage", label: "Vintage Kraft (+25k)" },
                { id: "heritage", label: "Hộp Di Sản (+45k)" },
              ].map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onGiftWrapping(g.id as GiftWrapping)}
                  className={`p-2 rounded-xl text-[11px] font-bold border transition-all ${
                    giftWrapping === g.id
                      ? "bg-[#1c1917] text-white border-[#1c1917]"
                      : "bg-white text-slate-700 border-[#ede5d8] hover:bg-[#fbf9f5]"
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {giftWrapping !== "none" && (
              <div>
                <label htmlFor="customer-gift-msg" className="sr-only">
                  Lời nhắn viết thiệp
                </label>
                <input
                  id="customer-gift-msg"
                  value={giftMessage}
                  onChange={(e) => onGiftMessage(e.target.value)}
                  placeholder="Lời nhắn viết thiệp gửi tặng người nhận..."
                  className="w-full bg-white border border-[#ede5d8] rounded-lg px-2.5 py-1.5 text-xs text-slate-900 mt-2"
                />
              </div>
            )}
          </div>

          {/* Coupon Code Input */}
          <div>
            <label htmlFor="checkout-coupon-code" className="block text-xs font-bold text-slate-700 mb-1">
              Mã giảm giá / Voucher ưu đãi (nếu có)
            </label>
            <div className="flex gap-2">
              <input
                id="checkout-coupon-code"
                value={couponInput}
                onChange={(e) => onCouponInput(e.target.value.toUpperCase())}
                placeholder="Nhập mã: MELIOVIP, FREESHIP..."
                className="flex-1 bg-white border border-[#ede5d8] rounded-xl px-3 py-2 text-xs font-mono uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 focus:border-[#8c2d19]"
              />
            </div>
          </div>
        </div>

        {/* Order summary lines */}
        <div className="rounded-xl bg-white border border-[#ede5d8] divide-y divide-[#f3ece1] max-h-40 overflow-y-auto">
          {cart.map((line) => (
            <div key={line.variantId} className="px-3.5 py-2 flex items-center justify-between text-xs">
              <span className="line-clamp-1 pr-3">
                {line.name} <b className="text-slate-400">× {line.quantity}</b>
              </span>
              <b className="shrink-0">{money(line.price * line.quantity)}</b>
            </div>
          ))}
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold whitespace-pre-line">
            {error}
          </div>
        )}

        {/* Total Breakdown & Submit */}
        <div className="pt-4 border-t border-[#ede5d8] flex items-center justify-between gap-4">
          <div>
            <span className="text-xs text-slate-500">Tổng thanh toán COD:</span>
            <span className="block text-2xl font-black text-[#1c1917]">{money(grandTotal)}</span>
          </div>

          <button
            onClick={onSubmit}
            disabled={
              submitting ||
              !customer.name ||
              !customer.phone ||
              (fulfillment === "delivery" && !customer.address)
            }
            className="px-6 py-3.5 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs sm:text-sm shadow-xl transition-all hover:scale-[1.02]"
          >
            {submitting ? "Đang xử lý đơn..." : "Xác Nhận Đặt Hàng"}
          </button>
        </div>
      </div>
    </div>
  );
}
