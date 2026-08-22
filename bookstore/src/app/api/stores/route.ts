import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";

export async function GET() {
  try {
    await requireAuth();
    const stores = await prisma.store.findMany({ select: { id: true, name: true, code: true } });
    return ok({ stores });
  } catch (err) {
    return apiError(err);
  }
}
