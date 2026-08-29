// Per-rule PATCH + DELETE. PATCH supports partial threshold/active
// updates; DELETE removes the override entirely so the rule falls
// back to SystemConfig + default. `withOrg` enforces multi-tenant
// isolation so a caller from org A cannot touch org B's row even
// if they guess the id.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { withOrg } from "@/lib/org-scope";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const auth = await requirePermission("settings.write");
    if (!auth.orgId) return ok({ code: "VALIDATION", message: "caller has no org" }, 400);
    const body = (await req.json().catch(() => ({}))) as { threshold?: number | string; active?: boolean };
    const data: { threshold?: bigint; active?: boolean } = {};
    if (body.threshold !== undefined) {
      const raw = typeof body.threshold === "string" ? Number(body.threshold) : body.threshold;
      if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0)
        return ok({ code: "VALIDATION", message: "threshold must be a non-negative number" }, 400);
      data.threshold = BigInt(Math.floor(raw));
    }
    if (body.active !== undefined) data.active = !!body.active;
    if (Object.keys(data).length === 0) return ok({ code: "VALIDATION", message: "no fields to update" }, 400);
    const rule = await prisma.lossPreventionRule.update({
      where: withOrg(auth, { id }),
      data,
    });
    return NextResponse.json({
      id: rule.id, kind: rule.kind, threshold: Number(rule.threshold), active: rule.active,
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const auth = await requirePermission("settings.write");
    if (!auth.orgId) return ok({ code: "VALIDATION", message: "caller has no org" }, 400);
    await prisma.lossPreventionRule.delete({ where: withOrg(auth, { id }) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
