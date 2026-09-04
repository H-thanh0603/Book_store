// Agent 2 — idempotency + spec-baseline check for prisma/seed.ts.
// Run twice in CI/dev: second run must not create duplicates or throw unique violations.
// Usage: npx tsx scripts/tests/test-seed-idempotent.ts
import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { execSync } from "child_process";

const prisma = new PrismaClient({
  adapter: new PrismaPg(new pg.Pool({ connectionString: process.env.DATABASE_URL })),
});

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`PASS: ${msg}`);
}

const counts = () =>
  Promise.all([
    prisma.product.count(),
    prisma.supplier.count(),
    prisma.customer.count(),
  ]).then(([products, suppliers, customers]) => ({ products, suppliers, customers }));

async function main() {
const before = await counts();
console.log("before:", before);
execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
const after1 = await counts();
console.log("after re-run:", after1);

assert(after1.products === before.products, `idempotent products (${after1.products})`);
assert(after1.suppliers === before.suppliers, `idempotent suppliers (${after1.suppliers})`);
assert(after1.customers === before.customers, `idempotent customers (${after1.customers})`);

// Baseline per master spec §2358-2361
assert(after1.products >= 100 && after1.products <= 500, `baseline products 100–500 (${after1.products})`);
assert(after1.suppliers >= 20, `baseline suppliers >=20 (${after1.suppliers})`);
assert(after1.customers >= 100, `baseline customers >=100 (${after1.customers})`);

await prisma.$disconnect();
console.log("ALL PASS");
}
main().catch((e) => { console.error(e); process.exit(1); });
