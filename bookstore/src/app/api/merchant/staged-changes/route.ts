// Staged changes API — the merchant approval surface.
// GET: list (perm: any staged kind's read — reports.store.view minimum).
// POST: propose a staged write (per-kind permission; model proposes PENDING).
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { observeRequest } from "@/lib/metrics";
import { listStagedChanges, proposeStagedChange } from "@/lib/staged-changes";
import { defaultOrgId } from "@/lib/org-scope";

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const finish = (status: number) => observeRequest("/api/merchant/staged-changes", "GET", status, Date.now() - startedAt);
  try {
    const auth = await requireAuth();
    // Scoped review list: never "the oldest org" (cross-tenant targeting).
    const orgId = auth.orgId ?? (await defaultOrgId());
    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    const rows = await listStagedChanges(orgId, status);
    finish(200);
    return ok({ stagedChanges: rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const finish = (status: number) => observeRequest("/api/merchant/staged-changes", "POST", status, Date.now() - startedAt);
  try {
    const auth = await requireAuth();
    const orgId = auth.orgId ?? (await defaultOrgId());
    const body = (await req.json().catch(() => null)) as {
      kind?: string; title?: string; payload?: Record<string, unknown>;
    } | null;
    const permissions = auth.roles.flatMap((r) => r.permissions);
    const res = await proposeStagedChange(
      String(body?.kind ?? ""),
      String(body?.title ?? ""),
      (body?.payload ?? {}) as Record<string, unknown>,
      { orgId, userId: auth.userId, permissions },
    );
    if (!res.proposed) {
      finish(400);
      return NextResponse.json({ code: "VALIDATION", message: res.reason }, { status: 400 });
    }
    finish(201);
    return ok({ id: res.id, kind: res.kind, status: "PENDING" }, 201);
  } catch (error) {
    return apiError(error);
  }
}
