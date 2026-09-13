// Two-way cart sync endpoint (storefront).
// GET  ?phone|customerId&storeId — the shop pulls the latest server cart.
// POST {phone|customerId, storeId, items, source:"shop"} — the shop pushes.
// Identity is host-provided like every other storefront route; no session
// cookie is minted here. Rate-limited per IP; lines are variantIds only.
import { NextRequest } from "next/server";
import { apiError, fail, ok } from "@/lib/api";
import { agentRateLimit, finishAgentCall, type ResolvedAgentKey } from "@/lib/agent-auth";
import { observeRequest } from "@/lib/metrics";
import { prismaRead } from "@/lib/db";
import { getServerCart, saveServerCart, type CartSubject } from "@/lib/server-cart";

async function resolveSubject(
  req: NextRequest,
  body?: { phone?: string; customerId?: string },
): Promise<CartSubject | null> {
  const phone = (body?.phone ?? req.nextUrl.searchParams.get("phone") ?? "").trim();
  const customerId = (body?.customerId ?? req.nextUrl.searchParams.get("customerId") ?? "").trim();
  if (customerId) {
    const row = await prismaRead.customer.findFirst({
      where: { id: customerId },
      select: { orgId: true, id: true },
    });
    return row ? { orgId: row.orgId, customerId: row.id } : null;
  }
  if (phone) {
    const row = await prismaRead.customer.findFirst({
      where: { phone },
      select: { orgId: true, phone: true },
    });
    return row ? { orgId: row.orgId, phone: row.phone } : null;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  let agentKey: ResolvedAgentKey | null = null;
  try {
    agentKey = await agentRateLimit(req, "get_server_cart", "storefront-cart", 30);
    const subject = await resolveSubject(req);
    const storeId = req.nextUrl.searchParams.get("storeId");
    const cart = subject ? await getServerCart(subject, storeId) : null;
    await finishAgentCall(req, "get_server_cart", agentKey, started);
    observeRequest("/api/storefront/cart", "GET", 200, Date.now() - started);
    return ok({ cart: cart ? { items: cart.items, source: cart.source, updatedAt: cart.updatedAt } : null });
  } catch (error) {
    await finishAgentCall(req, "get_server_cart", agentKey, started, error);
    observeRequest("/api/storefront/cart", "GET", (error as { status?: number }).status ?? 500, Date.now() - started);
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  let agentKey: ResolvedAgentKey | null = null;
  try {
    agentKey = await agentRateLimit(req, "save_server_cart", "storefront-cart", 30);
    const body = (await req.json().catch(() => null)) as {
      phone?: string; customerId?: string; storeId?: string; items?: unknown;
    } | null;
    const subject = await resolveSubject(req, body ?? undefined);
    if (!subject) fail(400, "VALIDATION", "Cần phone hoặc customerId (khách đã từng mua) để đồng bộ giỏ");
    const storeId = body?.storeId?.trim() || null;
    const cart = await saveServerCart(subject, storeId, body?.items, "shop");
    await finishAgentCall(req, "save_server_cart", agentKey, started);
    observeRequest("/api/storefront/cart", "POST", 200, Date.now() - started);
    return ok({ cart: { items: cart.items, source: cart.source, updatedAt: cart.updatedAt } });
  } catch (error) {
    await finishAgentCall(req, "save_server_cart", agentKey, started, error);
    observeRequest("/api/storefront/cart", "POST", (error as { status?: number }).status ?? 500, Date.now() - started);
    return apiError(error);
  }
}
