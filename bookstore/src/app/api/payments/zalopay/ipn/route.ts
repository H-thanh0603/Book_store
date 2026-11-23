import { NextRequest, NextResponse } from "next/server";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { settleZaloPayResponse } from "@/lib/zalopay";
import { emit } from "@/lib/webhook-bus";
import { prisma } from "@/lib/db";

/**
 * ZaloPay IPN (JSON POST). Answers {return_code, return_message} and fans out
 * verified settlement results to the webhook bus.
 */
export async function POST(req: NextRequest) {
  try {
    await enforceRateLimit("zalopay-ipn", clientIp(req.headers), 60, 60_000);
    const rawBody = await req.text();
    let parsed: { data?: Record<string, unknown>; mac?: string };
    try {
      parsed = JSON.parse(rawBody || "{}") as { data?: Record<string, unknown>; mac?: string };
    } catch {
      return NextResponse.json({ return_code: -1, return_message: "Invalid JSON" }, { status: 400 });
    }
    const result = await settleZaloPayResponse(rawBody, parsed);
    const dataObj = (parsed.data ?? {}) as Record<string, string>;
    const txnRef = (dataObj.app_trans_id ?? "").includes("_")
      ? (dataObj.app_trans_id ?? "").split("_").slice(1).join("_")
      : (dataObj.app_trans_id ?? "");
    const completed = result.settled === "PAID";

    // settleZaloPayResponse only sets `settled` after MAC + amount verify.
    if (result.settled === "PAID" || result.settled === "FAILED") {
      const org = txnRef
        ? await prisma.webPayment.findUnique({
            where: { txnRef },
            select: { order: { select: { store: { select: { region: { select: { orgId: true } } } } } } },
          }).catch(() => null)
        : null;
      const emitOrgId = org?.order?.store?.region?.orgId ?? null;
      if (emitOrgId) {
        emit({
          eventId: `zalopay:${completed ? "completed" : "failed"}:${txnRef}`,
          eventType: completed ? "payment.completed" : "payment.failed",
          orgId: emitOrgId,
          payload: { provider: "zalopay", txnRef, return_code: result.return_code },
        }).catch((err) =>
          console.error(JSON.stringify({ level: "error", event: "webhook_emit_failed", message: String(err) }))
        );
      }
    }
    return NextResponse.json({ return_code: result.return_code, return_message: result.return_message });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 429) {
      return NextResponse.json({ return_code: -1, return_message: "Too many requests" }, { status: 429 });
    }
    return NextResponse.json({ return_code: 0, return_message: "Internal error" }, { status: 500 });
  }
}
