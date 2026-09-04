// ZaloPay gateway checkout. Two distinct MAC keys (key1 for the
// redirect URL, key2 for the IPN body) — the gateway hands both back
// during onboarding. Redirect is server-side, no JS SDK; we POST to
// /v2/create and receive an `order_url` + `order_token` deeplink.
// IPN is a JSON POST whose MAC is computed over the raw postData
// (NOT a canonical-string re-arrangement like MoMo/VNPay), so we
// keep the original text around to hash. Money is đồng, integer.

import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { fail } from "./api";

const CREATE_URL = "https://sb-openapi.zalopay.vn/v2/create";

export function zaloPayConfigured() {
  return Boolean(
    process.env.ZALOPAY_APP_ID &&
    process.env.ZALOPAY_KEY1 &&
    process.env.ZALOPAY_KEY2 &&
    process.env.ZALOPAY_RETURN_URL &&
    process.env.ZALOPAY_IPN_URL
  );
}

function hmac(secret: string, raw: string) {
  return createHmac("sha256", secret).update(raw).digest("hex");
}

function todayStamp() {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Create (or reuse) a PENDING WebPayment tagged provider="ZALOPAY" and
 * return the deeplink URL. `app_trans_id` is the gateway's idempotency
 * key, formed as `${ymd}_${orderId}` — same orderId always produces
 * the same trans id, which ZaloPay de-dupes on its side.
 */
export async function buildZaloPayUrl(order: { id: string; number: string; total: bigint }, baseUrl: string) {
  if (!zaloPayConfigured()) fail(400, "VALIDATION", "ZaloPay is not configured");
  await prisma.webPayment.upsert({
    where: { orderId: order.id },
    update: { provider: "ZALOPAY" },
    create: { orderId: order.id, txnRef: order.id, amount: order.total, provider: "ZALOPAY" },
  });
  const appTransId = `${todayStamp()}_${order.id}`;
  const appTime = Date.now();
  const amount = Number(order.total);
  const embedData = JSON.stringify({ redirecturl: new URL(process.env.ZALOPAY_RETURN_URL!, baseUrl).toString() });
  const item = "[]";
  const appUser = order.number;
  const mac = hmac(
    process.env.ZALOPAY_KEY1!,
    [process.env.ZALOPAY_APP_ID, appTransId, appUser, amount, appTime, embedData, item].join("|")
  );
  const body: Record<string, string | number> = {
    app_id: Number(process.env.ZALOPAY_APP_ID!),
    app_user: appUser,
    app_trans_id: appTransId,
    app_time: appTime,
    amount,
    item,
    embed_data: embedData,
    mac,
    callback_url: new URL(process.env.ZALOPAY_IPN_URL!, baseUrl).toString(),
    description: `Thanh toan ${order.number}`,
    bank_code: "zalopayapp",
  };
  const res = await fetch(CREATE_URL, {
    method: "POST",
    // PERF-001: bound a hung ZaloPay endpoint (no undici default timeout).
    signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(
      Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)]))
    ).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as { order_url?: string; order_token?: string; return_message?: string; return_code?: number };
  if (!res.ok || !data.order_url)
    fail(502, "VALIDATION", "ZaloPay create failed", { status: res.status, data });
  return data.order_url;
}

/**
 * Shared idempotent settlement. ZaloPay IPN posts a JSON body; the
 * MAC is `HMAC-SHA256(key2, postData)` where postData is the raw
 * request body string. App sends `data` as a JSON-stringified object
 * AND `mac` separately — we accept either shape, recompute, and
 * compare. amount/data.str is in đồng.
 */
export type ZaloSettleResult = {
  return_code: number;
  return_message: string;
  settled?: "PAID" | "FAILED" | "REFUND_REQUIRED" | "ALREADY_SETTLED";
};

export async function settleZaloPayResponse(
  rawBody: string,
  parsed: { data?: Record<string, unknown>; mac?: string },
): Promise<ZaloSettleResult> {
  if (!process.env.ZALOPAY_KEY2) {
    return { return_code: -1, return_message: "ZaloPay not configured" };
  }
  const data = parsed.data ?? {};
  const provided = parsed.mac ?? "";
  const dataString = typeof (data as { data?: string }).data === "string"
    ? (data as { data: string }).data
    : JSON.stringify(data);
  const expected = hmac(process.env.ZALOPAY_KEY2, dataString);
  const a = Buffer.from(expected), b = Buffer.from(provided);
  if (!provided || a.length !== b.length || !timingSafeEqual(a, b))
    return { return_code: -1, return_message: "Invalid signature" };

  const dataObj = typeof (data as { data?: string }).data === "string"
    ? JSON.parse((data as { data: string }).data) as Record<string, string>
    : (data as Record<string, string>);
  const appTransId = dataObj.app_trans_id ?? "";
  const orderId = appTransId.includes("_") ? appTransId.split("_").slice(1).join("_") : appTransId;
  const payment = await prisma.webPayment.findUnique({ where: { txnRef: orderId } });
  if (!payment) return { return_code: 2, return_message: "Unknown transaction" };
  // Amount check — same invariant as VNPay (vnpay.ts) and MoMo (momo.ts):
  // settle only the signed amount, never a gateway-side anomaly.
  if (BigInt(dataObj.amount ?? "0") !== payment.amount)
    return { return_code: 2, return_message: "Amount mismatch" };
  if (payment.status !== "PENDING")
    return { return_code: 1, return_message: "Confirm Success", settled: "ALREADY_SETTLED" };

  const success = Number(dataObj.status ?? 1) === 1;
  const resultOrderId = payment.orderId ?? undefined;
  // Real transition CONFIRMED → PAID (see settleVnpayResponse): a captured
  // payment is invisible to expiry/manual-cancel claims. A lost claim means
  // the order is gone — record REFUND_REQUIRED, never PAID.
  let claimed = false;
  if (success && resultOrderId) {
    const claim = await prisma.order.updateMany({
      where: { id: resultOrderId, status: "CONFIRMED" },
      data: { status: "PAID" },
    });
    claimed = claim.count === 1;
    if (!claimed)
      console.warn(JSON.stringify({ event: "zalopay_paid_after_cancel", orderId: resultOrderId }));
  }
  const captured = success && claimed;
  const settled = await prisma.webPayment.updateMany({
    where: { id: payment.id, status: "PENDING" },
    data: {
      status: !success ? "FAILED" : captured ? "PAID" : "REFUND_REQUIRED",
      responseCode: String(dataObj.status ?? ""),
      rawParams: dataObj,
      paidAt: success ? new Date() : null,
    },
  });
  if (settled.count === 0)
    console.info(JSON.stringify({ event: "zalopay_duplicate_callback", txnRef: payment.txnRef }));
  if (success && !captured)
    console.error(JSON.stringify({ level: "error", event: "zalopay_refund_required", orderId: resultOrderId, txnRef: payment.txnRef }));
  if (captured && settled.count === 1 && resultOrderId) {
    void import("./einvoice").then(({ enqueueEinvoiceForOrder }) =>
      enqueueEinvoiceForOrder(resultOrderId).catch((err) => {
        console.error(JSON.stringify({ level: "error", event: "einvoice_enqueue_failed", orderId: resultOrderId, message: String(err) }));
      })
    );
  }
  void rawBody; // reserved for a future mac-over-raw-body mode
  return success
    ? { return_code: 1, return_message: "Confirm Success", settled: captured ? "PAID" : "REFUND_REQUIRED" }
    : { return_code: 2, return_message: `ZaloPay failed: ${dataObj.status ?? "?"}`, settled: "FAILED" as const };
}
