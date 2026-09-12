import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { withOrg } from "@/lib/org-scope";
import { apiError, reqStr } from "@/lib/api";
import { issueAgentKey } from "@/lib/agent-auth";

// Staff-only agent key management (A1). Plaintext is returned ONCE at
// creation — after that only the sha256 lives in the database.
export async function GET() {
  try {
    const auth = await requirePermission("admin.users");
    const keys = await prisma.agentKey.findMany({
      where: withOrg(auth),
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, label: true, quotaPerMin: true, status: true,
        lastUsedAt: true, createdAt: true,
      },
    });
    return NextResponse.json({ keys });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("admin.users");
    const body = (await req.json().catch(() => ({}))) as {
      label?: string;
      quotaPerMin?: number;
    };
    const label = reqStr(body.label, "label", 120);
    const issued = await issueAgentKey({
      label,
      orgId: auth.orgId,
      quotaPerMin: body.quotaPerMin,
      createdBy: auth.userId,
    });
    return NextResponse.json(
      { id: issued.id, key: issued.plaintext, quotaPerMin: issued.quotaPerMin },
      { status: 201 }
    );
  } catch (e) {
    return apiError(e);
  }
}
