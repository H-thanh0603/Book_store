"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Store,
  ShoppingBag,
  BookOpen,
  Boxes,
  Truck,
  ArrowLeftRight,
  Users,
  Tag,
  Gift,
  ShieldCheck,
  Activity,
  LogOut,
  Menu,
  X,
  Sparkles,
  Barcode,
  ClipboardCheck,
  Building2,
  ChevronDown,
} from "lucide-react";

type AuthUser = {
  userId?: string;
  email?: string;
  roles?: { role: string; storeId: string | null }[];
  anonymous?: boolean;
};

type NavGroup = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; highlight?: boolean }[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Bán hàng",
    icon: Store,
    items: [
      { href: "/pos", label: "POS Bán Hàng", icon: Store, highlight: true },
      { href: "/orders", label: "Đơn hàng", icon: ShoppingBag },
    ],
  },
  {
    label: "Sản phẩm",
    icon: BookOpen,
    items: [
      { href: "/products", label: "Danh mục", icon: BookOpen },
      { href: "/products/barcodes", label: "In tem", icon: Barcode },
    ],
  },
  {
    label: "Kho vận",
    icon: Boxes,
    items: [
      { href: "/inventory", label: "Tồn kho", icon: Boxes },
      { href: "/inventory/counts", label: "Kiểm kê", icon: ClipboardCheck },
      { href: "/purchase-orders", label: "Nhập hàng", icon: Truck },
      { href: "/suppliers", label: "NCC", icon: Building2 },
      { href: "/transfers", label: "Điều chuyển", icon: ArrowLeftRight },
    ],
  },
  {
    label: "Khách hàng",
    icon: Users,
    items: [
      { href: "/customers", label: "Khách hàng", icon: Users },
      { href: "/promotions", label: "Khuyến mãi", icon: Tag },
      { href: "/gift-cards", label: "Gift Card", icon: Gift },
    ],
  },
  {
    label: "Quản trị",
    icon: ShieldCheck,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/reports", label: "Báo cáo", icon: Activity },
      { href: "/audit-logs", label: "Audit log", icon: ShieldCheck },
    ],
  },
];

export default function Nav() {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !data.anonymous) setUser(data);
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    router.push("/login");
  }

  const roleName = user?.roles?.[0]?.role ?? "STAFF";

  return (
    <header className="sticky top-0 z-40 bg-[#fbf8f3]/95 backdrop-blur-md border-b border-[#ede5d8] shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2.5 group transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-[#1c1917] flex items-center justify-center text-[#ffd56a] shadow-md group-hover:scale-105 transition-transform">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-lg text-[#1c1917] tracking-tight flex items-center gap-1.5">
                  Melio Books
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#faf4ea] text-[#8c2d19] border border-[#ede5d8]">
                    PRO
                  </span>
                </span>
                <p className="text-[11px] text-[#574431] font-medium -mt-1 hidden sm:block">
                  Hệ thống quản lý bán lẻ
                </p>
              </div>
            </Link>
          </div>

          {/* Desktop Nav - Grouped */}
          <nav className="hidden xl:flex items-center gap-1 overflow-x-auto py-1">
            {NAV_GROUPS.map((group) => {
              const isGroupActive = group.items.some((item) => path === item.href);
              const isGroupOpen = openGroup === group.label;
              const GroupIcon = group.icon;
              return (
                <div key={group.label} className="relative">
                  <button
                    onClick={() => setOpenGroup(isGroupOpen ? null : group.label)}
                    onMouseEnter={() => setOpenGroup(group.label)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isGroupActive
                        ? "bg-[#8c2d19] text-white shadow-sm"
                        : "text-[#574431] hover:text-[#1c1917] hover:bg-[#faf4ea]"
                    }`}
                  >
                    <GroupIcon className="w-3.5 h-3.5" />
                    <span>{group.label}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${isGroupOpen ? "rotate-180" : ""}`} />
                  </button>

                  {/* Dropdown */}
                  {isGroupOpen && (
                    <div
                      className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-[#ede5d8] py-1.5 min-w-[160px] z-50"
                      onMouseLeave={() => setOpenGroup(null)}
                    >
                      {group.items.map((item) => {
                        const ItemIcon = item.icon;
                        const isActive = path === item.href;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setOpenGroup(null)}
                            className={`flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${
                              isActive
                                ? "bg-[#8c2d19] text-white"
                                : item.highlight
                                ? "text-[#8c2d19] font-semibold hover:bg-[#faf4ea]"
                                : "text-[#574431] hover:bg-[#faf4ea] hover:text-[#1c1917]"
                            }`}
                          >
                            <ItemIcon className="w-3.5 h-3.5" />
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* User Profile & Actions */}
          <div className="flex items-center gap-3">
            {user?.email ? (
              <div className="flex items-center gap-2">
                <div className="hidden md:flex flex-col text-right">
                  <span className="text-xs font-semibold text-[#1c1917] max-w-[140px] truncate">
                    {user.email}
                  </span>
                  <span className="text-[10px] text-[#8c2d19] font-medium uppercase tracking-wider">
                    {roleName}
                  </span>
                </div>
                <div className="w-8 h-8 rounded-full bg-[#faf4ea] border border-[#ede5d8] flex items-center justify-center text-[#1c1917] font-bold text-xs uppercase">
                  {user.email.slice(0, 2)}
                </div>
                <button
                  onClick={handleLogout}
                  title="Đăng xuất"
                  className="w-10 h-10 flex items-center justify-center text-[#574431] hover:text-[#c83f49] hover:bg-red-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#8c2d19] hover:bg-[#7a2816] text-white px-3 py-1.5 rounded-lg shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Đăng nhập
              </Link>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="xl:hidden w-10 h-10 flex items-center justify-center text-[#574431] hover:bg-[#faf4ea] rounded-lg"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Sub-nav bar for large screens under XL */}
        <div className="hidden md:flex xl:hidden overflow-x-auto gap-1 py-2 border-t border-[#ede5d8]">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-[#574431]/60 uppercase tracking-wider px-1.5">
                {group.label}
              </span>
              {group.items.map((item) => {
                const ItemIcon = item.icon;
                const isActive = path === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-1.5 px-2.5 py-1.2 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                      isActive
                        ? "bg-[#8c2d19] text-white"
                        : item.highlight
                        ? "bg-[#faf4ea] text-[#8c2d19] font-semibold"
                        : "text-[#574431] hover:bg-[#faf4ea]"
                    }`}
                  >
                    <ItemIcon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="xl:hidden bg-[#fbf8f3] border-b border-[#ede5d8] px-4 pt-2 pb-4 space-y-1">
          {NAV_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            return (
              <div key={group.label} className="mb-3">
                <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-[#574431]/60 uppercase tracking-wider">
                  <GroupIcon className="w-3 h-3" />
                  {group.label}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.items.map((item) => {
                    const ItemIcon = item.icon;
                    const isActive = path === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
                          isActive
                            ? "bg-[#8c2d19] text-white"
                            : item.highlight
                            ? "bg-[#faf4ea] text-[#8c2d19] font-semibold"
                            : "text-[#1c1917] hover:bg-[#faf4ea]"
                        }`}
                      >
                        <ItemIcon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </header>
  );
}

