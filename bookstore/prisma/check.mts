import { prisma } from "../src/lib/db";
const [stores, products, users, suppliers, posTx] = await Promise.all([
  prisma.store.count(), prisma.product.count(), prisma.user.count(), prisma.supplier.count(), prisma.posTransaction.count(),
]);
console.log(JSON.stringify({ stores, products, users, suppliers, posTx }));
await prisma.$disconnect();
