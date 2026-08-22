import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import Nav from "./nav";

export default async function Home() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-2">Hệ thống quản lý bán lẻ</h1>
        <p className="text-slate-600">Roles: {auth.roles.map((r) => r.role).join(", ")}</p>
      </div>
    </main>
  );
}
