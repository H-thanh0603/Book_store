// Subscription billing. Each cycle:
//   1. owner clicks "Thanh toan" on /settings/billing
//   2. issueCycleInvoice() creates BillingInvoice(PENDING) + WebPayment
//   3. owner is redirected to VNPay; on return, settleVnpayResponse
//      flips the WebPayment to PAID
//   4. settleBillingPayment() flips the linked BillingInvoice to PAID
//   5. daily suspendOverdueOrgs() suspends orgs whose latest invoice
//      is still PENDING 3 days past periodEnd
//
// Pricing is integer dong (NOT cents). One dong = 1 unit. Plan tier
// upgrades take effect at next period; no prorate in MVP.

import { createHmac } from "node:crypto";
import { prisma } from "./db";
import { fail } from "./api";

const PAY_HOST = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
const SUSPEND_GRACE_DAYS = 3;

function vnTime(d: Date) {
  return new Date(d.getTime() + 7 * 3_600_000).toISOString().replace(/[-T]/g, "").slice(0, 14);
}

function vnpayConfigured() {
  return Boolean(process.env.VNP_TMN_CODE && process.env.VNP_HASH_SECRET && process.env.VNP_RETURN_URL);
}

function hash(params: Record<string, string>) {
  const secret = process.env.VNP_HASH_SECRET!;
  const query = Object.keys(params).sort()
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");
  return { query, hmac: createHmac("sha512", secret).update(query).digest("hex") };
}

// Build a VNPay URL for a billing-cycle payment (no underlying Order).
// Mirrors buildVnpayUrl() in vnpay.ts; duplicated rather than refactored
// because the order shape there is bound to Order.total/Order.number.
export function buildBillingVnpayUrl(txnRef: string, amount: bigint, orderInfo: string, ip: string, baseUrl: string): string {
  if (!vnpayConfigured()) fail(400, "VALIDATION", "VNPay is not configured");
  const now = new Date();
  const params: Record<string, string> = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: process.env.VNP_TMN_CODE!,
    vnp_Amount: (amount * 100n).toString(),
    vnp_CreateDate: vnTime(now),
    vnp_ExpireDate: vnTime(new Date(now.getTime() + 30 * 60_000)),
    vnp_CurrCode: "VND",
    vnp_IpAddr: ip || "127.0.0.1",
    vnp_Locale: "vn",
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: "billpayment",
    vnp_ReturnUrl: new URL(process.env.VNP_RETURN_URL!, baseUrl).toString(),
    vnp_TxnRef: txnRef,
  };
  const { query, hmac } = hash(params);
  return `${PAY_HOST}?${query}&vnp_SecureHash=${hmac}`;
}

export type IssueResult = { invoiceId: string; txnRef: string; url: string };

// Create a PENDING BillingInvoice + linked PENDING WebPayment for the
// org's current period. Returns the VNPay URL. Idempotent on the
// (subscriptionId, periodStart) tuple so the "Pay" button is safe to spam.
export async function issueCycleInvoice(orgId: string, ip: string, baseUrl: string): Promise<IssueResult> {
  const sub = await prisma.subscription.findUnique({
    where: { orgId },
    include: { plan: true, org: true },
  });
  if (!sub) fail(404, "NOT_FOUND", "Org has no subscription");

  const invoiceId = `${sub.id}:${sub.currentPeriodStart.toISOString()}`;
  const existing = await prisma.billingInvoice.findUnique({
    where: { id: invoiceId },
    include: { webPayment: true },
  }).catch(() => null);
  if (existing?.status === "PENDING" && existing.webPayment) {
    return {
      invoiceId: existing.id,
      txnRef: existing.webPayment.txnRef,
      url: buildBillingVnpayUrl(existing.webPayment.txnRef, existing.webPayment.amount, `Thanh toan ${sub.plan.name}`, ip, baseUrl),
    };
  }

  const periodEnd = new Date(sub.currentPeriodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  const amount = BigInt(sub.plan.monthlyPriceCents);
  const txnRef = `bill_${sub.id.slice(0, 8)}_${Date.now()}`;

  const wp = await prisma.webPayment.create({
    data: { txnRef, amount, orderId: null, provider: "VNPAY" },
  });
  const invoice = await prisma.billingInvoice.create({
    data: {
      id: invoiceId, orgId, subscriptionId: sub.id, planId: sub.planId,
      periodStart: sub.currentPeriodStart, periodEnd, amount, status: "PENDING",
      webPaymentId: wp.id,
    },
  });
  return { invoiceId: invoice.id, txnRef, url: buildBillingVnpayUrl(txnRef, amount, `Thanh toan ${sub.plan.name}`, ip, baseUrl) };
}

export async function settleBillingPayment(txnRef: string): Promise<boolean> {
  const wp = await prisma.webPayment.findUnique({ where: { txnRef }, include: { billingInvoice: true } });
  if (!wp?.billingInvoice) return false;
  if (wp.billingInvoice.status === "PAID") return true;
  // Gate on the payment itself, not just the caller's belief: a FAILED
  // gateway response must never flip the invoice to PAID (audit MONEY-002).
  if (wp.status !== "PAID") {
    console.warn(JSON.stringify({ event: "billing_settle_rejected_unpaid", txnRef, wpStatus: wp.status }));
    return false;
  }
  await prisma.billingInvoice.update({
    where: { id: wp.billingInvoice.id },
    data: { status: "PAID", paidAt: new Date() },
  });
  return true;
}

export async function suspendOverdueOrgs(): Promise<{ suspended: number; reactivated: number }> {
  const cutoff = new Date(Date.now() - SUSPEND_GRACE_DAYS * 86_400_000);
  const overdue = await prisma.billingInvoice.findMany({
    where: { status: "PENDING", periodEnd: { lt: cutoff } },
    select: { orgId: true },
  });
  const orgIds = [...new Set(overdue.map((o) => o.orgId))];
  const suspended = orgIds.length
    ? await prisma.organization.updateMany({ where: { id: { in: orgIds }, status: { not: "SUSPENDED" } }, data: { status: "SUSPENDED" } })
    : { count: 0 };
  const reactivated = await prisma.organization.updateMany({
    where: { status: "SUSPENDED", billingInvoices: { some: { status: "PAID" } } },
    data: { status: "ACTIVE" },
  });
  return { suspended: suspended.count, reactivated: reactivated.count };
}
