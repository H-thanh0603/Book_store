import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, resolveStoreScope } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    const storeId = req.nextUrl.searchParams.get("storeId") ?? undefined;
    const scope = resolveStoreScope(auth, storeId);
    // Tenant isolation (#7): org-wide role must not see other orgs' terminals.
    const terminals = await prisma.posTerminal.findMany({
      where: {
        ...(auth.orgId ? { store: { orgId: auth.orgId } } : {}),
        ...(scope ? { storeId: { in: scope } } : storeId ? { storeId } : {}),
      },
    });
    return ok({ terminals });
  } catch (err) {
    return apiError(err);
  }
}
