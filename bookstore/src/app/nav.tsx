"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: [string, string][] = [
  ["/dashboard", "Dashboard"],
  ["/pos", "POS"],
  ["/products", "Sản phẩm"],
  ["/inventory", "Tồn kho"],
  ["/purchase-orders", "Nhập hàng"],
  ["/transfers", "Điều chuyển"],
  ["/customers", "Khách hàng"],
  ["/audit-logs", "Audit log"],
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="bg-white border-b px-6 py-3 flex gap-5 items-center flex-wrap">
      <Link href="/" className="font-bold">📚 Nhà sách Melio</Link>
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href}
          className={path === href ? "text-blue-600 font-medium" : "hover:underline"}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
