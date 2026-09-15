// List + create webhook endpoints. Permission: settings.write (org
// admin). Secrets are generated server-side and returned ONLY on the
// create/rotate response — every subsequent read omits `secret`. The
// endpoint owner is responsible for storing the secret; we cannot
// recover it. This is the same contract Stripe / GitHub use.
//
// URLs are screened against SSRF targets at create AND at delivery time
// (audit 2026-08-30 SEC-006, see src/lib/ssrf.ts).

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { withOrg } from "@/lib/org-scope";
import { assertPlanFeature, assertWithinPlanLimits } from "@/lib/plan-limits";
import { webhookUrlBlockReason } from "@/lib/ssrf";

function newSecret() {
  return randomBytes(32).toString("hex");
}

export async function GET() {
  try {
    const auth = await requirePermission("settings.write");
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: withOrg(auth, {}),
      orderBy: { createdAt: "desc" },
      // Audit: hard ceiling — endpoint count is operator-controlled and small;
      // the cap only guards against pathological data, not real usage.
      take: 200,
      select: { id: true, provider: true, url: true, eventTypes: true, active: true, description: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ endpoints });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("settings.write");
    // Webhook endpoints are org-owned resources — a caller without an org
    // has nothing to attach the endpoint to (was a raw 500 before).
    if (!auth.orgId) return ok({ error: "VALIDATION", message: "caller has no organization" }, 400);
    // Plan gates (BILL-001): webhooks are a paid feature, and even on paid
    // plans the endpoint count is bounded.
    await assertPlanFeature(auth, "webhooks");
    await assertWithinPlanLimits(auth, { webhookEndpoints: 1 });
    const body = (await req.json().catch(() => ({}))) as {
      provider?: string; url?: string; eventTypes?: string[]; description?: string;
    };
    if (!body.provider || !body.url) return ok({ error: "VALIDATION", message: "provider and url required" }, 400);
    const urlError = webhookUrlBlockReason(body.url);
    if (urlError) return ok({ error: "VALIDATION", message: urlError }, 400);
    const eventTypes = Array.isArray(body.eventTypes) ? body.eventTypes.filter((e) => typeof e === "string") : [];
    const secret = newSecret();
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        orgId: auth.orgId!,
        provider: body.provider,
        url: body.url,
        secret,
        eventTypes,
        description: body.description ?? null,
      },
      // secret is returned exactly once, on creation (write-only afterwards)
      select: { id: true, provider: true, url: true, eventTypes: true, active: true, description: true, createdAt: true, secret: true },
    });
    return NextResponse.json({ endpoint }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
