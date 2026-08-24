// Sections 11–15: BLOG, VOUCHER HUB, NEWSLETTER, FOOTER (static editorial blocks)
import Link from "next/link";
import { ArrowRight, BookOpen, Phone } from "lucide-react";
import type { BlogArticle, Voucher } from "./types";

export function BlogSection({ articles }: { articles: BlogArticle[] }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between border-b border-[#ede5d8] pb-3">
        <div>
          <span className="text-[10px] font-serif uppercase tracking-widest text-[#8c2d19] font-bold">
            TẠP CHÍ VĂN HÓA ĐỌC
          </span>
          <h2 className="font-serif font-black text-2xl text-slate-900 mt-0.5">
            Bản Tin Tri Thức &amp; Góc Bình Luận Sách
          </h2>
        </div>
        <span className="text-xs text-slate-500 font-serif italic">Tuyển tập bởi Ban Biên Tập Melio</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {articles.map((art) => (
          <div
            key={art.id}
            className="p-6 rounded-3xl bg-white paper-card shadow-xs space-y-3 font-serif flex flex-col justify-between hover:shadow-xl transition-all"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono font-bold text-amber-700">
                <span>{art.category}</span>
                <span className="text-slate-400">{art.readTime}</span>
              </div>
              <h3 className="font-black text-base text-slate-900 leading-snug hover:text-[#8c2d19] transition-colors cursor-pointer">
                {art.title}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed italic">&ldquo;{art.snippet}&rdquo;</p>
            </div>
            <div className="pt-3 border-t border-[#ede5d8] flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>{art.date}</span>
              <span className="text-[#8c2d19] font-serif font-bold flex items-center gap-1 cursor-pointer">
                Đọc tiếp <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function VoucherHub({ vouchers, onApply }: { vouchers: Voucher[]; onApply: (code: string) => void }) {
  return (
    <section className="rounded-3xl bg-[#1c1917] p-6 sm:p-10 text-white shadow-xl space-y-4 border border-white/10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <span className="text-[10px] font-serif uppercase tracking-widest text-amber-300 bg-white/10 px-3 py-1 rounded-full font-bold">
            KHO VOUCHER ĐỘC QUYỀN
          </span>
          <h2 className="font-serif font-black text-2xl sm:text-3xl mt-1 tracking-tight">
            Ưu Đãi Đặc Quyền Của Bạn Hôm Nay
          </h2>
        </div>
        <p className="text-xs text-slate-400 font-serif italic">
          Bấm sao chép mã và hệ thống sẽ tự động áp dụng tại bước thanh toán COD
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {vouchers.map((v) => (
          <div
            key={v.code}
            className="p-5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-3 group hover:bg-white/10 transition-all font-serif"
          >
            <div>
              <b className="block text-base font-bold text-white">{v.title}</b>
              <span className="text-xs text-slate-300">{v.desc}</span>
              <div className="mt-2 text-[11px] font-mono bg-black/40 px-2 py-0.5 rounded text-amber-300 inline-block font-bold">
                MÃ: {v.code}
              </div>
            </div>
            <button
              onClick={() => onApply(v.code)}
              className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold text-xs shadow-md transition-all hover:scale-105 shrink-0"
            >
              Sao chép
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function NewsletterBox() {
  return (
    <section className="rounded-3xl bg-[#faf4ea] p-8 sm:p-12 border border-[#e8dac5] shadow-xs text-center space-y-4">
      <div className="max-w-xl mx-auto space-y-2">
        <span className="text-[10px] font-serif uppercase tracking-widest text-[#8c2d19] font-bold">
          BẢN TIN VĂN HÓA ĐỌC
        </span>
        <h2 className="font-serif font-black text-2xl sm:text-3xl text-slate-900">Tuyển Tập Sách Mới Mỗi Tuần</h2>
        <p className="text-xs text-slate-600 font-serif italic">
          Danh sách ấn phẩm tuyển chọn được cập nhật trực tiếp trên trang này mỗi tuần.
          Ưu đãi theo chiến dịch được công bố tại quầy và trên các kênh chính thức của cửa hàng.
        </p>
      </div>
    </section>
  );
}

export function ShopFooter({ activeStoreName }: { activeStoreName: string }) {
  return (
    <footer className="mt-20 bg-[#1c1917] text-[#e7ded1] border-t border-white/10 font-serif">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="size-10 rounded-2xl bg-[#8c2d19] text-white flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <span className="font-serif font-black text-2xl text-white">Melio Flagship</span>
          </div>
          <p className="text-xs text-[#b8ab97] leading-relaxed">
            Không gian văn hóa đọc và hiệu sách tuyển chọn kết nối trực tiếp với từng chi nhánh vật lý, nâng niu từng ấn bản trao tận tay bạn đọc.
          </p>
          <div className="pt-2 text-xs text-[#a3947e] space-y-1">
            <p>📍 Chi nhánh Nguyễn Huệ: 124 Nguyễn Huệ, Quận 1, TP.HCM</p>
            <p>📍 Chi nhánh Hoàn Kiếm: 45 Đinh Lễ, Hoàn Kiếm, Hà Nội</p>
          </div>
        </div>

        <div>
          <h4 className="font-bold text-sm text-white mb-3">Dịch Vụ Độc Quyền</h4>
          <ul className="space-y-2 text-xs text-[#b8ab97]">
            <li>• Tra cứu vị trí kệ sách tại chi nhánh</li>
            <li>• Đọc thử trích đoạn sách 3D lật trang</li>
            <li>• Gói quà Vintage &amp; Thiệp viết tay</li>
            <li>• Giao hàng hỏa tốc COD 1-3 ngày toàn quốc</li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold text-sm text-white mb-3">Hỗ Trợ Bạn Đọc</h4>
          <ul className="space-y-2 text-xs text-[#b8ab97]">
            <li>• Hướng dẫn mua hàng &amp; Thanh toán COD</li>
            <li>• Đổi trả ấn bản lỗi trong vòng 7 ngày</li>
            <li>• Đăng ký vé tham gia Workshop tác giả</li>
            <li>
              • Tra cứu hành trình vận đơn{" "}
              <Link href="/track" className="underline hover:text-white">trực tuyến</Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold text-sm text-white mb-3">Tổng Đài Thủ Thư</h4>
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-amber-300 font-bold">
              <Phone className="w-4 h-4" /> 1900 6868 (8:00 - 21:30)
            </div>
            <p className="text-[#a3947e]">
              Chi nhánh đang trực tuyến: <b>{activeStoreName}</b>
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 py-5 text-center text-xs text-[#a3947e]">
        © 2026 Melio Bookstore · Hiệu Sách Tri Thức &amp; Nghệ Thuật Đọc
      </div>
    </footer>
  );
}
