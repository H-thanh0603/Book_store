// Approve a staged change: claims PENDING atomically, applies via the same
// code as the manual flow, records APPLIED/FAILED + audit. Only one reviewer
// ever wins a row — double submits get "already reviewed".
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { observeRequest } from "@/lib/metrics";
import { reviewStagedChange } from "@/lib/staged-changes";
import { defaultOrgId } from "@/lib/org-scope";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  const finish = (status: number) => observeRequest("/api/merchant/staged-changes/[id]/approve", "POST", status, Date.now() - startedAt);
  try {
    const { id } = await params;
    const auth = await requireAuth();
    // Scope the claim to the caller's org (never "the oldest org").
    const orgId = auth.orgId ?? (await defaultOrgId());
    const body = (await req.json().catch(() => null)) as { note?: string } | null;
    const permissions = auth.roles.flatMap((r) => r.permissions);
    const res = await reviewStagedChange(id, "APPROVE", {
      orgId, userId: auth.userId, permissions, roles: auth.roles,
    }, body?.note);
    if (!res.reviewed) {
      finish(400);
      return NextResponse.json({ code: "VALIDATION", message: res.reason }, { status: 400 });
    }
    finish(200);
    return ok({ status: res.status, ...(res.status === "APPLIED" ? { appliedRef: res.appliedRef } : {}), ...(res.status === "FAILED" ? { error: res.error } : {}) });
  } catch (error) {
    return apiError(error);
  }
}
