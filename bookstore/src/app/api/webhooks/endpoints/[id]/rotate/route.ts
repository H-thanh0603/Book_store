// Rotate the signing secret on an endpoint. Returns the new secret
// once. After rotation, in-flight deliveries retry against the new
// secret (the next worker tick). Old secret is gone — receivers must
// update their stored credential at the same time.

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { withOrg } from "@/lib/org-scope";

function newSecret() {
  return randomBytes(32).toString("hex");
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("settings.write");
    const { id } = await params;
    const secret = newSecret();
    const result = await prisma.webhookEndpoint.updateMany({
      where: { id, ...withOrg(auth, {}) },
      data: { secret },
    });
    if (result.count === 0) return ok({ error: "NOT_FOUND" }, 404);
    return NextResponse.json({ id, secret });
  } catch (err) {
    return apiError(err);
  }
}
