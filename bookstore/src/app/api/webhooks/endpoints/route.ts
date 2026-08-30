// List + create webhook endpoints. Permission: settings.write (org
// admin). Secrets are generated server-side and returned ONLY on the
// create/rotate response — every subsequent read omits `secret`. The
// endpoint owner is responsible for storing the secret; we cannot
// recover it. This is the same contract Stripe / GitHub use.
//
// ponytail: URL is not validated beyond a `^https?://` regex. We
// don't DNS-resolve or HEAD-probe on create to avoid leaking the
// subscription to attacker-controlled hosts (the first delivery
// surfaces URL misconfiguration naturally).

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { withOrg } from "@/lib/org-scope";

function newSecret() {
  return randomBytes(32).toString("hex");
}

export async function GET() {
  try {
    const auth = await requirePermission("settings.write");
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: withOrg(auth, {}),
      orderBy: { createdAt: "desc" },
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
    const body = (await req.json().catch(() => ({}))) as {
      provider?: string; url?: string; eventTypes?: string[]; description?: string;
    };
    if (!body.provider || !body.url) return ok({ error: "VALIDATION", message: "provider and url required" }, 400);
    if (!/^https?:\/\//.test(body.url)) return ok({ error: "VALIDATION", message: "url must be http(s)" }, 400);
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
