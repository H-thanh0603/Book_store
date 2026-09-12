import { prisma } from "./db";
import { getSystemConfig } from "./api";

// N4b: birthday vouchers — every night, customers whose birthday (month/day)
// is today get a single-use fixed voucher valid 30 days. Idempotent: the code
// embeds customer + year, so a re-run is a no-op.
export async function issueBirthdayVouchers(): Promise<{ issued: number }> {
  const amount = await getSystemConfig<number>("loyalty.birthdayVoucherAmount", 50000);
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const year = today.getFullYear();

  // Month/day match in SQL (no TZ games: birthday stored dateless at UTC noon
  // by convention — EXTRACT compares calendar parts only).
  const customers = await prisma.$queryRaw<{ id: string; orgId: string; name: string }[]>`
    SELECT id, "orgId", name FROM "Customer"
    WHERE EXTRACT(MONTH FROM birthday) = ${month}
      AND EXTRACT(DAY FROM birthday) = ${day}`;
  let issued = 0;
  for (const c of customers) {
    const code = `BDAY-${year}-${c.id.slice(0, 8).toUpperCase()}`;
    const existing = await prisma.promotion.findUnique({ where: { code } });
    if (existing) continue;
    await prisma.promotion.create({
      data: {
        name: `Quà sinh nhật ${c.name} ${year}`,
        orgId: c.orgId,
        code,
        type: "fixed",
        value: BigInt(amount),
        channel: "ALL",
        usageLimit: 1,
        perCustomerLimit: 1,
        startAt: new Date(),
        endAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    issued++;
  }
  return { issued };
}
