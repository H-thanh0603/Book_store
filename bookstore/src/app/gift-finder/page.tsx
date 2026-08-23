"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Baby,
  BookOpen,
  Briefcase,
  Check,
  CheckCircle2,
  Gift,
  Heart,
  HelpCircle,
  Palette,
  RotateCcw,
  ShoppingBag,
  Smile,
  Sparkles,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";

const recipients = [
  { id: "kids", label: "Bé Yêu / Thiếu Nhi", icon: Baby, desc: "Đồ chơi LEGO, truyện tranh & màu vẽ" },
  { id: "friends", label: "Bạn Thân / Đồng Nghiệp", icon: Users, desc: "Sách kỹ năng, sổ tay mộc & quà lưu niệm" },
  { id: "lover", label: "Người Thương / Người Yêu", icon: Heart, desc: "Tản văn lãng mạn, hộp quà sáp niêm phong" },
  { id: "leader", label: "Sếp / Đối Tác Kinh Doanh", icon: Briefcase, desc: "Tủ sách lãnh đạo bìa cứng cao cấp" },
  { id: "self", label: "Tự Thưởng Cho Bản Thân", icon: Smile, desc: "Trọn bộ chữa lành & phát triển tâm thức" },
];

const interests = [
  { id: "literature", label: "Văn Học & Nghệ Thuật Sống", icon: BookOpen },
  { id: "business", label: "Kinh Doanh, Đầu Tư & Khởi Nghiệp", icon: Briefcase },
  { id: "toys", label: "Lắp Ráp LEGO & Đồ Chơi Sáng Tạo", icon: Sparkles },
  { id: "art", label: "Mỹ Thuật, Hội Họa & Thủ Công DIY", icon: Palette },
];

const budgets = [
  { id: "under150", label: "Dưới 150.000 ₫", desc: "Sổ tay mộc + Bookmark mạ vàng" },
  { id: "150to300", label: "150.000 ₫ - 300.000 ₫", desc: "Cuốn sách hay + Gói quà Vintage" },
  { id: "300to500", label: "300.000 ₫ - 500.000 ₫", desc: "Combo 2 cuốn sách + Hộp quà di sản" },
  { id: "above500", label: "Trên 500.000 ₫ (Bộ Quà VIP)", desc: "Trọn bộ sách bìa cứng + Bộ Lego / Gấu bông" },
];

const giftBundles = {
  kids: {
    title: "Hộp Quà Tuổi Thơ: LEGO Sáng Tạo & Gấu Bông Sanrio",
    price: 349000,
    items: ["1 Bộ LEGO Classic Creative Bricks", "1 Bookmark Chú Dế Mèn dập nổi", "1 Thiệp chúc mừng viết tay sinh nhật"],
    desc: "Món quà tuyệt vời kích thích trí tưởng tượng và nuôi dưỡng niềm vui sáng tạo vô bờ bến cho bé.",
  },
  literature: {
    title: "Hộp Quà Di Sản: Tác Phẩm Kinh Điển & Sổ Tay Mộc",
    price: 278000,
    items: ["1 Cuốn Tôi Thấy Hoa Vàng Trên Cỏ Xanh (Bìa Cứng)", "1 Sổ tay mộc Vintage Kraft", "1 Bookmark mạ vàng dập nổi Melio"],
    desc: "Món quà văn hóa thanh lịch vỗ về tâm hồn và truyền cảm hứng sống đẹp mỗi ngày.",
  },
  business: {
    title: "Hộp Quà Khai Phóng: Tủ Sách Lãnh Đạo & Bút Ký Cao Cấp",
    price: 489000,
    items: ["1 Cuốn Harry Potter & Triết lý Lãnh Đạo", "1 Bút bi Thiên Long kim loại cao cấp", "1 Hộp quà cứng nam châm dập kim vàng"],
    desc: "Bộ quà tặng trang trọng dành cho sếp, đối tác và những nhà khai phóng tương lai.",
  },
};

export default function GiftFinderPage() {
  const [step, setStep] = useState(1);
  const [selectedRecipient, setSelectedRecipient] = useState<string | null>(null);
  const [selectedInterest, setSelectedInterest] = useState<string | null>(null);
  const [selectedBudget, setSelectedBudget] = useState<string | null>(null);
  const [bundleAdded, setBundleAdded] = useState(false);

  function resetQuiz() {
    setStep(1);
    setSelectedRecipient(null);
    setSelectedInterest(null);
    setSelectedBudget(null);
    setBundleAdded(false);
  }

  const resultBundle =
    selectedRecipient === "kids" || selectedInterest === "toys"
      ? giftBundles.kids
      : selectedInterest === "business" || selectedRecipient === "leader"
      ? giftBundles.business
      : giftBundles.literature;

  return (
    <main className="min-h-screen bg-[#fffdfa] text-slate-900 pb-24 font-sans selection:bg-[#c83f49] selection:text-white">
      {/* 1. TOP ANNOUNCEMENT BAR */}
      <div className="bg-[#c83f49] text-white px-4 py-2 text-xs font-bold shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="bg-white text-[#c83f49] px-2.5 py-0.5 rounded-full text-[10px] uppercase font-black">
              GIFT CONCIERGE
            </span>
            <span>🎁 Trắc nghiệm tìm quà tặng thông minh chuẩn gu người nhận trong 3 bước</span>
          </div>
          <Link href="/shop" className="hover:underline text-[11px] hidden sm:inline text-white/90">
            ← Về Siêu Thị Sách
          </Link>
        </div>
      </div>

      {/* 2. HEADER */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-[#ede5d8] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <Link href="/gift-finder" className="flex items-center gap-2.5 group">
            <div className="size-11 rounded-2xl bg-gradient-to-tr from-rose-500 to-amber-500 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-all">
              <Gift className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="font-serif font-black text-2xl text-slate-900 tracking-tight leading-none">
                  Melio
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white px-1.5 py-0.5 rounded">
                  Gift Wizard
                </span>
              </div>
              <p className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">Trợ Lý Tìm Quà Tặng</p>
            </div>
          </Link>

          <button onClick={resetQuiz} className="text-xs font-bold text-slate-600 hover:text-rose-600 flex items-center gap-1">
            <RotateCcw className="w-3.5 h-3.5" /> Làm lại trắc nghiệm
          </button>
        </div>
      </header>

      {/* 3. WIZARD CONTAINER */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 space-y-8">
        {/* Step Indicator */}
        <div className="flex items-center justify-between relative">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 -translate-y-1/2 z-0" />
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`relative z-10 size-10 rounded-full flex items-center justify-center font-bold text-xs shadow-xs transition-all ${
                step >= s
                  ? "bg-[#c83f49] text-white ring-4 ring-rose-100"
                  : "bg-white text-slate-400 border border-slate-200"
              }`}
            >
              {step > s ? <Check className="w-5 h-5" /> : s}
            </div>
          ))}
        </div>

        {/* STEP 1: RECIPIENT */}
        {step === 1 && (
          <div className="rounded-3xl bg-white p-6 sm:p-10 shadow-md border border-[#ede5d8] space-y-6 animate-in fade-in duration-200">
            <div className="text-center space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-600">BƯỚC 1 / 3</span>
              <h2 className="font-serif font-black text-2xl sm:text-3xl text-slate-900">
                Bạn Đang Muốn Tặng Quà Cho Ai?
              </h2>
              <p className="text-xs text-slate-500 font-serif italic">Chọn đối tượng người nhận để gợi ý nhóm quà phù hợp nhất</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {recipients.map((r) => {
                const Icon = r.icon;
                const isSel = selectedRecipient === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRecipient(r.id)}
                    className={`p-4 rounded-2xl border text-left flex items-start gap-3.5 transition-all ${
                      isSel
                        ? "bg-rose-50/80 border-[#c83f49] ring-2 ring-rose-500/20 shadow-xs"
                        : "bg-[#faf8f5] border-[#ede5d8] hover:bg-white"
                    }`}
                  >
                    <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${isSel ? "bg-[#c83f49] text-white" : "bg-white text-slate-600"}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <b className="block text-sm font-bold text-slate-900">{r.label}</b>
                      <span className="text-xs text-slate-500">{r.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              disabled={!selectedRecipient}
              onClick={() => setStep(2)}
              className="w-full py-4 rounded-2xl bg-[#1c1917] hover:bg-[#c83f49] disabled:bg-slate-200 text-white font-bold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2"
            >
              Tiếp Tục Chọn Sở Thích <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 2: INTEREST */}
        {step === 2 && (
          <div className="rounded-3xl bg-white p-6 sm:p-10 shadow-md border border-[#ede5d8] space-y-6 animate-in fade-in duration-200">
            <div className="text-center space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-600">BƯỚC 2 / 3</span>
              <h2 className="font-serif font-black text-2xl sm:text-3xl text-slate-900">
                Sở Thích Chính Của Người Nhận?
              </h2>
              <p className="text-xs text-slate-500 font-serif italic">Gu sở thích sẽ quyết định linh hồn của món quà</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {interests.map((it) => {
                const Icon = it.icon;
                const isSel = selectedInterest === it.id;
                return (
                  <button
                    key={it.id}
                    onClick={() => setSelectedInterest(it.id)}
                    className={`p-4 rounded-2xl border text-left flex items-center gap-3.5 transition-all ${
                      isSel
                        ? "bg-rose-50/80 border-[#c83f49] ring-2 ring-rose-500/20 shadow-xs"
                        : "bg-[#faf8f5] border-[#ede5d8] hover:bg-white"
                    }`}
                  >
                    <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${isSel ? "bg-[#c83f49] text-white" : "bg-white text-slate-600"}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <b className="text-sm font-bold text-slate-900">{it.label}</b>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="py-3.5 px-5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                Quay lại
              </button>
              <button
                disabled={!selectedInterest}
                onClick={() => setStep(3)}
                className="flex-1 py-3.5 rounded-2xl bg-[#1c1917] hover:bg-[#c83f49] disabled:bg-slate-200 text-white font-bold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2"
              >
                Tiếp Tục Chọn Ngân Sách <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: BUDGET */}
        {step === 3 && (
          <div className="rounded-3xl bg-white p-6 sm:p-10 shadow-md border border-[#ede5d8] space-y-6 animate-in fade-in duration-200">
            <div className="text-center space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-600">BƯỚC 3 / 3</span>
              <h2 className="font-serif font-black text-2xl sm:text-3xl text-slate-900">
                Mức Ngân Sách Dự Kiến?
              </h2>
              <p className="text-xs text-slate-500 font-serif italic">Hệ thống sẽ cân đối để tối ưu trọn gói quà tặng và thiệp</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {budgets.map((b) => {
                const isSel = selectedBudget === b.id;
                return (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBudget(b.id)}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                      isSel
                        ? "bg-rose-50/80 border-[#c83f49] ring-2 ring-rose-500/20 shadow-xs"
                        : "bg-[#faf8f5] border-[#ede5d8] hover:bg-white"
                    }`}
                  >
                    <b className="block text-sm font-bold text-slate-900">{b.label}</b>
                    <span className="text-xs text-slate-500 mt-1 block">{b.desc}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="py-3.5 px-5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                Quay lại
              </button>
              <button
                disabled={!selectedBudget}
                onClick={() => setStep(4)}
                className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-500 text-white font-bold text-xs sm:text-sm shadow-xl transition-all flex items-center justify-center gap-2"
              >
                Khám Phá Hộp Quà Hoàn Hảo <Sparkles className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: RECOMMENDATION RESULT */}
        {step === 4 && (
          <div className="rounded-3xl bg-white p-6 sm:p-10 shadow-xl border border-[#ede5d8] space-y-6 animate-in zoom-in-95 duration-200">
            <div className="text-center space-y-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 px-3 py-1 rounded-full">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" /> HỘP QUÀ ĐƯỢC TUYỂN CHỌN DÀNH RIÊNG CHO BẠN
              </span>
              <h2 className="font-serif font-black text-2xl sm:text-3xl text-slate-900">
                {resultBundle.title}
              </h2>
              <p className="text-xs text-slate-600 font-serif italic max-w-lg mx-auto">
                &ldquo;{resultBundle.desc}&rdquo;
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#faf7f2] border border-[#ede5d8] space-y-3 font-serif">
              <b className="block text-xs uppercase tracking-wider text-[#8c2d19]">
                Chi Tiết Ấn Phẩm Trong Hộp Quà:
              </b>
              <ul className="space-y-1.5 text-xs text-slate-700">
                {resultBundle.items.map((item, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="pt-3 border-t border-[#ede5d8] flex items-center justify-between">
                <span className="text-xs text-slate-500">Giá trọn bộ (Đã gồm hộp quà &amp; thiệp):</span>
                <b className="text-2xl font-black text-[#c83f49]">{resultBundle.price.toLocaleString("vi-VN")} ₫</b>
              </div>
            </div>

            {bundleAdded ? (
              <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-800 text-xs font-bold text-center border border-emerald-200 space-y-2">
                <div>🎉 Đã thêm trọn bộ hộp quà vào giỏ hàng của bạn!</div>
                <Link
                  href="/shop"
                  className="inline-block px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs"
                >
                  Đến Trang Thanh Toán COD
                </Link>
              </div>
            ) : (
              <button
                onClick={() => setBundleAdded(true)}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-500 text-white font-serif font-black text-sm shadow-xl hover:scale-[1.01] transition-all flex items-center justify-center gap-2"
              >
                <ShoppingBag className="w-5 h-5" /> Thêm Hộp Quà Này Vào Giỏ Hàng
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
