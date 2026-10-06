import "dotenv/config";
import { prisma } from "../src/lib/db";
import { E2E_STAFF_EMAIL } from "./credentials";

export default async function globalTeardown() {
  const user = await prisma.user.findUnique({ where: { email: E2E_STAFF_EMAIL } });
  if (user) {
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.$disconnect();
}
