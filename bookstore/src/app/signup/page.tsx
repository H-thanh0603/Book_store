import SignupForm from "./SignupForm";

export const metadata = { title: "Đăng ký dùng thử — Melio Bookstore" };

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-[#fbf9f5] flex items-center justify-center p-4 font-serif">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <span className="text-[10px] uppercase tracking-widest text-[#8c2d19] bg-[#faf4ea] px-2.5 py-0.5 rounded font-bold border border-[#e8dac5]">
            Dùng thử 14 ngày miễn phí
          </span>
          <h1 className="font-black text-2xl sm:text-3xl text-slate-900 mt-3">Mở nhà sách trên Melio</h1>
          <p className="text-xs text-slate-500 mt-1">POS, kho, hóa đơn điện tử, MISA — tất cả trong một.</p>
        </div>
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-[#ede5d8]">
          <SignupForm />
        </div>
      </div>
    </main>
  );
}
