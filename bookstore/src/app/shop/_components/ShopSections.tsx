// Sections 11–15: BLOG, VOUCHER HUB, NEWSLETTER, FOOTER (static editorial blocks)
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BookOpen, Check, Copy, Mail, Phone, Sparkles, Tag } from "lucide-react";
import type { BlogArticle, Voucher } from "./types";

export function BlogSection({ articles }: { articles: BlogArticle[] }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
        <div>
          <span className="text-[10px] uppercase tracking-widest text-[#8c2d19] font-black">
            TẠP CHÍ VĂN HÓA ĐỌC
          </span>
          <h2 className="font-serif font-black text-2xl sm:text-3xl text-slate-900 mt-0.5">
            Bản Tin Tri Thức &amp; Góc Bình Luận Sách
          </h2>
        </div>
        <span className="text-xs text-slate-500 font-medium">Tuyển tập bởi Ban Biên Tập Melio</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {articles.map((art) => (
          <div
            key={art.id}
            className="p-6 rounded-3xl bg-white border border-[#ede5d8] shadow-xs space-y-3 flex flex-col justify-between hover:shadow-xl hover:-translate-y-1 transition-all duration-200 group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="text-[#8c2d19] bg-[#faf4ea] px-2.5 py-0.5 rounded-full">{art.category}</span>
                <span className="text-slate-400 font-medium">{art.readTime}</span>
              </div>
              <h3 className="font-serif font-bold text-base text-slate-900 leading-snug">
                {art.title}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed italic">&ldquo;{art.snippet}&rdquo;</p>
            </div>
            <div className="pt-3 border-t border-[#f3ece1] flex items-center justify-between text-xs text-slate-400">
              <span>{art.date}</span>
              {/* Real navigation: the catalog search pre-fills the article topic. */}
              <Link
                href={`/shop?q=${encodeURIComponent(art.category === "VĂN HÓA ĐỌC" ? "văn học" : art.category === "BÍ QUYẾT ĐỌC" ? "sách" : "đồ chơi")}`}
                className="text-[#8c2d19] font-bold flex items-center gap-1 hover:underline"
              >
                Đọc tiếp <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function VoucherHub({ vouchers, onApply }: { vouchers: Voucher[]; onApply: (code: string) => void }) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = (code: string) => {
    onApply(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  return (
    <section id="voucher-hub" className="rounded-3xl bg-gradient-to-br from-[#1c1917] via-[#2d2521] to-[#6b2113] p-6 sm:p-10 text-white shadow-xl space-y-6 border border-[#e8dac5] relative overflow-hidden">
      <div className="absolute top-0 right-0 -mt-16 -mr-16 size-80 bg-[#d97706]/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/15 pb-4">
        <div>
          <span className="text-[10px] uppercase tracking-widest text-[#6b2113] bg-[#ffd56a] px-3 py-1 rounded-full font-black inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> KHO VOUCHER ĐỘC QUYỀN
          </span>
          <h2 className="font-serif font-black text-2xl sm:text-3xl mt-1.5 tracking-tight text-white">
            Ưu Đãi Đặc Quyền Của Bạn Hôm Nay
          </h2>
        </div>
        <p className="text-xs text-[#f3e5d0] font-medium">
          Sao chép mã và dán vào ô &ldquo;Mã giảm giá&rdquo; ở bước thanh toán
        </p>
      </div>

      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {vouchers.map((v) => {
          const isCopied = copiedCode === v.code;
          return (
            <div
              key={v.code}
              className="p-5 rounded-3xl bg-white text-slate-900 border border-[#ede5d8] flex items-center justify-between gap-3 group transition-all shadow-md hover:shadow-xl hover:-translate-y-1 relative"
            >
              <div className="space-y-1">
                <b className="block text-base font-bold text-slate-900 group-hover:text-[#8c2d19] transition-colors">
                  {v.title}
                </b>
                <span className="text-xs text-slate-600 block font-medium">{v.desc}</span>
                <div className="mt-2 text-[11px] font-mono bg-[#faf4ea] px-2.5 py-1 rounded-xl text-[#8c2d19] inline-flex items-center gap-1.5 font-bold border border-[#e8dac5]">
                  <Tag className="w-3 h-3" />
                  <span>{v.code}</span>
                </div>
              </div>
              <button
                onClick={() => handleCopy(v.code)}
                className={`px-4 py-2.5 rounded-2xl font-bold text-xs shadow-md transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  isCopied
                    ? "bg-[#14532d] text-white"
                    : "bg-[#1c1917] hover:bg-[#8c2d19] text-white"
                }`}
              >
                {isCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Đã chép!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Sao chép</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function NewsletterBox() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
    }
  };

  return (
    <section className="rounded-3xl bg-gradient-to-br from-[#faf4ea] via-[#fbf8f3] to-[#f3e5d0] p-8 sm:p-12 border border-[#e8dac5] shadow-xs text-center space-y-4">
      <div className="max-w-xl mx-auto space-y-3">
        <span className="text-[10px] uppercase tracking-widest text-[#8c2d19] bg-white px-3.5 py-1 rounded-full font-black border border-[#e8dac5] shadow-2xs inline-flex items-center gap-1">
          <Mail className="w-3 h-3 text-[#8c2d19]" /> BẢN TIN VĂN HÓA ĐỌC
        </span>
        <h2 className="font-serif font-black text-2xl sm:text-4xl text-slate-900">
          Tuyển Tập Sách Mới &amp; Quà Tặng Mỗi Tuần
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
          Đăng ký để nhận thông báo sớm nhất về các đợt phát hành ấn bản giới hạn, mã giảm giá độc quyền và lịch giao lưu tác giả tại hệ thống Melio.
        </p>

        {subscribed ? (
          <div className="p-4 rounded-2xl bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>Cảm ơn bạn! Melio sẽ gửi bản tin mới nhất vào hòm thư của bạn.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto pt-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Nhập địa chỉ email của bạn..."
              className="flex-1 bg-white border border-slate-300 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
            />
            <button
              type="submit"
              className="px-6 py-3 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] text-white font-bold text-xs shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer shrink-0"
            >
              Nhận Tin Mới
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

export function ShopFooter({ activeStoreName }: { activeStoreName: string }) {
  return (
    <footer className="mt-20 bg-white text-slate-600 border-t border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="size-11 rounded-2xl bg-gradient-to-tr from-[#8c2d19] via-[#a63a1f] to-[#d97706] text-white flex items-center justify-center shadow-md">
              <BookOpen className="w-6 h-6" />
            </div>
            <span className="font-serif font-black text-2xl text-slate-900">Melio Flagship</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Không gian văn hóa đọc và hiệu sách tuyển chọn kết nối trực tiếp với từng chi nhánh vật lý, nâng niu từng ấn bản trao tận tay bạn đọc.
          </p>
          <div className="pt-2 text-xs text-slate-500 space-y-1">
            <p>📍 Chi nhánh Nguyễn Huệ: 124 Nguyễn Huệ, Quận 1, TP.HCM</p>
            <p>📍 Chi nhánh Hoàn Kiếm: 45 Đinh Lễ, Hoàn Kiếm, Hà Nội</p>
          </div>
        </div>

        <div>
          <h4 className="font-bold text-sm text-slate-900 mb-3">Dịch Vụ Độc Quyền</h4>
          <ul className="space-y-2 text-xs text-slate-500">
            <li>• Tra cứu vị trí kệ sách tại chi nhánh</li>
            <li>• Đọc thử trích đoạn sách 3D lật trang</li>
            <li>• Gói quà Vintage &amp; Thiệp viết tay</li>
            <li>• Giao hàng hỏa tốc COD 1-3 ngày toàn quốc</li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold text-sm text-slate-900 mb-3">Hỗ Trợ Bạn Đọc</h4>
          <ul className="space-y-2 text-xs text-slate-500">
            <li>• Hướng dẫn mua hàng &amp; Thanh toán COD</li>
            <li>• Đổi trả ấn bản lỗi trong vòng 7 ngày</li>
            <li>• Đăng ký vé tham gia Workshop tác giả</li>
            <li>
              • Tra cứu hành trình vận đơn{" "}
              <Link href="/track" className="underline text-[#8c2d19] hover:text-[#6b2113] font-bold">trực tuyến</Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold text-sm text-slate-900 mb-3">Tổng Đài Thủ Thư</h4>
          <div className="p-4 rounded-2xl bg-gradient-to-br from-[#faf4ea] to-[#f3e5d0] border border-[#e8dac5] space-y-2 text-xs">
            <div className="flex items-center gap-2 text-[#8c2d19] font-black text-sm">
              <Phone className="w-4 h-4" /> 1900 6868 (8:00 - 21:30)
            </div>
            <p className="text-slate-600">
              Chi nhánh đang kết nối: <b className="text-slate-900">{activeStoreName}</b>
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 py-6 text-center text-xs text-slate-400 font-medium">
        © 2026 Melio Bookstore · Hiệu Sách Tri Thức &amp; Nghệ Thuật Đọc
      </div>
    </footer>
  );
}
