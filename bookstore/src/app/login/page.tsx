"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email, password }),
    });
    if (res.ok) router.push("/");
    else setError((await res.json()).message ?? "Login failed");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <form onSubmit={submit} className="bg-white p-8 rounded-xl shadow-md w-96 space-y-4">
        <h1 className="text-xl font-bold">Nhà sách Melio — Đăng nhập</h1>
        <input className="w-full border rounded px-3 py-2" placeholder="Email" type="email"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full border rounded px-3 py-2" placeholder="Mật khẩu" type="password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button className="w-full bg-blue-600 text-white rounded py-2 hover:bg-blue-700">Đăng nhập</button>
        <p className="text-xs text-slate-500">Demo: owner@melio.vn / Passw0rd!</p>
      </form>
    </div>
  );
}
