// VNPay lib self-check against the DB. Run: npx tsx scripts/test-vnpay.ts
// Covers: sign↔verify round-trip, tamper rejection, amount mismatch, and
// duplicate-settle idempotency. Uses a synthetic order created inline then
// cleaned up — no real data touched.
import "dotenv/config";
import { createHmac } from "node:crypto";
import { prisma } from "../src/lib/db";
import { settleVnpayResponse } from "../src/lib/vnpay";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`✅ ${name}`);
  else { failures++; console.error(`❌ ${name}`, detail ?? ""); }
}

async function main() {
const secret = process.env.VNP_HASH_SECRET;
if (!secret) {
  console.log("⏭️ VNP_HASH_SECRET unset — set sandbox creds to run live checks");
  return;
}

// Synthetic customer + order so we never depend on seed contents.
const suffix = Date.now().toString(36);
const customer = await prisma.customer.create({
  data: { code: `TST-${suffix}`, name: "VNPay Test", phone: `0900${suffix.padStart(6, "0").slice(0, 6)}` },
});
const store = await prisma.store.findFirstOrThrow({ where: { active: true } });
const order = await prisma.order.create({
  data: {
    number: `ORD-TST-${suffix}`, channel: "WEB", type: "pickup", storeId: store.id,
    customerId: customer.id, status: "CONFIRMED", subtotal: 100000n, total: 118000n,
    externalId: `vnpay-test:${suffix}`,
  },
});
await prisma.webPayment.create({
  data: { orderId: order.id, txnRef: order.id, amount: 118000n },
});

function signedParams(over: Record<string, string> = {}) {
  const params: Record<string, string> = {
    vnp_Amount: "11800000", // 118000 × 100
    vnp_ResponseCode: "00",
    vnp_TransactionStatus: "00",
    vnp_TmnCode: process.env.VNP_TMN_CODE ?? "TESTTMN",
    vnp_TxnRef: order.id,
    ...over,
  };
  const query = Object.keys(params).sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join("&");
  const hmac = createHmac("sha512", secret!).update(query).digest("hex");
  return new URLSearchParams(`${query}&vnp_SecureHash=${hmac}`);
}

{
  const r1 = await settleVnpayResponse(signedParams());
  check("valid signature + amount settles PAID", r1.ok && r1.rspCode === "00", r1);

  const after = await prisma.webPayment.findUniqueOrThrow({ where: { txnRef: order.id } });
  check("payment row is PAID with paidAt", after.status === "PAID" && after.paidAt !== null, after.status);

  const r2 = await settleVnpayResponse(signedParams());
  check("duplicate settle is idempotent success", r2.ok && r2.rspCode === "00", r2);
}
{
  // Tampered amount under a fresh signature must be rejected.
  const tampered = await settleVnpayResponse(signedParams({ vnp_Amount: "9900" }));
  check("amount mismatch rejected", !tampered.ok && tampered.rspCode === "04", tampered);
}
{
  const badSig = await settleVnpayResponse(new URLSearchParams("vnp_TxnRef=x&vnp_SecureHash=deadbeef"));
  check("bad signature rejected", !badSig.ok && badSig.rspCode === "97", badSig);
}

// Cleanup synthetic rows.
await prisma.webPayment.delete({ where: { txnRef: order.id } });
await prisma.order.delete({ where: { id: order.id } });
await prisma.customer.delete({ where: { id: customer.id } });
}

main()
  .then(() => {
    process.exitCode = failures ? 1 : 0;
    if (failures) throw new Error(`${failures} check(s) failed`);
    console.log("All checks passed.");
    return prisma.$disconnect();
  })
  .catch((err) => { console.error(err); process.exit(1); });
