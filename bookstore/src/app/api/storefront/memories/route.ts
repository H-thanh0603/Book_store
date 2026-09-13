// Storefront customer memory self-service: list + delete what the concierge
// remembered. Session-only (bs_customer cookie) — the same SEC-008 boundary
// the concierge write path uses. GET returns entries; DELETE {key} removes
// one; the account page renders/links them.
import { NextRequest } from "next/server";
import { requireCustomerAuth } from "@/lib/customer-auth";
import { getMemories, forgetMemory } from "@/lib/customer-memory";
import { apiError, fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";

async function subjectFor(session: { customerId: string }) {
  const row = await prisma.customer.findFirst({
    where: { id: session.customerId },
    select: { orgId: true, id: true },
  });
  if (!row) fail(401, "UNAUTHORIZED", "Khách không tồn tại");
  return { orgId: row.orgId, customerId: row.id };
}

export async function GET() {
  try {
    const session = await requireCustomerAuth();
    const memories = await getMemories(await subjectFor(session));
    return ok({ memories });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireCustomerAuth();
    const body = (await req.json().catch(() => null)) as { key?: string } | null;
    if (!body?.key || typeof body.key !== "string") fail(400, "VALIDATION", "Thiếu key cần xóa");
    const { forgotten } = await forgetMemory(await subjectFor(session), body.key);
    return ok({ forgotten });
  } catch (error) {
    return apiError(error);
  }
}
