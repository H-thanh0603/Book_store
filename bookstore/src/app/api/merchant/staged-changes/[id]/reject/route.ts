// Reject a staged change: claims PENDING atomically → REJECTED + audit.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { observeRequest } from "@/lib/metrics";
import { reviewStagedChange } from "@/lib/staged-changes";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  const finish = (status: number) => observeRequest("/api/merchant/staged-changes/[id]/reject", "POST", status, Date.now() - startedAt);
  try {
    const { id } = await params;
    const auth = await requireAuth();
    const orgId = auth.orgId ?? (await prisma.organization.findFirstOrThrow({ orderBy: { createdAt: "asc" } })).id;
    const body = (await req.json().catch(() => null)) as { note?: string } | null;
    const permissions = auth.roles.flatMap((r) => r.permissions);
    const res = await reviewStagedChange(id, "REJECT", {
      orgId, userId: auth.userId, permissions,
    }, body?.note);
    if (!res.reviewed) {
      finish(400);
      return NextResponse.json({ code: "VALIDATION", message: res.reason }, { status: 400 });
    }
    finish(200);
    return ok({ status: res.status });
  } catch (error) {
    return apiError(error);
  }
}
