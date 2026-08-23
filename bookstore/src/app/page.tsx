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
      color: "from-blue-600 to-indigo-600",
      badge: "Bán hàng",
      primary: true,
    },
    {
      title: "Bảng Điều Khiển",
      desc: "Doanh thu ngày/tháng, top sản phẩm bán chạy và cảnh báo tồn thấp",
      href: "/dashboard",
      icon: LayoutDashboard,
      color: "from-indigo-600 to-violet-600",
      badge: "Tổng quan",
    },
    {
      title: "Quản Lý Đơn Hàng",
      desc: "Xử lý đơn online, giao tận nơi, Click & Collect và đổi trả hàng",
      href: "/orders",
      icon: ShoppingBag,
      color: "from-emerald-600 to-teal-600",
      badge: "Đơn hàng",
    },
    {
      title: "Danh Mục Sản Phẩm",
      desc: "Tra cứu sách, tác giả, nhà xuất bản, mã vạch và biểu giá bán lẻ",
      href: "/products",
      icon: BookOpen,
      color: "from-amber-500 to-orange-600",
      badge: "Sản phẩm",
    },
    {
      title: "Quản Lý Tồn Kho",
      desc: "Tồn thực tế, khả dụng, tạm giữ và hàng hỏng trên toàn hệ thống kho",
      href: "/inventory",
      icon: Boxes,
      color: "from-cyan-600 to-blue-600",
      badge: "Kho vận",
    },
    {
      title: "Nhập Hàng (PO)",
      desc: "Tạo đơn đặt hàng NCC, phê duyệt quy trình và nhận hàng nhập kho",
      href: "/purchase-orders",
      icon: Truck,
      color: "from-violet-600 to-purple-600",
      badge: "Mua hàng",
    },
    {
      title: "Điều Chuyển Kho",
      desc: "Luân chuyển sách giữa các chi nhánh, duyệt xuất kho và nhận hàng",
      href: "/transfers",
      icon: ArrowLeftRight,
      color: "from-rose-500 to-pink-600",
      badge: "Điều phối",
    },
    {
      title: "Khách Hàng & Thành Viên",
      desc: "Hồ sơ khách hàng, phân hạng thành viên, tích lũy điểm và quà sinh nhật",
      href: "/customers",
      icon: Users,
      color: "from-blue-500 to-cyan-500",
      badge: "Loyalty",
    },
    {
      title: "Khuyến Mãi & Coupon",
      desc: "Chiết khấu %, giảm tiền mặt, combo Mua X tặng Y và mã giảm giá",
      href: "/promotions",
      icon: Tag,
      color: "from-fuchsia-600 to-rose-600",
      badge: "Marketing",
    },
    {
      title: "Gift Card & Kiểm Kê",
      desc: "Phát hành thẻ quà tặng, duyệt biên bản kiểm kê và trả hàng NCC",
      href: "/gift-cards",
      icon: Gift,
      color: "from-amber-600 to-yellow-500",
      badge: "Quản trị",
    },
    {
      title: "Vận Hành & Cảnh Báo",
      desc: "Giám sát tác vụ tự động (Jobs) và phát hiện bất thường thất thoát",
      href: "/reports",
      icon: Activity,
      color: "from-slate-700 to-slate-900",
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
    <main className="min-h-screen bg-slate-50/60 pb-16">
      <Nav />

      {/* Hero Welcome Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 sm:p-10 text-white shadow-xl">
          <div className="absolute right-0 top-0 -mt-8 -mr-8 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <Sparkles className="w-3.5 h-3.5" />
                Hệ thống Quản lý Bán lẻ Đa kênh Melio
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3" />
                Trạng thái: Hoạt động bình thường
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3 text-white">
              Xin chào, <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-blue-200">{auth.email}</span>!
            </h1>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-6">
              Hệ thống vận hành tổng thể cho chuỗi nhà sách và phong cách sống: POS thu ngân, tồn kho liên kho, đơn hàng đa kênh và quản trị khuyến mãi.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/pos"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all hover:translate-y-[-1px]"
              >
                <Store className="w-4 h-4" />
                Mở POS Bán hàng ngay
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/10 transition-all"
              >
                <TrendingUp className="w-4 h-4" />
                Xem Báo cáo Doanh thu
              </Link>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-300">Quyền hạn kích hoạt:</span>
              {auth.roles.map((r, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700 font-mono font-medium"
                >
                  {r.role}
                </span>
              ))}
            </div>
            <span>Thời gian máy chủ: {new Date().toLocaleDateString("vi-VN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
          </div>
        </div>
      </div>

      {/* Module Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Trung tâm nghiệp vụ &amp; Quản trị
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
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
                className="group relative flex flex-col justify-between p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all duration-200 hover:-translate-y-0.5"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={`w-11 h-11 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center text-white shadow-md shadow-indigo-500/10 group-hover:scale-110 transition-transform`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                      {m.badge}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-base group-hover:text-indigo-600 transition-colors flex items-center gap-1">
                    {m.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed line-clamp-2">
                    {m.desc}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-indigo-600 group-hover:text-indigo-700">
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

