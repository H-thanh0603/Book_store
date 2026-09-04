// POS refund/shift + order-expiry verification against a seeded database.
// No HTTP, no mocks — calls the domain functions directly like test-p0's
// concurrency block does. Run: npm run test:pos  (needs seeded Postgres)
import "dotenv/config";
import { prisma } from "../../src/lib/db";
import { completeSale, quoteSale, openShift, closeShift, refundSale } from "../../src/lib/pos";
import { expireStaleReservations } from "../../src/lib/order-expiry";
import { applyMovement } from "../../src/lib/inventory";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`✅ ${name}`);
  else { failures++; console.error(`❌ ${name}`, detail ?? ""); }
}

function expectFail(name: string, status: number) {
  return (err: unknown) => {
    const s = (err as { status?: number }).status;
    check(`${name} → ${status} (got ${s})`, s === status, err);
  };
}

async function main() {
  const store = await prisma.store.findFirstOrThrow({ orderBy: { code: "asc" }, include: { region: { select: { orgId: true } } } });
  const terminal = await prisma.posTerminal.findFirstOrThrow({ where: { storeId: store.id } });
  const user = await prisma.user.findFirstOrThrow({ where: { active: true }, orderBy: { email: "asc" } });
  const variant = await prisma.productVariant.findFirstOrThrow({
    where: { active: true }, include: { product: true },
  });
  const stockroom = await prisma.stockLocation.findFirstOrThrow({
    where: { storeId: store.id, type: "STORE_STOCKROOM" },
  });

  // Known balance so the sale is guaranteed to clear the stock guard.
  await prisma.$executeRaw`
    INSERT INTO "InventoryBalance" (id, "variantId", "locationId", "onHand", reserved, "inTransit", damaged)
    VALUES (gen_random_uuid()::text, ${variant.id}, ${stockroom.id}, 100, 0, 0, 0)
    ON CONFLICT ("variantId", "locationId") DO UPDATE SET "onHand" = 100, reserved = 0
  `;

  // ── Shift lifecycle ──
  // A previous crashed run may leave an OPEN shift on this terminal — force-close
  // residue so the lifecycle below starts clean.
  await prisma.posShift.updateMany({
    where: { terminalId: terminal.id, status: "OPEN" },
    data: { status: "CLOSED", closedAt: new Date(), closingCash: 0n, expectedCash: 0n, variance: 0n },
  });
  const openingCash = 1_000_000n;
  const shift = await openShift(terminal.id, user.id, openingCash);
  check("openShift creates OPEN shift", shift.status === "OPEN");
  await openShift(terminal.id, user.id, openingCash).then(
    () => check("second openShift on same terminal rejected", false),
    expectFail("second openShift same terminal", 409),
  );

  // ── Sale: cash + gift card split, loyalty earn ──
  const gcCode = `TESTGC-${Date.now()}`;
  const gcTopUp = 500_000n;
  await prisma.giftCard.create({
    data: { code: gcCode, initialValue: gcTopUp, balance: gcTopUp, orgId: store.region.orgId },
  });
  const customer = await prisma.customer.findFirstOrThrow();
  const itemPrice = 200_000n;
  const idem = `pos-test-${Date.now()}`;
  const before = await prisma.inventoryBalance.findUniqueOrThrow({
    where: { variantId_locationId: { variantId: variant.id, locationId: stockroom.id } },
  });
  // Quote first (the POS UI contract): seeded promos may auto-apply, so the
  // expected total comes from the same engine the sale uses.
  const quote = await quoteSale({
    items: [{ variantId: variant.id, quantity: 2, unitPrice: itemPrice }],
    storeId: store.id, customerId: customer.id,
  });
  check("quote total = subtotal - discounts", quote.total === quote.subtotal - quote.discountTotal,
    quote);
  const saleTotal = BigInt(quote.total);
  const cashPart = saleTotal - 100_000n;
  if (cashPart < 0n) throw new Error(`Quote ${quote.total} too small for gift-card split`);
  const txn = await completeSale({
    shiftId: shift.id, storeId: store.id, userId: user.id,
    items: [{ variantId: variant.id, quantity: 2, unitPrice: itemPrice }],
    customerId: customer.id,
    payments: [
      { method: "CASH", amount: cashPart },
      { method: "GIFT_CARD", amount: 100_000n, giftCardCode: gcCode },
    ],
    idempotencyKey: idem,
  });
  check("sale total matches quote engine", txn.total === saleTotal,
    { sale: txn.total, quote: saleTotal });
  const afterGc = await prisma.giftCard.findUniqueOrThrow({ where: { code: gcCode } });
  check("gift card debited to 400k", afterGc.balance === 400_000n, afterGc.balance);
  const balAfterSale = await prisma.inventoryBalance.findUniqueOrThrow({
    where: { variantId_locationId: { variantId: variant.id, locationId: stockroom.id } },
  });
  check("onHand decremented by 2", balAfterSale.onHand === before.onHand - 2,
    { before: before.onHand, after: balAfterSale.onHand });

  // Idempotent retry returns the SAME transaction.
  const retry = await completeSale({
    shiftId: shift.id, storeId: store.id, userId: user.id,
    items: [{ variantId: variant.id, quantity: 2, unitPrice: itemPrice }],
    customerId: customer.id,
    payments: [{ method: "CASH", amount: 400_000n }],
    idempotencyKey: idem,
  });
  check("idempotent retry returns same tx", retry.id === txn.id);

  // ── Refund: stock back, gift card credited, loyalty clawed, mirror row ──
  const refundShiftId = shift.id; // same OPEN shift may process refunds
  const refund = await refundSale(txn.number, refundShiftId, user.id, { storeId: store.id, reason: "test" });
  check("refund mirrors negative totals", refund.total === -saleTotal && refund.status === "COMPLETED",
    { total: refund.total, status: refund.status });
  check("original tx marked RETURNED",
    (await prisma.posTransaction.findUniqueOrThrow({ where: { id: txn.id } })).status === "RETURNED");
  const balAfterRefund = await prisma.inventoryBalance.findUniqueOrThrow({
    where: { variantId_locationId: { variantId: variant.id, locationId: stockroom.id } },
  });
  check("refund restores onHand (+2)", balAfterRefund.onHand === before.onHand,
    { expected: before.onHand, got: balAfterRefund.onHand });
  check("gift card credited back to 500k",
    (await prisma.giftCard.findUniqueOrThrow({ where: { code: gcCode } })).balance === 500_000n);
  const loyaltyLedger = await prisma.loyaltyTransaction.findMany({
    where: { refType: "pos_refund", refId: txn.id },
  });
  check("loyalty clawback ledger written", loyaltyLedger.some((t) => t.points < 0), loyaltyLedger);

  await refundSale(txn.number, refundShiftId, user.id).then(
    () => check("double refund rejected", false),
    expectFail("double refund", 409),
  );

  // ── Close shift: variance math counts COMPLETED + RETURNED txns ──
  // Cash movements: +cashPart at sale, -cashPart on the mirrored refund
  // (GIFT_CARD legs are skipped by the CASH filter). Net drawer change: zero.
  const closingCash = openingCash;
  const closed = await closeShift(shift.id, closingCash, user.id);
  check("closeShift computes expected/variance", closed.expectedCash === openingCash && closed.variance === 0n,
    { expected: closed.expectedCash, variance: closed.variance });
  await closeShift(shift.id, closingCash, user.id).then(
    () => check("double close rejected", false),
    // A CLOSED shift fails the "not open" precheck with 400 before the CAS can 409.
    expectFail("double close", 400),
  );

  // ── Reservation expiry ──
  const whLoc = await prisma.stockLocation.findFirstOrThrow({ where: { type: "WAREHOUSE" } });
  const expVariant = await prisma.productVariant.findFirstOrThrow({
    where: { active: true, id: { not: variant.id } },
  });
  await prisma.$executeRaw`
    INSERT INTO "InventoryBalance" (id, "variantId", "locationId", "onHand", reserved, "inTransit", damaged)
    VALUES (gen_random_uuid()::text, ${expVariant.id}, ${whLoc.id}, 10, 0, 0, 0)
    ON CONFLICT ("variantId", "locationId") DO UPDATE SET "onHand" = 10, reserved = 0
  `;
  const staleOrder = await prisma.order.create({
    data: {
      number: `EXP-${Date.now()}`, channel: "WEB", type: "delivery",
      customerId: customer.id, status: "CONFIRMED",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // older than any sane TTL
      subtotal: 1n, discountTotal: 0n, total: 1n,
      items: { create: { variantId: expVariant.id, quantity: 3, unitPrice: 1n } },
      statusHistory: { create: { fromStatus: null, toStatus: "CONFIRMED" } },
    },
  });
  // Reservation movement the expiry job will find and release (quantity 0,
  // reservedDelta carries the lock — mirrors orders.ts reservation writes).
  await prisma.$transaction((tx) => applyMovement(tx, {
    variantId: expVariant.id, locationId: whLoc.id, type: "RESERVATION",
    quantityDelta: 0, reservedDelta: 3, refType: "order", refId: staleOrder.id, userId: user.id,
  }));
  const result = await expireStaleReservations();
  check("stale order expired", result.expired >= 1, result);
  check("order now CANCELLED",
    (await prisma.order.findUniqueOrThrow({ where: { id: staleOrder.id } })).status === "CANCELLED");
  const balAfterExpire = await prisma.inventoryBalance.findUniqueOrThrow({
    where: { variantId_locationId: { variantId: expVariant.id, locationId: whLoc.id } },
  });
  check("reservation released (reserved back to 0)", balAfterExpire.reserved === 0, balAfterExpire.reserved);
  // Second run must NOT re-release (claim guard): order no longer CONFIRMED.
  const second = await expireStaleReservations();
  const stillZero = (await prisma.inventoryBalance.findUniqueOrThrow({
    where: { variantId_locationId: { variantId: expVariant.id, locationId: whLoc.id } },
  })).reserved;
  check("re-run does not double-release", stillZero === 0 && second.scanned !== undefined, { stillZero, second });

  await prisma.$disconnect();
  console.log(failures === 0 ? "\nAll POS/expiry checks passed" : `\n${failures} check(s) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
