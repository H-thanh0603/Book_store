"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";

// Agent 4: operations reporting — scheduled-job runs + loss alerts.
type Run = { id: string; kind: string; status: string; attempts: number; error: string | null; createdAt: string };
type Alert = { id: string; rule: string; severity: string; message: string; detectedAt: string };

export default function ReportsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const [jobs, loss] = await Promise.all([fetch("/api/jobs"), fetch("/api/loss-prevention")]);
    if (jobs.ok) setRuns((await jobs.json()).runs);
    else setErr((await jobs.json()).message ?? "jobs");
    if (loss.ok) setAlerts((await loss.json()).alerts);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch; setState fires after await
  useEffect(() => { void load(); }, []);

  async function retry(runId: string) {
    await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "retry", runId }) });
    void load();
  }
  async function dismiss(alertId: string) {
    await fetch("/api/loss-prevention", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "review", alertId, status: "DISMISSED" }) });
    void load();
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="p-6 space-y-6">
        {err && <p className="text-red-600">{err}</p>}
        <section>
          <h1 className="font-bold text-lg mb-2">Công việc định kỳ</h1>
          <div className="overflow-x-auto">
            <table className="bg-white rounded shadow text-sm w-full">
              <thead><tr className="text-left border-b"><th className="p-2">Loại</th><th>Trạng thái</th><th>Lần thử</th><th>Lỗi</th><th>Thời gian</th><th></th></tr></thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b">
                    <td className="p-2 font-mono">{run.kind}</td>
                    <td>{run.status === "FAILED" ? <span className="text-red-600">FAILED</span> : run.status}</td>
                    <td>{run.attempts}</td>
                    <td className="max-w-xs truncate" title={run.error ?? ""}>{run.error}</td>
                    <td>{new Date(run.createdAt).toLocaleString("vi-VN")}</td>
                    <td>{(run.status === "FAILED") && <button className="text-blue-600 underline" onClick={() => retry(run.id)}>Thử lại</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h1 className="font-bold text-lg mb-2">Cảnh báo tổn thất</h1>
          <div className="overflow-x-auto">
            <table className="bg-white rounded shadow text-sm w-full">
              <thead><tr className="text-left border-b"><th className="p-2">Quy tắc</th><th>Mức độ</th><th>Nội dung</th><th>Phát hiện</th><th></th></tr></thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id} className="border-b">
                    <td className="p-2">{alert.rule}</td>
                    <td className={alert.severity === "HIGH" ? "text-red-600" : "text-amber-600"}>{alert.severity}</td>
                    <td>{alert.message}</td>
                    <td>{new Date(alert.detectedAt).toLocaleString("vi-VN")}</td>
                    <td><button className="text-blue-600 underline" onClick={() => dismiss(alert.id)}>Bỏ qua</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
