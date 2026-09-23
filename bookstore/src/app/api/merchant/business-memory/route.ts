// Business memory API: house rules the merchant agent grounds on.
// Staff only (admin.config). GET lists, POST sets, DELETE forgets.
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { apiError, fail, ok } from "@/lib/api";
import {
  BUSINESS_MEMORY_KEYS,
  forgetBusinessMemory,
  getBusinessMemories,
  setBusinessMemory,
} from "@/lib/business-memory";

export async function GET() {
  try {
    const auth = await requirePermission("admin.config");
    if (!auth.orgId) fail(403, "FORBIDDEN", "Org-scoped account required");
    return ok({ keys: BUSINESS_MEMORY_KEYS, memories: await getBusinessMemories(auth.orgId) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("admin.config");
    if (!auth.orgId) fail(403, "FORBIDDEN", "Org-scoped account required");
    const body = await req.json().catch(() => ({}));
    const res = await setBusinessMemory(
      auth.orgId, auth.userId,
      String(body?.key ?? ""), String(body?.value ?? ""),
    );
    if (!res.saved) fail(400, "VALIDATION", (res as { reason: string }).reason);
    return ok({ saved: true });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requirePermission("admin.config");
    if (!auth.orgId) fail(403, "FORBIDDEN", "Org-scoped account required");
    const key = req.nextUrl.searchParams.get("key") ?? "";
    return ok(await forgetBusinessMemory(auth.orgId, auth.userId, key));
  } catch (err) {
    return apiError(err);
  }
}
