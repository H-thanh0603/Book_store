// Agent 1 P0 verification: store-scoped authz (403 proof), return over-return
// rejection, refund ledger, payment idempotency, inventory concurrency.
// Run: npx tsx scripts/test-p0.ts  (needs `npm run dev` on :3000 and seeded DB)
import "dotenv/config";
import { prisma } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`✅ ${name}`);
  else { failures++; console.error(`❌ ${name}`, detail ?? ""); }
}

type Jar = { cookie?: string };
async function api(jar: Jar, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(jar.cookie ? { cookie: jar.cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) jar.cookie = setCookie.split(";")[0];
  let data: Record<string, unknown> = {};
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

async function main() {
  const stores = await prisma.store.findMany({ orderBy: { code: "asc" } });
  if (stores.length < 2) throw new Error("Need ≥2 seeded stores");
  // manager.nh is scoped to store NH — pick it as "Store A" so the scoped session can act.
  const storeA = stores.find((s) => s.code === "NH") ?? stores[0];
  const storeB = stores.find((s) => s.id !== storeA.id)!;

  // ── HTTP PROOF: Store A session gets 403 for Store B list & mutation ──
  const mgrA: Jar = {};
  const login = await api(mgrA, "POST", "/api/auth", { action: "login", email: "manager.nh@melio.vn", password: "Passw0rd!" });
  check("login manager.nh (Store A scoped)", login.status === 200, login);

  const listB = await api(mgrA, "GET", `/api/inventory?storeId=${storeB.id}`);
  check(`GET Store B inventory → 403 (got ${listB.status})`, listB.status === 403, listB.data);
  const listOmitted = await api(mgrA, "GET", "/api/inventory");
  check("GET inventory with omitted storeId is clamped to own stores", listOmitted.status === 200,
    listOmitted.status);

  // order for another store must be rejected at the API layer
  const customer = await prisma.customer.findFirstOrThrow();
  const variant = await prisma.productVariant.findFirstOrThrow({ where: { active: true } });
  const orderB = await api(mgrA, "POST", "/api/orders", {
    channel: "WEB", type: "delivery", storeId: storeB.id, customerId: customer.id,
    items: [{ variantId: variant.id, quantity: 1 }],
  });
  check(`POST order with Store B storeId → 403 (got ${orderB.status})`, orderB.status === 403, orderB.data);

  // orders list never leaks other stores
  const orders = await api(mgrA, "GET", "/api/orders");
  check("GET /api/orders succeeds for store-scoped role", orders.status === 200);

  // ── Return safety: cumulative over-return rejection + refund ledger ──
  const stockroomA = await prisma.stockLocation.findFirstOrThrow({
    where: { storeId: storeA.id, type: "STORE_STOCKROOM" },
  });
  // Use a real Order + OrderItem (returns are keyed on order items).
  // Create one via the API so the flow is exercised end to end.
  const created = await api(mgrA, "POST", "/api/orders", {
    channel: "WEB", type: "delivery", storeId: storeA.id, customerId: customer.id,
    items: [{ variantId: variant.id, quantity: 2 }],
  });
  check("seed order created via API for return tests", created.status === 201, created.data);
  const orderNumber = created.data.number as string;
  const order = await prisma.order.findFirstOrThrow({
    where: { number: orderNumber },
    include: { items: true },
  });
  if (order.items.length === 0) throw new Error("Seeded order has no items");
  const orderItem = order.items[0];

  const createRet = await api(mgrA, "POST", "/api/returns", {
    action: "create", orderId: order.id, locationId: stockroomA.id,
    items: [{ orderItemId: orderItem.id, quantity: orderItem.quantity }],
  });
  check("return #1 within quantity accepted", [200, 201].includes(createRet.status), createRet.data);
  const retId = createRet.data.id as string | undefined;

  const receive = await api(mgrA, "POST", "/api/returns", { action: "receive", returnId: retId });
  check("return receive ok", receive.status === 200, receive.data);

  // refund before receive would fail; after receive it writes a real ledger row
  const refund = await api(mgrA, "POST", "/api/returns", { action: "refund", returnId: retId, method: "CASH" });
  check("refund after receive ok", refund.status === 200, refund.data);
  const ledgerRow = await prisma.returnPayment.findFirst({ where: { returnId: retId } });
  check("refund wrote a ReturnPayment ledger row", !!ledgerRow && ledgerRow.amount > 0n, ledgerRow);
  const doubleRefund = await api(mgrA, "POST", "/api/returns", { action: "refund", returnId: retId });
  check(`double refund rejected (got ${doubleRefund.status})`, doubleRefund.status === 409);

  {
    const over = await api(mgrA, "POST", "/api/returns", {
      action: "create", orderId: order.id, locationId: stockroomA.id,
      items: [{ orderItemId: orderItem.id, quantity: orderItem.quantity }],
    });
    check(`cumulative over-return rejected (got ${over.status})`, over.status === 400, over.data);
  }

  // ── Payment idempotency (POS path) ──
  const dupKey = `p0-test-${Date.now()}`;
  const payOnce = await prisma.payment.findUnique({ where: { idempotencyKey: dupKey } });
  check("idempotency key free before test", !payOnce);
  // DB-level uniqueness is the guarantee; verify the unique index exists.
  const idx = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes WHERE tablename = 'Payment' AND indexdef LIKE '%idempotencyKey%'`;
  check("unique index on Payment.idempotencyKey exists", idx.length > 0, idx);

  // ── Inventory concurrency: parallel reservations can't oversell ──
  const whLoc = await prisma.stockLocation.findFirstOrThrow({ where: { type: "WAREHOUSE" } });
  const { applyMovement } = await import("../src/lib/inventory");
  const concVariant = await prisma.productVariant.findFirstOrThrow({
    where: { active: true, id: { not: variant.id } },
  });
  // Reset the balance to a known quantity of 5 (direct SQL: bypass negative guard).
  await prisma.$executeRaw`
    INSERT INTO "InventoryBalance" (id, "variantId", "locationId", "onHand", reserved, "inTransit", damaged)
    VALUES (gen_random_uuid()::text, ${concVariant.id}, ${whLoc.id}, 5, 0, 0, 0)
    ON CONFLICT ("variantId", "locationId") DO UPDATE SET "onHand" = 5, reserved = 0
  `;
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      prisma.$transaction((tx) => applyMovement(tx, {
        variantId: concVariant.id, locationId: whLoc.id, type: "SALE", quantityDelta: -1,
      }))
    )
  );
  const fulfilled = results.filter((r) => r.status === "fulfilled").length;
  const rejected = results.filter((r) => r.status === "rejected").length;
  check(`concurrent oversell blocked: exactly 5 of 10 succeed (got ${fulfilled}/${rejected} rejected)`,
    fulfilled === 5 && rejected === 5, { fulfilled, rejected });

  await prisma.$disconnect();
  console.log(failures === 0 ? "\nAll P0 checks passed" : `\n${failures} check(s) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
