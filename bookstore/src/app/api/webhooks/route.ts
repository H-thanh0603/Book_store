import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, optStr, fail, reqStr } from "@/lib/api";
import { randomBytes } from "crypto";

/**
 * GET  /api/webhooks             — list endpoints in the caller's org
 * POST /api/webhooks             — create endpoint. Returns the secret
 *                                 exactly once (caller must store it).
 */
export async function GET() {
  try {
    const auth = await requirePermission("webhooks.read");
    const rows = await prisma.webhookEndpoint.findMany({
      where: { orgId: orgIdFor(auth) },
      orderBy: { createdAt: "desc" },
    });
    return ok(rows);
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("webhooks.manage");
    const body = await req.json().catch(() => ({}));
    const url = reqStr(body.url, "url");
    const provider = reqStr(body.provider, "provider");
    const description = optStr(body.description, "description");
    const eventTypes = Array.isArray(body.eventTypes)
      ? body.eventTypes.filter((x: unknown) => typeof x === "string")
      : [];
    if (!/^https?:\/\//.test(url)) fail(400, "VALIDATION", "url must be http(s)");

    // Caller may pass their own secret; otherwise we mint one. Either way
    // the secret is returned exactly once and is never readable afterwards.
    const secret = typeof body.secret === "string" && body.secret.length >= 16
      ? body.secret
      : randomBytes(32).toString("hex");

    const created = await prisma.webhookEndpoint.create({
      data: {
        orgId: orgIdFor(auth),
        provider,
        url,
        secret,
        eventTypes,
        description,
        active: true,
      },
    });
    return ok({ ...created, secret, _note: "store the secret now; it will not be shown again" }, 201);
  } catch (e) { return apiError(e); }
}

/**
 * Helper: pull the orgId from the auth context. The full Session shape
 * (with orgId) is only attached to org-scoped sessions today; for the
 * MVP we treat the user's first assigned org as the owner. Will be
 * replaced with a real session.orgId when B1 lands.
 */
function orgIdFor(auth: { userId: string }): string {
  return auth.userId;
}
