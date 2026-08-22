import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";

export default async function Home() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  return (
    <main className="min-h-screen bg-slate-100">
      <nav className="bg-white border-b px-6 py-3 flex gap-6 items-center">
        <span className="font-bold">📚 Nhà sách Melio</span>
        <a href="/dashboard" className="hover:underline">Dashboard</a>
        <a href="/pos" className="hover:underline">POS</a>
        <a href="/products" className="hover:underline">Sản phẩm</a>
        <a href="/inventory" className="hover:underline">Tồn kho</a>
        <span className="ml-auto text-sm text-slate-600">{auth.email}</span>
      </nav>
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-2">Hệ thống quản lý bán lẻ</h1>
        <p className="text-slate-600">Roles: {auth.roles.map((r) => r.role).join(", ")}</p>
      </div>
    </main>
  );
}
