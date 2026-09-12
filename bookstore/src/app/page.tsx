import { redirect } from "next/navigation";
import type { Metadata } from "next";
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
  Receipt,
  MapPin,
  Sparkles,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Không gian làm việc",
  description: "Không gian làm việc nội bộ Melio Bookstore — dành cho nhân viên đã đăng nhập.",
  robots: { index: false, follow: false },
};

export default async function Home() {
  const auth = await getAuth();
  // Guests belong on the public storefront; only staff see the workspace.
  if (!auth) redirect("/shop");

  // Permission-gated workspace: each module lists the permission codes
  // (prisma seed ROLE_PERMS) that unlock it. E.g. cashier sees
  // POS/Orders/Products/Inventory/Customers/Gift cards; purchasing sees
  // PO/Inventory/Products; audit trail stays admin-only.
  const modules = [
    {
      title: "POS Thu Ngân",
      desc: "Bán hàng tại quầy, quét mã, mở/đóng ca, tích điểm và thanh toán QR",
      href: "/pos",
      icon: Store,
      color: "from-[#8c2d19] to-[#c83f49]",
      badge: "Bán hàng",
      primary: true,
      perms: ["pos.sell"],
    },
    {
      title: "Bảng Điều Khiển",
      desc: "Doanh thu ngày/tháng, top sản phẩm bán chạy và cảnh báo tồn thấp",
      href: "/dashboard",
      icon: LayoutDashboard,
      color: "from-[#8c2d19] to-[#7a2816]",
      badge: "Tổng quan",
      perms: ["reports.store.view", "reports.financial.view"],
    },
    {
      title: "Quản Lý Đơn Hàng",
      desc: "Xử lý đơn online, giao tận nơi và Click & Collect — xác nhận, giao và đổi trả trong một luồng",
      href: "/orders",
      icon: ShoppingBag,
      color: "from-[#8c2d19] to-[#d97706]",
      badge: "Đơn hàng",
      perms: ["pos.sell", "customer.view"],
    },
    {
      title: "Danh Mục Sản Phẩm",
      desc: "Tra cứu sách, tác giả, nhà xuất bản, mã vạch và biểu giá bán lẻ",
      href: "/products",
      icon: BookOpen,
      color: "from-[#d97706] to-[#b45309]",
      badge: "Sản phẩm",
      perms: ["product.view"],
    },
    {
      title: "Quản Lý Tồn Kho",
      desc: "Tồn thực tế, khả dụng, tạm giữ và hàng hỏng trên toàn hệ thống kho",
      href: "/inventory",
      icon: Boxes,
      color: "from-[#574431] to-[#44403c]",
      badge: "Kho vận",
      perms: ["inventory.view"],
    },
    {
      title: "Nhập Hàng (PO)",
      desc: "Tạo đơn đặt hàng NCC, phê duyệt quy trình và nhận hàng nhập kho",
      href: "/purchase-orders",
      icon: Truck,
      color: "from-[#d97706] to-[#b45309]",
      badge: "Mua hàng",
      perms: ["purchase.create", "purchase.view", "purchase.receive", "purchase.approve"],
    },
    {
      title: "Điều Chuyển Kho",
      desc: "Luân chuyển sách giữa các chi nhánh, duyệt xuất kho và nhận hàng",
      href: "/transfers",
      icon: ArrowLeftRight,
      color: "from-[#c83f49] to-[#e11d48]",
      badge: "Điều phối",
      perms: ["inventory.transfer"],
    },
    {
      title: "Khách Hàng & Thành Viên",
      desc: "Hồ sơ khách hàng, phân hạng thành viên, tích lũy điểm và quà sinh nhật",
      href: "/customers",
      icon: Users,
      color: "from-[#8c2d19] to-[#d97706]",
      badge: "Loyalty",
      perms: ["customer.view"],
    },
    {
      title: "Khuyến Mãi & Coupon",
      desc: "Chiết khấu %, giảm tiền mặt, combo Mua X tặng Y và mã giảm giá",
      href: "/promotions",
      icon: Tag,
      color: "from-[#c83f49] to-[#881337]",
      badge: "Marketing",
      perms: ["promotion.view", "promotion.manage"],
    },
    {
      title: "Hóa Đơn Bán Lẻ",
      desc: "Tra cứu hóa đơn VAT, xem chi tiết và yêu cầu hủy có xác nhận trước khi phát hành lại",
      href: "/invoices",
      icon: Receipt,
      color: "from-[#574431] to-[#1c1917]",
      badge: "Chứng từ",
      perms: ["reports.financial.view", "reports.store.view"],
    },
    {
      title: "Hệ Thống Chi Nhánh",
      desc: "Địa chỉ, giờ mở cửa, tiện ích và lịch workshop tại từng cửa hàng",
      href: "/stores",
      icon: MapPin,
      color: "from-[#574431] to-[#44403c]",
      badge: "Cửa hàng",
      perms: ["inventory.transfer", "admin.config", "settings.read"],
    },
    {
      title: "Thẻ Quà Tặng (Gift Card)",
      desc: "Phát hành thẻ quà, nạp thêm và đổi điểm — kiểm kê sách thực hiện tại Tồn kho › Kiểm kê",
      href: "/gift-cards",
      icon: Gift,
      color: "from-[#d97706] to-[#b45309]",
      badge: "Quản trị",
      perms: ["customer.view", "promotion.manage"],
    },
    {
      title: "Vận Hành & Cảnh Báo",
      desc: "Giám sát tác vụ nền và cảnh báo thất thoát — xem log trước khi thử lại tác vụ lỗi",
      href: "/reports",
      icon: Activity,
      color: "from-[#44403c] to-[#1c1917]",
      badge: "Vận hành",
      perms: ["reports.store.view", "reports.financial.view"],
    },
    {
      title: "Nhật Ký Audit Trail",
      desc: "Lịch sử thay đổi dữ liệu và hành động nhân viên — chỉ xem, không thể xóa hay sửa",
      href: "/audit-logs",
      icon: ShieldCheck,
      color: "from-[#44403c] to-[#1c1917]",
      badge: "Bảo mật",
      perms: ["admin.users", "admin.config"],
    },
  ];

  const userPerms = new Set(auth.roles.flatMap((r) => r.permissions ?? []));
  const visible = modules.filter((m) => m.perms.some((p) => userPerms.has(p)));
  const frequent = visible.slice(0, 4);
  const rest = visible.slice(4);

  return (
    <main id="workspace" aria-label="Không gian làm việc Melio" className="min-h-screen bg-[#faf7f2] pb-16">
      <Nav />

      {/* Hero Welcome Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="relative overflow-hidden rounded-3xl bg-[#1c1917] p-8 sm:p-10 text-white shadow-xl">
          <div aria-hidden="true" className="absolute right-0 top-0 -mt-8 -mr-8 size-96 bg-[#d97706]/20 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/25 text-white border border-white/30">
                <Sparkles aria-hidden="true" className="w-3.5 h-3.5 text-[#ffd56a]" />
                Không gian làm việc Melio — nội bộ nhân viên
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-400/40 text-white border border-emerald-200/50">
                <CheckCircle2 aria-hidden="true" className="w-3 h-3 text-white" />
                Trạng thái: Hoạt động bình thường
              </span>
            </div>

            <h1 className="font-serif text-3xl sm:text-4xl font-black tracking-tight mb-3 text-white">
              Không gian làm việc, <span className="text-[#ffd56a] break-all">{auth.email}</span>
            </h1>
            <p className="text-white/90 text-sm sm:text-base leading-relaxed mb-2 font-medium">
              Chọn 1 việc của ca này để bắt đầu — POS cho thu ngân, Dashboard cho quản lý, Tồn kho cho thủ kho.
            </p>
            <p className="text-white/70 text-xs leading-relaxed mb-6">
              Trang mua sách công khai nằm tại <Link href="/shop" className="underline underline-offset-2 hover:text-[#ffd56a] focus-visible:outline-2 focus-visible:outline-[#ffd56a]">/shop</Link> — trang này chỉ dành cho nhân viên đã đăng nhập.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/pos"
                aria-label="Mở POS bán hàng ngay"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold bg-white text-[#8c2d19] hover:bg-[#ffd56a] hover:text-[#1c1917] shadow-lg shadow-black/10 transition-all hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffd56a]"
              >
                <Store aria-hidden="true" className="w-4 h-4" />
                Mở POS Bán hàng ngay
                <ArrowRight aria-hidden="true" className="w-4 h-4" />
              </Link>
              <Link
                href="/dashboard"
                aria-label="Xem báo cáo doanh thu"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold bg-white/25 hover:bg-white/35 text-white border border-white/30 transition-all hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <TrendingUp aria-hidden="true" className="w-4 h-4" />
                Xem Báo cáo Doanh thu
              </Link>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-white/20 flex flex-wrap items-center justify-between gap-4 text-xs text-white/85">
            <div className="flex items-center gap-2" aria-label="Quyền hạn kích hoạt">
              <span className="font-bold">Quyền hạn:</span>
              {auth.roles.slice(0, 4).map((r, i) => (
                <span
                  key={i}
                  title={r.storeId ? `Vai trò ${r.role} tại cửa hàng ${r.storeId}` : `Vai trò ${r.role} toàn hệ thống`}
                  className="px-2.5 py-0.5 rounded-full bg-black/30 text-[#ffd56a] border border-white/25 font-mono font-bold"
                >
                  {r.role}
                </span>
              ))}
              {auth.roles.length > 4 && (
                <span className="text-white/70">+{auth.roles.length - 4} quyền khác</span>
              )}
            </div>
            <span className="font-medium">Ca làm việc theo giờ cửa hàng — xem chi tiết tại Dashboard</span>
          </div>
        </div>
      </div>

      {/* Module Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-serif text-xl font-bold text-[#1c1917] tracking-tight">
              Việc của ca này
            </h2>
            <p className="text-sm text-[#574431] mt-0.5">
              {visible.length === 0
                ? "Tài khoản của bạn chưa được gán quyền nào"
                : `Hiển thị ${visible.length}/${modules.length} phân hệ theo quyền của bạn — còn lại bị ẩn, không chỉ mờ`}
            </p>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="rounded-2xl bg-white border border-[#ede5d8] p-8 text-center" role="status">
            <ShieldCheck aria-hidden="true" className="w-8 h-8 mx-auto mb-3 text-[#8c2d19]" />
            <p className="font-serif font-bold text-[#1c1917]">Chưa có quyền truy cập phân hệ nào</p>
            <p className="text-sm text-[#574431] mt-1">
              Liên hệ quản lý hoặc chủ hệ thống để được gán vai trò (thu ngân, kho, quản lý…).
              Trang mua sách công khai vẫn ở <Link href="/shop" className="underline underline-offset-2 text-[#8c2d19]">/shop</Link>.
            </p>
          </div>
        ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5" aria-label="Việc thường dùng">
          {frequent.map((m, idx) => {
            const Icon = m.icon;
            return (
              <Link
                key={idx}
                href={m.href}
                aria-label={`${m.title} — ${m.desc}`}
                className="group relative flex flex-col justify-between p-5 rounded-2xl bg-white border border-[#ede5d8] shadow-[0_1px_2px_rgba(28,25,23,0.06),0_8px_24px_-12px_rgba(140,45,25,0.25)] hover:shadow-[0_2px_4px_rgba(28,25,23,0.08),0_16px_32px_-12px_rgba(140,45,25,0.3)] hover:border-[#8c2d19]/30 transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8c2d19]"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={`w-11 h-11 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center text-white shadow-md shadow-[#8c2d19]/10 group-hover:scale-110 transition-transform`}
                    >
                      <Icon aria-hidden="true" className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#faf4ea] text-[#574431] group-hover:bg-[#8c2d19]/10 group-hover:text-[#8c2d19] transition-colors">
                      {m.badge}
                    </span>
                  </div>
                  <h3 className="font-serif font-bold text-[#1c1917] text-base group-hover:text-[#8c2d19] transition-colors flex items-center gap-1">
                    {m.title}
                  </h3>
                  <p className="text-sm text-[#574431] mt-1.5 leading-relaxed line-clamp-2">
                    {m.desc}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-[#ede5d8] flex items-center justify-between text-xs font-semibold text-[#8c2d19] group-hover:text-[#7a2816]">
                  <span>Truy cập</span>
                  <ArrowRight aria-hidden="true" className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>

        {rest.length > 0 && (
        <>
        <h3 className="mt-10 mb-1 text-sm font-bold uppercase tracking-wider text-[#574431]">
          Tất cả nghiệp vụ
        </h3>
        <p className="text-xs text-[#574431]/80 mb-4">Đầy đủ phân hệ — dùng điều hướng nhóm Bán hàng / Kho vận / Quản trị khi cần.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5" aria-label="Tất cả nghiệp vụ">
          {rest.map((m, idx) => {
            const Icon = m.icon;
            return (
              <Link
                key={idx}
                href={m.href}
                aria-label={`${m.title} — ${m.desc}`}
                className="group relative flex flex-col justify-between p-5 rounded-2xl bg-white border border-[#ede5d8] shadow-[0_1px_2px_rgba(28,25,23,0.05)] hover:shadow-md hover:border-[#8c2d19]/30 transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8c2d19]"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={`w-11 h-11 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center text-white shadow-md shadow-[#8c2d19]/10 group-hover:scale-110 transition-transform`}
                    >
                      <Icon aria-hidden="true" className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#faf4ea] text-[#574431] group-hover:bg-[#8c2d19]/10 group-hover:text-[#8c2d19] transition-colors">
                      {m.badge}
                    </span>
                  </div>
                  <h4 className="font-serif font-bold text-[#1c1917] text-base group-hover:text-[#8c2d19] transition-colors flex items-center gap-1">
                    {m.title}
                  </h4>
                  <p className="text-sm text-[#574431] mt-1.5 leading-relaxed line-clamp-2">
                    {m.desc}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-[#ede5d8] flex items-center justify-between text-xs font-semibold text-[#8c2d19] group-hover:text-[#7a2816]">
                  <span>Truy cập</span>
                  <ArrowRight aria-hidden="true" className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>
        </>
        )}
        </>
        )}
      </div>
    </main>
  );
}

