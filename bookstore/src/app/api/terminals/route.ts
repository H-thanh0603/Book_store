import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const storeId = req.nextUrl.searchParams.get("storeId") ?? undefined;
    const terminals = await prisma.posTerminal.findMany({ where: { storeId } });
    return ok({ terminals });
  } catch (err) {
    return apiError(err);
  }
}
