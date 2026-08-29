// List + upsert loss-prevention rule overrides. GET returns the
// effective threshold (per-org rule OR SystemConfig fallback) for
// every kind, plus the org's explicit row (if any) so the UI can
// show "default" vs "custom" cleanly. POST upserts.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { getRuleThreshold, RULE_TO_CONFIG, type RuleKind } from "@/lib/loss-prevention";

const KINDS = Object.keys(RULE_TO_CONFIG) as RuleKind[];

export async function GET() {
  try {
    const auth = await requirePermission("settings.write");
    if (!auth.orgId) return ok({ code: "VALIDATION", message: "caller has no org" }, 400);
    const overrides = await prisma.lossPreventionRule.findMany({ where: { orgId: auth.orgId } });
    const effective = await Promise.all(
      KINDS.map(async (kind) => ({
        kind,
        threshold: Number(await getRuleThreshold(auth.orgId!, kind)),
        isOverride: overrides.some((o) => o.kind === kind && o.active),
      })),
    );
    return NextResponse.json({ effective, overrides });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("settings.write");
    if (!auth.orgId) return ok({ code: "VALIDATION", message: "caller has no org" }, 400);
    const body = (await req.json().catch(() => ({}))) as { kind?: string; threshold?: number | string; active?: boolean };
    if (!body.kind || !(body.kind in RULE_TO_CONFIG))
      return ok({ code: "VALIDATION", message: `kind must be one of: ${KINDS.join(", ")}` }, 400);
    const raw = typeof body.threshold === "string" ? Number(body.threshold) : body.threshold;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0)
      return ok({ code: "VALIDATION", message: "threshold must be a non-negative number" }, 400);
    const rule = await prisma.lossPreventionRule.upsert({
      where: { orgId_kind: { orgId: auth.orgId, kind: body.kind as RuleKind } },
      create: { orgId: auth.orgId, kind: body.kind as RuleKind, threshold: BigInt(Math.floor(raw)), active: body.active ?? true },
      update: { threshold: BigInt(Math.floor(raw)), active: body.active ?? true },
    });
    return NextResponse.json({
      id: rule.id, kind: rule.kind, threshold: Number(rule.threshold), active: rule.active,
    }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
