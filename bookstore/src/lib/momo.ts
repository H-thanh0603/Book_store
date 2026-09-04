// MoMo sandbox/wallet checkout. Spec v2 — HMAC-SHA256 over a canonical
// "key=value&key=value" string (sorted by key), hex digest. The create
// call sends the signature inside the JSON body; the IPN posts the
// same fields back and the receiver recomputes. Money is đồng
// (integer, no decimals). Settlement is idempotent on txnRef
// (== orderId) exactly like the VNPay path, with the same warning
// events for paid-after-cancel and duplicate callbacks.

import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { fail } from "./api";

const CREATE_URL = "https://test-payment.momo.vn/v2/gateway/api/create";

export function momoConfigured() {
  return Boolean(
    process.env.MOMO_PARTNER_CODE &&
    process.env.MOMO_ACCESS_KEY &&
    process.env.MOMO_SECRET_KEY &&
    process.env.MOMO_RETURN_URL &&
    process.env.MOMO_IPN_URL
  );
}

/** Sort-by-key, encodeURIComponent-on-both-sides, ampersand-joined. */
export function canonical(o: Record<string, string | number>): string {
  return Object.keys(o)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(o[k]))}`)
    .join("&");
}

export function momoHmac(secret: string, raw: string) {
  return createHmac("sha256", secret).update(raw).digest("hex");
}

/**
 * Create (or reuse) a PENDING WebPayment tagged provider="MOMO" and
 * return the deeplink URL the storefront should redirect to.
 * Idempotent on orderId like the VNPay path.
 */
export async function buildMomoUrl(order: { id: string; number: string; total: bigint }, baseUrl: string) {
  if (!momoConfigured()) fail(400, "VALIDATION", "MoMo is not configured");
  await prisma.webPayment.upsert({
    where: { orderId: order.id },
    update: { provider: "MOMO" },
    create: { orderId: order.id, txnRef: order.id, amount: order.total, provider: "MOMO" },
  });
  const requestId = `${order.id}-${Date.now()}`;
  const orderInfo = `Thanh toan ${order.number}`;
  const redirectUrl = new URL(process.env.MOMO_RETURN_URL!, baseUrl).toString();
  const ipnUrl = new URL(process.env.MOMO_IPN_URL!, baseUrl).toString();
  const raw = canonical({
    accessKey: process.env.MOMO_ACCESS_KEY!,
    amount: order.total.toString(),
    extraData: "",
    ipnUrl,
    orderId: order.id,
    orderInfo,
    partnerCode: process.env.MOMO_PARTNER_CODE!,
    redirectUrl,
    requestId,
    requestType: "captureWallet",
  });
  // (hmac → momoHmac: buildMomoUrl referenced a name that didn't exist — pre-existing runtime crash)
  const signature = momoHmac(process.env.MOMO_SECRET_KEY!, raw);
  const res = await fetch(CREATE_URL, {
    method: "POST",
    // PERF-001: no default timeout in undici — a hung MoMo endpoint would
    // pin the checkout worker indefinitely.
    signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      partnerCode: process.env.MOMO_PARTNER_CODE!,
      accessKey: process.env.MOMO_ACCESS_KEY!,
      requestId,
      amount: order.total.toString(),
      orderId: order.id,
      orderInfo,
      redirectUrl,
      ipnUrl,
      extraData: "",
      requestType: "captureWallet",
      signature,
      lang: "vi",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { payUrl?: string; resultCode?: number; message?: string };
  if (!res.ok || !data.payUrl)
    fail(502, "VALIDATION", "MoMo create failed", { status: res.status, data });
  return data.payUrl;
}

/**
 * Shared idempotent settlement. MoMo's IPN posts form-encoded params;
 * signature is in the `signature` field. After signature passes we
 * look up by orderId (= our txnRef) and apply the same `PAID | FAILED`
 * flip with the same `paid_after_cancel` / `duplicate_callback`
 * warnings the VNPay path emits, then fire e-invoice on first
 * success.
 */
export type MomoSettleResult = {
  ok: boolean;
  rspCode: string;
  message: string;
  orderId?: string;
  settled?: "PAID" | "FAILED" | "REFUND_REQUIRED" | "ALREADY_SETTLED";
};

export async function settleMomoResponse(searchParams: URLSearchParams): Promise<MomoSettleResult> {
  if (!process.env.MOMO_SECRET_KEY || !process.env.MOMO_ACCESS_KEY
      || !process.env.MOMO_IPN_URL || !process.env.MOMO_RETURN_URL) {
    return { ok: false, rspCode: "97", message: "MoMo not configured" };
  }
  const params: Record<string, string> = {};
  searchParams.forEach((v, k) => { params[k] = v; });
  const provided = params.signature ?? "";
  delete params.signature;

  const raw = canonical({
    accessKey: process.env.MOMO_ACCESS_KEY,
    amount: params.amount ?? "",
    extraData: params.extraData ?? "",
    ipnUrl: process.env.MOMO_IPN_URL,
    orderId: params.orderId ?? "",
    orderInfo: params.orderInfo ?? "",
    partnerCode: params.partnerCode ?? "",
    redirectUrl: process.env.MOMO_RETURN_URL,
    requestId: params.requestId ?? "",
    requestType: params.requestType ?? "",
  });
  const expected = momoHmac(process.env.MOMO_SECRET_KEY, raw);
  const a = Buffer.from(expected), b = Buffer.from(provided);
  if (!provided || a.length !== b.length || !timingSafeEqual(a, b))
    return { ok: false, rspCode: "97", message: "Invalid signature" };

  const payment = await prisma.webPayment.findUnique({ where: { txnRef: params.orderId ?? "" } });
  if (!payment) return { ok: false, rspCode: "01", message: "Unknown transaction" };
  if (BigInt(params.amount ?? "0") !== payment.amount)
    return { ok: false, rspCode: "04", message: "Amount mismatch" };
  if (payment.status !== "PENDING")
    return { ok: true, rspCode: "00", message: "Confirm Success", orderId: payment.orderId ?? undefined, settled: "ALREADY_SETTLED" };

  const success = Number(params.resultCode ?? "1") === 0;
  const orderId = payment.orderId ?? undefined;
  // Real transition CONFIRMED → PAID (see settleVnpayResponse): expiry and
  // manual cancel claim CONFIRMED rows, so a captured payment is safe. A lost
  // claim means the order is gone — record REFUND_REQUIRED, never PAID.
  let claimed = false;
  if (success && orderId) {
    const claim = await prisma.order.updateMany({
      where: { id: orderId, status: "CONFIRMED" },
      data: { status: "PAID" },
    });
    claimed = claim.count === 1;
    if (!claimed)
      console.warn(JSON.stringify({ event: "momo_paid_after_cancel", orderId }));
  }
  const captured = success && claimed;
  const settled = await prisma.webPayment.updateMany({
    where: { id: payment.id, status: "PENDING" },
    data: {
      status: !success ? "FAILED" : captured ? "PAID" : "REFUND_REQUIRED",
      responseCode: params.resultCode ?? null,
      rawParams: params,
      paidAt: success ? new Date() : null,
    },
  });
  if (settled.count === 0)
    console.info(JSON.stringify({ event: "momo_duplicate_callback", txnRef: payment.txnRef }));
  if (success && !captured)
    console.error(JSON.stringify({ level: "error", event: "momo_refund_required", orderId, txnRef: payment.txnRef }));
  if (captured && settled.count === 1 && orderId) {
    void import("./einvoice").then(({ enqueueEinvoiceForOrder }) =>
      enqueueEinvoiceForOrder(orderId).catch((err) => {
        console.error(JSON.stringify({ level: "error", event: "einvoice_enqueue_failed", orderId, message: String(err) }));
      })
    );
  }
  return success
    ? { ok: true, rspCode: "00", message: "Confirm Success", orderId,
        settled: captured ? "PAID" : "REFUND_REQUIRED" }
    : { ok: true, rspCode: "01", message: `MoMo failed: ${params.message ?? params.resultCode}`, orderId, settled: "FAILED" };
}
