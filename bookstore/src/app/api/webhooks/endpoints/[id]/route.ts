// PATCH/DELETE one endpoint. PATCH flips `active`, replaces
// `eventTypes`, updates `url`/`description` — secret is immutable
// here (use /rotate). DELETE cascades deliveries via the schema.
// orgId filter prevents cross-tenant write attempts.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { withOrg } from "@/lib/org-scope";
import { webhookUrlBlockReason } from "@/lib/ssrf";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("settings.write");
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      url?: string; eventTypes?: string[]; active?: boolean; description?: string | null;
    };
    const data: Record<string, unknown> = {};
    if (typeof body.url === "string") {
      const urlError = webhookUrlBlockReason(body.url);
      if (urlError) return ok({ error: "VALIDATION", message: urlError }, 400);
      data.url = body.url;
    }
    if (Array.isArray(body.eventTypes)) data.eventTypes = body.eventTypes.filter((e) => typeof e === "string");
    if (typeof body.active === "boolean") data.active = body.active;
    if (body.description === null || typeof body.description === "string") data.description = body.description;
    const updated = await prisma.webhookEndpoint.updateMany({
      where: { id, ...withOrg(auth, {}) },
      data,
    });
    if (updated.count === 0) return ok({ error: "NOT_FOUND" }, 404);
    const endpoint = await prisma.webhookEndpoint.findUniqueOrThrow({
      where: { id },
      select: { id: true, provider: true, url: true, eventTypes: true, active: true, description: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ endpoint });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("settings.write");
    const { id } = await params;
    const result = await prisma.webhookEndpoint.deleteMany({
      where: { id, ...withOrg(auth, {}) },
    });
    if (result.count === 0) return ok({ error: "NOT_FOUND" }, 404);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return apiError(err);
  }
}
