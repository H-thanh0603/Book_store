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
} from "lucide-react";

type AuthUser = {
  userId?: string;
  email?: string;
  roles?: { role: string; storeId: string | null }[];
  anonymous?: boolean;
};

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pos", label: "POS Bán Hàng", icon: Store, highlight: true },
  { href: "/orders", label: "Đơn hàng", icon: ShoppingBag },
  { href: "/products", label: "Sản phẩm", icon: BookOpen },
  { href: "/products/barcodes", label: "In tem", icon: Barcode },
  { href: "/inventory", label: "Tồn kho", icon: Boxes },
  { href: "/purchase-orders", label: "Nhập hàng", icon: Truck },
  { href: "/transfers", label: "Điều chuyển", icon: ArrowLeftRight },
  { href: "/customers", label: "Khách hàng", icon: Users },
  { href: "/promotions", label: "Khuyến mãi", icon: Tag },
  { href: "/gift-cards", label: "Gift & Kiểm kê", icon: Gift },
  { href: "/reports", label: "Vận hành", icon: Activity },
  { href: "/audit-logs", label: "Audit log", icon: ShieldCheck },
];

export default function Nav() {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

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
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2.5 group transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-blue-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-lg text-slate-900 tracking-tight flex items-center gap-1.5">
                  Melio Books
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                    PRO
                  </span>
                </span>
                <p className="text-[11px] text-slate-500 font-medium -mt-1 hidden sm:block">
                  Hệ thống quản lý bán lẻ
                </p>
              </div>
            </Link>
          </div>

          {/* Desktop Nav Items */}
          <nav className="hidden xl:flex items-center gap-1 overflow-x-auto py-1">
            {LINKS.map(({ href, label, icon: Icon, highlight }) => {
              const active = path === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    active
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/20"
                      : highlight
                      ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold border border-indigo-200/50"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${active ? "text-white" : ""}`} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User Profile & Actions */}
          <div className="flex items-center gap-3">
            {user?.email ? (
              <div className="flex items-center gap-2">
                <div className="hidden md:flex flex-col text-right">
                  <span className="text-xs font-semibold text-slate-800 max-w-[140px] truncate">
                    {user.email}
                  </span>
                  <span className="text-[10px] text-indigo-600 font-medium uppercase tracking-wider">
                    {roleName}
                  </span>
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-bold text-xs uppercase">
                  {user.email.slice(0, 2)}
                </div>
                <button
                  onClick={handleLogout}
                  title="Đăng xuất"
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Đăng nhập
              </Link>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="xl:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Sub-nav bar for large screens under XL */}
        <div className="hidden md:flex xl:hidden overflow-x-auto gap-1 py-2 border-t border-slate-100">
          {LINKS.map(({ href, label, icon: Icon, highlight }) => {
            const active = path === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-2.5 py-1.2 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                  active
                    ? "bg-indigo-600 text-white"
                    : highlight
                    ? "bg-indigo-50 text-indigo-700 font-semibold"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="xl:hidden bg-white border-b border-slate-200 px-4 pt-2 pb-4 space-y-1">
          <div className="grid grid-cols-2 gap-1.5 py-2">
            {LINKS.map(({ href, label, icon: Icon, highlight }) => {
              const active = path === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
                    active
                      ? "bg-indigo-600 text-white"
                      : highlight
                      ? "bg-indigo-50 text-indigo-700 font-semibold"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}

