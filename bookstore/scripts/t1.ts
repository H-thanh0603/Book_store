import "dotenv/config";
import { completeSale } from "../src/lib/pos";
import { prisma } from "../src/lib/db";

async function main() {
  const shift = (await prisma.posShift.findMany({ where: { status: "OPEN" } }))[0];
  try {
    const txn = await completeSale({
      shiftId: shift.id,
      storeId: "2d94993e-4acb-4cba-8215-e1425a45ceb1",
      userId: "test",
      idempotencyKey: crypto.randomUUID(),
      items: [{ variantId: "105d20f1-5cea-4020-b28f-27bf1d8ee454", quantity: 2 }],
      payments: [{ method: "CASH", amount: BigInt(178000) }],
    });
    console.log("OK", txn.number, Number(txn.total));
  } catch (e) {
    console.error("ERR", e);
  }
  process.exit(0);
}
main();
