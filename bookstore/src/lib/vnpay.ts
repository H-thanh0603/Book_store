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
    return { ok: true, rspCode: "00", message: "Confirm Success" };

  const success = params.vnp_ResponseCode === "00" && params.vnp_TransactionStatus === "00";
  const rawParams: Record<string, string> = params;

  // Paid money must not revive a CANCELLED order — claim it while CONFIRMED.
  let claimed = false;
  if (success) {
    const claim = await prisma.order.updateMany({
      where: { id: payment.orderId, status: "CONFIRMED" },
      data: { status: "CONFIRMED" },
    });
    claimed = claim.count === 1;
    if (!claimed)
      console.warn(JSON.stringify({ event: "vnpay_paid_after_cancel", orderId: payment.orderId }));
  }
  // Idempotency guard against racing callbacks: IPN and browser return may
  // arrive near-simultaneously. updateMany (NOT update) — a lost race must be
  // a duplicate-safe no-op, whereas extended-where update throws P2025.
  const settled = await prisma.webPayment.updateMany({
    where: { id: payment.id, status: "PENDING" },
    data: {
      status: success ? "PAID" : "FAILED",
      responseCode: params.vnp_ResponseCode ?? null,
      bankCode: params.vnp_BankCode ?? null,
      rawParams,
      paidAt: success ? new Date() : null,
    },
  });
  if (settled.count === 0)
    console.info(JSON.stringify({ event: "vnpay_duplicate_callback", txnRef: payment.txnRef }));

  // Fire-and-forget e-invoice. T-VAN outage must not block IPN; the job
  // worker retries via the standard backoff in lib/einvoice-jobs.ts.
  if (success && settled.count === 1) {
    void import("./einvoice").then(({ enqueueEinvoiceForOrder }) =>
      enqueueEinvoiceForOrder(payment.orderId).catch((err) => {
        console.error(JSON.stringify({ level: "error", event: "einvoice_enqueue_failed", orderId: payment.orderId, message: String(err) }));
      })
    );
  }

  return success
    ? { ok: true, rspCode: "00", message: "Confirm Success", orderId: payment.orderId }
    : { ok: true, rspCode: "01", message: "Payment failed at gateway", orderId: payment.orderId };
}
