import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import Nav from "./nav";
import {
  Store,
  ShoppingBag,
  BookOpen,
  Boxes,
  Truck,
  ArrowLeftRight,
  Users,
  Tag,
  Gift,
  Activity,
  ShieldCheck,
  LayoutDashboard,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";

export default async function Home() {
  const auth = await getAuth();
  if (!auth) redirect("/login");

  const modules = [
    {
      title: "POS Thu Ngân",
      desc: "Bán hàng tại quầy, quét mã, mở/đóng ca, tích điểm và thanh toán QR",
      href: "/pos",
      icon: Store,
      color: "from-[#8c2d19] to-[#c83f49]",
      badge: "Bán hàng",
      primary: true,
    },
    {
      title: "Bảng Điều Khiển",
      desc: "Doanh thu ngày/tháng, top sản phẩm bán chạy và cảnh báo tồn thấp",
      href: "/dashboard",
      icon: LayoutDashboard,
      color: "from-[#8c2d19] to-[#7a2816]",
      badge: "Tổng quan",
    },
    {
      title: "Quản Lý Đơn Hàng",
      desc: "Xử lý đơn online, giao tận nơi, Click & Collect và đổi trả hàng",
      href: "/orders",
      icon: ShoppingBag,
      color: "from-[#14532d] to-[#166534]",
      badge: "Đơn hàng",
    },
    {
      title: "Danh Mục Sản Phẩm",
      desc: "Tra cứu sách, tác giả, nhà xuất bản, mã vạch và biểu giá bán lẻ",
      href: "/products",
      icon: BookOpen,
      color: "from-[#d97706] to-[#b45309]",
      badge: "Sản phẩm",
    },
    {
      title: "Quản Lý Tồn Kho",
      desc: "Tồn thực tế, khả dụng, tạm giữ và hàng hỏng trên toàn hệ thống kho",
      href: "/inventory",
      icon: Boxes,
      color: "from-[#574431] to-[#44403c]",
      badge: "Kho vận",
    },
    {
      title: "Nhập Hàng (PO)",
      desc: "Tạo đơn đặt hàng NCC, phê duyệt quy trình và nhận hàng nhập kho",
      href: "/purchase-orders",
      icon: Truck,
      color: "from-[#d97706] to-[#b45309]",
      badge: "Mua hàng",
    },
    {
      title: "Điều Chuyển Kho",
      desc: "Luân chuyển sách giữa các chi nhánh, duyệt xuất kho và nhận hàng",
      href: "/transfers",
      icon: ArrowLeftRight,
      color: "from-[#c83f49] to-[#e11d48]",
      badge: "Điều phối",
    },
    {
      title: "Khách Hàng & Thành Viên",
      desc: "Hồ sơ khách hàng, phân hạng thành viên, tích lũy điểm và quà sinh nhật",
      href: "/customers",
      icon: Users,
      color: "from-[#8c2d19] to-[#d97706]",
      badge: "Loyalty",
    },
    {
      title: "Khuyến Mãi & Coupon",
      desc: "Chiết khấu %, giảm tiền mặt, combo Mua X tặng Y và mã giảm giá",
      href: "/promotions",
      icon: Tag,
      color: "from-[#c83f49] to-[#881337]",
      badge: "Marketing",
    },
    {
      title: "Gift Card & Kiểm Kê",
      desc: "Phát hành thẻ quà tặng, duyệt biên bản kiểm kê và trả hàng NCC",
      href: "/gift-cards",
      icon: Gift,
      color: "from-[#d97706] to-[#f59e0b]",
      badge: "Quản trị",
    },
    {
      title: "Vận Hành & Cảnh Báo",
      desc: "Giám sát tác vụ tự động (Jobs) và phát hiện bất thường thất thoát",
      href: "/reports",
      icon: Activity,
      color: "from-[#44403c] to-[#1c1917]",
      badge: "Vận hành",
    },
    {
      title: "Nhật Ký Audit Trail",
      desc: "Theo dõi lịch sử thay đổi dữ liệu, hành động của nhân viên và bảo mật",
      href: "/audit-logs",
      icon: ShieldCheck,
      color: "from-slate-600 to-slate-800",
      badge: "Bảo mật",
    },
  ];

  return (
    <main className="min-h-screen bg-slate-50/70 pb-16">
      <Nav />

      {/* Hero Welcome Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-rose-600 via-orange-500 to-amber-500 p-8 sm:p-10 text-white shadow-xl">
          <div className="absolute right-0 top-0 -mt-8 -mr-8 size-96 bg-white/20 rounded-full blur-3xl pointer-events-none animate-pulse-glow" />
          <div className="relative z-10 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 backdrop-blur-xs text-white border border-white/30">
                <Sparkles className="w-3.5 h-3.5 text-yellow-200" />
                Hệ thống Quản lý Bán lẻ Đa kênh Melio
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/30 text-white border border-emerald-300/40">
                <CheckCircle2 className="w-3 h-3 text-emerald-200" />
                Trạng thái: Hoạt động bình thường
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-3 text-white drop-shadow-xs">
              Xin chào, <span className="text-yellow-200">{auth.email}</span>!
            </h1>
            <p className="text-white/95 text-sm sm:text-base leading-relaxed mb-6 font-medium">
              Hệ thống vận hành tổng thể cho chuỗi nhà sách và phong cách sống: POS thu ngân, tồn kho liên kho, đơn hàng đa kênh và quản trị khuyến mãi.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/pos"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold bg-white text-rose-600 hover:bg-yellow-200 hover:text-amber-950 shadow-lg shadow-black/10 transition-all hover:scale-105 active:scale-95"
              >
                <Store className="w-4 h-4" />
                Mở POS Bán hàng ngay
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold bg-white/20 hover:bg-white/30 text-white backdrop-blur-xs border border-white/30 transition-all hover:scale-105 active:scale-95"
              >
                <TrendingUp className="w-4 h-4" />
                Xem Báo cáo Doanh thu
              </Link>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-white/20 flex flex-wrap items-center justify-between gap-4 text-xs text-white/90">
            <div className="flex items-center gap-2">
              <span className="font-bold">Quyền hạn kích hoạt:</span>
              {auth.roles.map((r, i) => (
                <span
                  key={i}
                  className="px-2.5 py-0.5 rounded-full bg-black/20 text-yellow-200 border border-white/25 font-mono font-bold"
                >
                  {r.role}
                </span>
              ))}
            </div>
            <span className="font-medium">Thời gian máy chủ: {new Date().toLocaleDateString("vi-VN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
          </div>
        </div>
      </div>

      {/* Module Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-[#1c1917] tracking-tight">
              Trung tâm nghiệp vụ &amp; Quản trị
            </h2>
            <p className="text-xs text-[#574431] mt-0.5">
              Truy cập nhanh các phân hệ chức năng trong chuỗi bán lẻ
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {modules.map((m, idx) => {
            const Icon = m.icon;
            return (
              <Link
                key={idx}
                href={m.href}
                className="group relative flex flex-col justify-between p-5 rounded-2xl bg-white border border-[#ede5d8] shadow-xs hover:shadow-md hover:border-[#8c2d19]/30 transition-all duration-200 hover:-translate-y-0.5"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={`w-11 h-11 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center text-white shadow-md shadow-indigo-500/10 group-hover:scale-110 transition-transform`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#faf4ea] text-[#574431] group-hover:bg-[#8c2d19]/10 group-hover:text-[#8c2d19] transition-colors">
                      {m.badge}
                    </span>
                  </div>
                  <h3 className="font-bold text-[#1c1917] text-base group-hover:text-[#8c2d19] transition-colors flex items-center gap-1">
                    {m.title}
                  </h3>
                  <p className="text-xs text-[#574431] mt-1.5 leading-relaxed line-clamp-2">
                    {m.desc}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-[#ede5d8] flex items-center justify-between text-xs font-semibold text-[#8c2d19] group-hover:text-[#7a2816]">
                  <span>Truy cập</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}

