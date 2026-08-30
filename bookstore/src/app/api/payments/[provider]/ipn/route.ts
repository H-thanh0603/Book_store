// Provider-agnostic IPN. Dispatch to the right `settleXxx` based on
// the path segment, fan the result out to the generic webhook bus
// so payment.completed/failed reaches every subscriber (MISA, owner
// mobile). VNPay's old path is kept as a backward-compat alias.

import { NextRequest, NextResponse } from "next/server";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { settleVnpayResponse } from "@/lib/vnpay";
import { settleMomoResponse } from "@/lib/momo";
import { settleZaloPayResponse } from "@/lib/zalopay";
import { emit } from "@/lib/webhook-bus";

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  await enforceRateLimit(`${provider}-ipn`, clientIp(req.headers), 60, 60_000);
  if (provider === "vnpay") {
    const result = await settleVnpayResponse(req.nextUrl.searchParams);
    const txnRef = req.nextUrl.searchParams.get("vnp_TxnRef") ?? "unknown";
    const completed = result.settled === "PAID";
    emit({
      eventId: `vnpay:${completed ? "completed" : "failed"}:${txnRef}`,
      eventType: completed ? "payment.completed" : "payment.failed",
      orgId: "default",
      payload: { provider: "vnpay", orderId: result.orderId ?? null, rspCode: result.rspCode, message: result.message },
    }).catch((err) =>
      console.error(JSON.stringify({ level: "error", event: "webhook_emit_failed", message: err?.message }))
    );
    return NextResponse.json({ RspCode: result.rspCode, Message: result.message }, { status: result.ok ? 200 : 400 });
  }
  return NextResponse.json({ error: "Unknown provider for GET" }, { status: 400 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  await enforceRateLimit(`${provider}-ipn`, clientIp(req.headers), 60, 60_000);
  if (provider === "momo") {
    const result = await settleMomoResponse(req.nextUrl.searchParams);
    const txnRef = req.nextUrl.searchParams.get("orderId") ?? "unknown";
    const completed = result.settled === "PAID";
    emit({
      eventId: `momo:${completed ? "completed" : "failed"}:${txnRef}`,
      eventType: completed ? "payment.completed" : "payment.failed",
      orgId: "default",
      payload: { provider: "momo", orderId: result.orderId ?? null, rspCode: result.rspCode, message: result.message },
    }).catch((err) =>
      console.error(JSON.stringify({ level: "error", event: "webhook_emit_failed", message: err?.message }))
    );
    return NextResponse.json(result, { status: result.ok ? 204 : 400 });
  }
  if (provider === "zalopay") {
    const raw = await req.text();
    const parsed = (() => { try { return JSON.parse(raw); } catch { return {}; } })() as { data?: Record<string, unknown>; mac?: string };
    const result = await settleZaloPayResponse(raw, parsed);
    const appTransId = String((parsed.data as { app_trans_id?: string } | undefined)?.app_trans_id ?? "unknown");
    const completed = result.settled === "PAID";
    emit({
      eventId: `zalopay:${completed ? "completed" : "failed"}:${appTransId}`,
      eventType: completed ? "payment.completed" : "payment.failed",
      orgId: "default",
      payload: { provider: "zalopay", appTransId, returnCode: result.return_code, message: result.return_message },
    }).catch((err) =>
      console.error(JSON.stringify({ level: "error", event: "webhook_emit_failed", message: err?.message }))
    );
    return NextResponse.json(result, { status: result.return_code === 1 ? 200 : 400 });
  }
  return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
}
