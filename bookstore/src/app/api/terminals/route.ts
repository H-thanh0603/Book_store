import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, resolveStoreScope } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    const storeId = req.nextUrl.searchParams.get("storeId") ?? undefined;
    const scope = resolveStoreScope(auth, storeId);
    const terminals = await prisma.posTerminal.findMany({
      where: scope ? { storeId: { in: scope } } : storeId ? { storeId } : undefined,
    });
    return ok({ terminals });
  } catch (err) {
    return apiError(err);
  }
}
