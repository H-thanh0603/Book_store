import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/db";

const base = process.env.BASE_URL ?? "http://localhost:3001";

function check(name: string, condition: boolean, detail?: unknown) {
  if (!condition) throw new Error(`${name}: ${JSON.stringify(detail)}`);
  console.log(`✅ ${name}`);
}

async function main() {
  const catalogResponse = await fetch(`${base}/api/storefront`);
  const catalog = await catalogResponse.json();
  check("public catalog loads without staff session", catalogResponse.status === 200, catalog);
  check("catalog returns sellable products and active stores", catalog.products?.length > 0 && catalog.stores?.length > 0);
  const product = catalog.products[0];
  check("catalog does not expose raw balances or price records", !product.variants[0].balances && !product.variants[0].prices);

  const key = randomUUID();
  const phone = `09${String(Date.now()).slice(-8)}`;
  // Email must be unique per run: customer.upsert keys on phone while the
  // schema enforces unique email — a fixed email collides with any earlier
  // run's customer that has a different phone.
  const email = `storefront-${phone}@example.com`;
  const payload = {
    idempotencyKey: key,
    storeId: catalog.storeId,
    fulfillment: "delivery",
    customer: { name: "Khách Storefront Test", phone, email, address: "123 Đường Sách, Quận 1" },
    items: [{ variantId: product.variants[0].id, quantity: 1 }],
  };
  const firstResponse = await fetch(`${base}/api/storefront`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const first = await firstResponse.json();
  check("guest checkout creates a WEB order", firstResponse.status === 201, first);

  const retryResponse = await fetch(`${base}/api/storefront`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const retry = await retryResponse.json();
  check("checkout retry returns the same order", retryResponse.status === 201 && retry.number === first.number, retry);
  check("idempotency guard persisted one order", await prisma.order.count({ where: { externalId: `storefront:${key}` } }) === 1);

  const order = await prisma.order.findFirstOrThrow({
    where: { externalId: `storefront:${key}` }, include: { shipment: true, customer: true },
  });
  check("checkout stores customer and delivery details", order.customer.phone === phone && order.shipment?.address === payload.customer.address);
  console.log("\nStorefront checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
