// VNPay sandbox checkout: build the redirect URL and settle IPN/return
// callbacks. Spec v2.1.0 — params sorted A→Z, RFC1738-encoded, HMAC-SHA512
// over everything except vnp_SecureHash/vnp_SecureHashType. All money math is
// BigInt đồng; vnp_Amount carries đồng×100 (VNPay's integer-cents convention).
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { fail } from "./api";

const PAY_HOST = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";

export function vnpayConfigured() {
  return Boolean(process.env.VNP_TMN_CODE && process.env.VNP_HASH_SECRET && process.env.VNP_RETURN_URL);
}

function hash(params: Record<string, string>) {
  const secret = process.env.VNP_HASH_SECRET!;
  const query = Object.keys(params)
    .sort()
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");
  return { query, hmac: createHmac("sha512", secret).update(query).digest("hex") };
}

/** Vietnam local time (UTC+7), yyyyMMddHHmmss — VNPay spec timebase. */
function vnTime(d: Date) {
  return new Date(d.getTime() + 7 * 3_600_000).toISOString().replace(/[-T]/g, "").slice(0, 14);
}

/**
 * Create (or reuse) a PENDING WebPayment for the order and return the sandbox
 * payment URL. txnRef = order.id: idempotent retries reuse the same intent.
 */
export async function buildVnpayUrl(order: {
  id: string; number: string; total: bigint;
}, ip: string, baseUrl: string) {
  if (!vnpayConfigured()) fail(400, "VALIDATION", "VNPay is not configured");
  await prisma.webPayment.upsert({
    where: { orderId: order.id },
    update: {}, // keep original amount/ref — the order total is immutable post-create
    create: { orderId: order.id, txnRef: order.id, amount: order.total },
  });
  // ponytail: unpaid orders expire via the existing reservation-TTL job;
  // vnp_ExpireDate is set shorter (+30min) so VNPay rarely outlives that TTL.
  const now = new Date();
  const params: Record<string, string> = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: process.env.VNP_TMN_CODE!,
    vnp_Amount: (order.total * 100n).toString(),
    vnp_CreateDate: vnTime(now),
    vnp_ExpireDate: vnTime(new Date(now.getTime() + 30 * 60_000)),
    vnp_CurrCode: "VND",
    vnp_IpAddr: ip || "127.0.0.1",
    vnp_Locale: "vn",
    vnp_OrderInfo: `Thanh toan ${order.number}`, // ASCII only — diacritics break signature checks
    vnp_OrderType: "billpayment",
    vnp_ReturnUrl: new URL(process.env.VNP_RETURN_URL!, baseUrl).toString(),
    vnp_TxnRef: order.id,
  };
  const { query, hmac } = hash(params);
  return `${PAY_HOST}?${query}&vnp_SecureHash=${hmac}`;
}

export type SettleResult = {
  ok: boolean;
  rspCode: string; // '00' confirmed; '01' unknown/failed; '04' amount; '97' signature
  message: string;
  orderId?: string; // surfaced so the route can fan out side-effects (e-invoice, loyalty)
  /** How the WebPayment row ended up. REFUND_REQUIRED = money captured but
   *  the order is no longer CONFIRMED (expired/cancelled) — flagged for a
   *  manual refund, never recorded as PAID. */
  settled?: "PAID" | "FAILED" | "REFUND_REQUIRED" | "ALREADY_SETTLED";
};

/**
 * THE shared idempotent settlement handler for both the IPN (server-to-server)
 * and the browser return. Verifies signature and amount before touching state.
 */
export async function settleVnpayResponse(searchParams: URLSearchParams): Promise<SettleResult> {
  const params: Record<string, string> = {};
  searchParams.forEach((v, k) => { params[k] = v; });
  const secureHash = params.vnp_SecureHash ?? "";
  delete params.vnp_SecureHash;
  delete params.vnp_SecureHashType;

  const { hmac } = hash(params);
  const a = Buffer.from(hmac), b = Buffer.from(secureHash);
  if (!secureHash || a.length !== b.length || !timingSafeEqual(a, b))
    return { ok: false, rspCode: "97", message: "Invalid signature" };

  const payment = await prisma.webPayment.findUnique({ where: { txnRef: params.vnp_TxnRef ?? "" } });
  if (!payment) return { ok: false, rspCode: "01", message: "Unknown transaction" };
  // Amount check: vnp_Amount is đồng×100.
  if (BigInt(params.vnp_Amount ?? "0") / 100n !== payment.amount)
    return { ok: false, rspCode: "04", message: "Amount mismatch" };

  // Duplicate callback (IPN + return both land): already-settled → confirm only.
  if (payment.status !== "PENDING")
    return { ok: true, rspCode: "00", message: "Confirm Success", orderId: payment.orderId ?? undefined, settled: "ALREADY_SETTLED" };

  const success = params.vnp_ResponseCode === "00" && params.vnp_TransactionStatus === "00";
  const rawParams: Record<string, string> = params;
  const orderId = payment.orderId ?? undefined;

  // Money may only land on an order still awaiting confirmation. The claim is
  // a REAL transition (CONFIRMED → PAID) so the reservation-expiry job and
  // manual cancel — which both claim `CONFIRMED` rows — can never touch an
  // order whose money was captured. If the claim fails (order already
  // CANCELLED/expired) the capture is recorded as REFUND_REQUIRED instead.
  // Billing-cycle WebPayments have no orderId; skip the claim step entirely.
  let claimed = false;
  if (success && orderId) {
    const claim = await prisma.order.updateMany({
      where: { id: orderId, status: "CONFIRMED" },
      data: { status: "PAID" },
    });
    claimed = claim.count === 1;
    if (!claimed)
      console.warn(JSON.stringify({ event: "vnpay_paid_after_cancel", orderId }));
  }
  const captured = success && (claimed || !orderId);
  // Idempotency guard against racing callbacks: IPN and browser return may
  // arrive near-simultaneously. updateMany (NOT update) — a lost race must be
  // a duplicate-safe no-op, whereas extended-where update throws P2025.
  const settled = await prisma.webPayment.updateMany({
    where: { id: payment.id, status: "PENDING" },
    data: {
      status: !success ? "FAILED" : captured ? "PAID" : "REFUND_REQUIRED",
      responseCode: params.vnp_ResponseCode ?? null,
      bankCode: params.vnp_BankCode ?? null,
      rawParams,
      paidAt: success ? new Date() : null,
    },
  });
  if (settled.count === 0)
    console.info(JSON.stringify({ event: "vnpay_duplicate_callback", txnRef: payment.txnRef }));
  if (success && !captured)
    console.error(JSON.stringify({ level: "error", event: "vnpay_refund_required", orderId, txnRef: payment.txnRef }));

  // Fire-and-forget e-invoice — only for a capture that actually landed on a
  // PAID order. T-VAN outage must not block IPN; the job worker retries.
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
    : { ok: true, rspCode: "01", message: "Payment failed at gateway", orderId, settled: "FAILED" };
}
