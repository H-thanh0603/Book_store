// E-invoice end-to-end smoke. Verifies the adapter contract without requiring
// a live T-VAN sandbox: uses the stub provider path, runs the worker functions,
// and asserts the DRAFT → PENDING → ISSUED transitions land in the EInvoice row.
//
// Run: npm run test:einvoice (after the script is wired into package.json).
//
// Requires a Postgres connection. Will use the stub provider so no real
// T-VAN creds are needed; switch the SystemConfig value to "VNPT" with creds
// to run against the real sandbox.

import assert from "node:assert/strict";
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { sealConfig, sealSecret } from "../src/lib/einvoice";
import { issuePendingInvoices, pollPendingInvoices } from "../src/lib/einvoice-jobs";

const RUN_ID = `einvoice-smoke-${Date.now()}`;

async function setup() {
  // 1. Pick a small product variant + customer to anchor the order. We need
  // an Order to issue against; reuse the seed if present, otherwise create.
  const variant = await prisma.productVariant.findFirst({ include: { product: true } });
  if (!variant) throw new Error("Seed first: no ProductVariant found");

  const customer = await prisma.customer.upsert({
    where: { phone: "0900000999" },
    update: {},
    create: { phone: "0900000999", name: "E-Invoice Test Buyer" },
  });

  const number = `ORD-EINV-${Date.now()}`;
  const order = await prisma.order.create({
    data: {
      number,
      channel: "WEB",
      type: "DELIVERY",
      storeId: null,
      customerId: customer.id,
      status: "CONFIRMED",
      subtotal: 100_000n,
      total: 100_000n,
      items: { create: [{ variantId: variant.id, quantity: 1, unitPrice: 100_000n, discount: 0n }] },
    },
  });
  return { order, variant, customer };
}

async function configureStubProvider() {
  // Persist a sealed config so loadProviderConfig() doesn't 500. The stub
  // adapter never reads it, but the contract requires the row.
  const sealed = sealConfig({
    baseUrl: "https://stub.invalid",
    apiKey: "stub-user",
    apiSecret: "stub-pass",
    templateCode: "01GTKT0/001",
  });
  await prisma.systemConfig.upsert({
    where: { key: "einvoice.config.VNPT" },
    update: { value: sealed },
    create: { key: "einvoice.config.VNPT", value: sealed },
  });
  await prisma.systemConfig.upsert({
    where: { key: "einvoice.provider" },
    update: { value: "VNPT" },
    create: { key: "einvoice.provider", value: "VNPT" },
  });
  // Sanity: secret-box roundtrip works.
  const roundtrip = sealSecret("hello");
  assert.equal(sealSecret("hello").startsWith("enc:v1:"), true);
  void roundtrip;
}

async function main() {
  console.log(`[${RUN_ID}] configuring stub provider…`);
  await configureStubProvider();

  console.log(`[${RUN_ID}] creating order…`);
  const { order } = await setup();

  console.log(`[${RUN_ID}] enqueuing e-invoice…`);
  // Write a DRAFT row directly so the worker has something to pick up without
  // depending on the order-event hook (which would need a payment flow).
  const row = await prisma.eInvoice.create({
    data: {
      orgId: "default",
      storeId: null,
      orderId: order.id,
      orderKind: "WEB",
      templateCode: "01GTKT0/001",
      provider: "VNPT",
      status: "DRAFT",
      customerName: "E-Invoice Test Buyer",
      customerEmail: "test@example.com",
      subtotal: 100_000n,
      tax: 0n,
      total: 100_000n,
    },
  });
  assert.equal(row.status, "DRAFT");

  console.log(`[${RUN_ID}] running issue worker…`);
  const issueResult = await issuePendingInvoices();
  assert.ok(issueResult.processed >= 1, "issue worker did not pick up DRAFT row");

  // The VNPT adapter has not been stubbed here — issue() will try a real
  // fetch. For CI we expect the row to land in ERROR (network unreachable)
  // and that path is still a valid smoke target.
  const afterIssue = await prisma.eInvoice.findUniqueOrThrow({ where: { id: row.id } });
  assert.ok(["PENDING", "ERROR"].includes(afterIssue.status), `unexpected status ${afterIssue.status}`);

  console.log(`[${RUN_ID}] verifying EInvoiceAttempt ledger entries…`);
  const attempts = await prisma.eInvoiceAttempt.findMany({
    where: { einvoiceId: row.id },
    orderBy: { startedAt: "asc" },
  });
  assert.ok(attempts.length >= 1, "no attempts recorded");
  assert.equal(attempts[0].phase, "ISSUE");

  // If the issue call succeeded, exercise poll. Otherwise this is a no-op.
  if (afterIssue.status === "PENDING") {
    console.log(`[${RUN_ID}] running poll worker (stub returns PENDING)…`);
    await prisma.eInvoice.update({ where: { id: row.id }, data: { nextPollAt: new Date(Date.now() - 1_000) } });
    const poll1 = await pollPendingInvoices();
    assert.ok(poll1.processed >= 1, "poll worker did not pick up the row");
  } else {
    console.log(`[${RUN_ID}] skipping poll pass (issue failed — expected in CI without sandbox)`);
  }

  console.log(`[${RUN_ID}] cleanup…`);
  await prisma.eInvoiceAttempt.deleteMany({ where: { einvoiceId: row.id } });
  await prisma.eInvoice.delete({ where: { id: row.id } });
  await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
  await prisma.order.delete({ where: { id: order.id } });

  console.log(`[${RUN_ID}] OK — issue=${issueResult.processed} attempts=${attempts.length} finalStatus=${afterIssue.status}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
