"use client";
import { useEffect, useState } from "react";
import Nav from "../../nav";
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ClipboardCheck,
} from "lucide-react";

type Issue = {
  kind: "missing_description" | "missing_author" | "missing_barcodes" | "missing_price";
  productId: string;
  variantId: string | null;
  name: string;
  detail: string;
};

type Ref = { id: string; name: string };

const KIND_LABEL: Record<Issue["kind"], string> = {
  missing_description: "Thiếu mô tả",
  missing_author: "Sách thiếu tác giả",
  missing_barcodes: "Thiếu mã vạch",
  missing_price: "Thiếu giá bán",
};

export default function ListingHealthPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [authors, setAuthors] = useState<Ref[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [advice, setAdvice] = useState<string | null>(null);
  const [advising, setAdvising] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [ir, ar] = await Promise.all([
        fetch("/api/merchant/listing-issues"),
        fetch("/api/refs?kind=authors"),
      ]);
      if (ir.ok) setIssues((await ir.json()).issues ?? []);
      else setMsg({ text: (await ir.json()).message ?? "Lỗi tải danh sách", type: "error" });
      if (ar.ok) setAuthors((await ar.json()).authors ?? []);
    } catch {
      setMsg({ text: "Không thể kết nối đến máy chủ.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function keyOf(i: Issue) {
    return `${i.kind}:${i.productId}:${i.variantId ?? ""}`;
  }

  async function applyFix(i: Issue) {
    const v = (values[keyOf(i)] ?? "").trim();
    if (!v) {
      setMsg({ text: "Nhập/chọn giá trị sửa trước khi áp dụng.", type: "error" });
      return;
    }
    const body: Record<string, unknown> = { id: i.productId };
    if (i.kind === "missing_description") body.description = v;
    else if (i.kind === "missing_author") body.authorId = v;
    else if (i.kind === "missing_barcodes") body.newBarcode = { barcode: v, variantId: i.variantId, type: "INTERNAL" };
    else body.newPrice = { variantId: i.variantId, amountVnd: Number(v) };
    setBusyId(keyOf(i));
    try {
      const r = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-check": "1" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setMsg({ text: `Đã sửa: ${i.name}`, type: "success" });
        setIssues((prev) => prev.filter((x) => keyOf(x) !== keyOf(i)));
      } else {
        setMsg({ text: d.message ?? "Sửa thất bại", type: "error" });
      }
    } catch {
      setMsg({ text: "Không thể kết nối đến máy chủ.", type: "error" });
    } finally {
      setBusyId(null);
    }
  }

  async function advise() {
    setAdvising(true);
    try {
      const r = await fetch("/api/merchant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill: "catalog",
          messages: [{ role: "user", content: "Tóm tắt tình hình sức khỏe listing hiện tại." }],
          context: { openIssues: issues.length },
        }),
      });
      const d = await r.json();
      setAdvice(r.ok ? d.text : `Lỗi: ${d.message ?? r.status}`);
    } catch {
      setAdvice("Lỗi: không thể kết nối đến trợ lý.");
    } finally {
      setAdvising(false);
    }
  }

  const groups = (["missing_description", "missing_author", "missing_barcodes", "missing_price"] as const)
    .map((kind) => ({ kind, rows: issues.filter((i) => i.kind === kind) }))
    .filter((g) => g.rows.length > 0);

  function fixControl(i: Issue) {
    const k = keyOf(i);
    if (i.kind === "missing_description") {
      return (
        <input
          aria-label={`Nhập mô tả cho ${i.name}`}
          value={values[k] ?? ""}
          onChange={(e) => setValues((p) => ({ ...p, [k]: e.target.value }))}
          placeholder="Mô tả ngắn"
          className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-56"
        />
      );
    }
    if (i.kind === "missing_author") {
      return (
        <select
          aria-label={`Chọn tác giả cho ${i.name}`}
          value={values[k] ?? ""}
          onChange={(e) => setValues((p) => ({ ...p, [k]: e.target.value }))}
          className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs max-w-[180px]"
        >
          <option value="">— Chọn tác giả —</option>
          {authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      );
    }
    if (i.kind === "missing_barcodes") {
      return (
        <input
          aria-label={`Nhập mã vạch cho ${i.name}`}
          value={values[k] ?? ""}
          onChange={(e) => setValues((p) => ({ ...p, [k]: e.target.value }))}
          placeholder="Mã vạch / ISBN"
          className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-40 font-mono"
        />
      );
    }
    return (
      <input
        aria-label={`Nhập giá bán VND cho ${i.name}`}
        value={values[k] ?? ""}
        onChange={(e) => setValues((p) => ({ ...p, [k]: e.target.value.replace(/[^0-9]/g, "") }))}
        placeholder="Giá VND"
        inputMode="numeric"
        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-32 font-mono"
      />
    );
  }

  return (
    <main className="min-h-screen bg-slate-50/60 pb-16">
      <Nav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <ClipboardCheck className="w-6 h-6 text-indigo-600" aria-hidden="true" />
              Sức Khỏe Listing
            </h1>
            <p className="text-xs text-slate-500 mt-1">Từng lỗi sửa riêng, có audit log — AI không tự sửa giá hay tồn kho</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={advise}
              disabled={advising}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors disabled:opacity-50"
            >
              {advising ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />}
              Nhờ AI tóm tắt
            </button>
            <button
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
              Quét lại
            </button>
          </div>
        </div>

        {msg && (
          <div className={`p-3 rounded-xl flex items-center gap-2 text-xs font-medium ${msg.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
            {msg.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />}
            <span>{msg.text}</span>
          </div>
        )}

        {advice && (
          <div className="bg-white rounded-2xl border border-indigo-200/60 p-5 shadow-xs" role="status">
            <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 mb-2">Nhận định AI — đối chiếu từng dòng trước khi sửa</p>
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">{advice}</p>
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Đang quét catalogue…
          </div>
        ) : groups.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200/80">
            Catalogue sạch! Không thiếu nhóm hàng, tác giả, mã vạch hay giá nào.
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.kind} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h2 className="font-bold text-slate-900 text-sm">{KIND_LABEL[g.kind]} ({g.rows.length})</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {g.rows.map((i) => (
                  <div key={keyOf(i)} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{i.name}</p>
                      <p className="text-[11px] text-slate-500">{i.detail}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {fixControl(i)}
                      <button
                        onClick={() => void applyFix(i)}
                        disabled={busyId === keyOf(i)}
                        aria-label={`Áp dụng sửa cho ${i.name}`}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
                      >
                        {busyId === keyOf(i) ? "…" : "Áp dụng"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
