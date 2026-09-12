import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api";
import { listStorefrontProducts, quoteStorefrontOrder } from "@/lib/storefront";
import { agentRateLimit, finishAgentCall, type ResolvedAgentKey } from "@/lib/agent-auth";

// Minimal MCP server over Streamable-HTTP-compatible JSON-RPC (stateless).
//
// Why this exists: IETF draft-serra-mcp-discovery + Google ARD both assume
// agents discover an MCP-speaking endpoint. Our 4 REST tools already do the
// work — this route speaks enough MCP wire protocol (initialize,
// tools/list, tools/call, ping) that any MCP client can use them with zero
// Melio-specific code. ask_concierge stays HTTP-only (it streams LLM tokens,
// which JSON-RPC tools/call models poorly) and is documented as such.
//
// Auth: x-agent-key header (A1). Anonymous callers get the same IP buckets
// as the REST equivalents. No OAuth — documented honestly in the discovery
// doc instead of pretending otherwise.

const PROTOCOL_VERSION = "2025-06-18";

const TOOLS = [
  {
    name: "search_products",
    description: "Search the public book catalog with live price and per-store stock. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Keyword (title/author/category), max 80 chars" },
        categoryId: { type: "string", description: "Optional category filter" },
        storeId: { type: "string", description: "Optional store id (defaults to first branch)" },
      },
    },
  },
  {
    name: "quote_order",
    description: "Price preview (totals, discounts, coupons) WITHOUT creating an order. Always call before showing a final price.",
    inputSchema: {
      type: "object",
      properties: {
        storeId: { type: "string" },
        couponCode: { type: "string" },
        items: { type: "string", description: "variantId:quantity pairs, comma-separated" },
      },
      required: ["items"],
    },
  },
  {
    name: "track_order",
    description: "Delivery status lookup. Requires BOTH order number and ordering phone; returns shipping status only, no personal data.",
    inputSchema: {
      type: "object",
      properties: {
        number: { type: "string" },
        phone: { type: "string" },
      },
      required: ["number", "phone"],
    },
  },
];

function rpcError(id: unknown, code: number, message: string, data?: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message, data } });
}

function rpcOk(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function normPhone(v: string) {
  return v.replace(/\D/g, "").replace(/^84/, "").replace(/^0/, "");
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  let agentKey: ResolvedAgentKey | null = null;
  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    body = (await req.json().catch(() => null)) as typeof body;
  } catch (e) {
    return apiError(e);
  }
  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string")
    return rpcError(body?.id, -32600, "Invalid Request: expected JSON-RPC 2.0 with method");
  const { id, method, params = {} } = body;

  try {
    // Keyed quota per MCP method; anonymous falls back to the REST buckets.
    const anonNs: Record<string, [string, number]> = {
      "tools/call": ["storefront-catalog", 60],
      initialize: ["storefront-catalog", 60],
      "tools/list": ["storefront-catalog", 60],
      ping: ["storefront-catalog", 60],
    };
    const [ns, limit] = anonNs[method] ?? ["storefront-catalog", 60];
    agentKey = await agentRateLimit(req, `mcp:${method}`, ns, limit);

    if (method === "initialize") {
      await finishAgentCall(req, "mcp:initialize", agentKey, started);
      return rpcOk(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "melio-bookstore", version: "1.1.0" },
      });
    }
    if (method === "notifications/initialized") {
      return new NextResponse(null, { status: 202 });
    }
    if (method === "ping") {
      await finishAgentCall(req, "mcp:ping", agentKey, started);
      return rpcOk(id, {});
    }
    if (method === "tools/list") {
      await finishAgentCall(req, "mcp:tools/list", agentKey, started);
      return rpcOk(id, { tools: TOOLS });
    }
    if (method === "tools/call") {
      const name = String(params.name ?? "");
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) {
        await finishAgentCall(req, "mcp:tools/call", agentKey, started);
        return rpcError(id, -32602, `Unknown tool: ${name}`);
      }
      const result = await callTool(name, args);
      await finishAgentCall(req, `mcp:${name}`, agentKey, started);
      return rpcOk(id, { content: [{ type: "text", text: JSON.stringify(result).slice(0, 8000) }] });
    }
    return rpcError(id, -32601, `Method not found: ${method}`);
  } catch (error) {
    await finishAgentCall(req, `mcp:${method}`, agentKey, started, error);
    const st = (error as { status?: number; message?: string }).status;
    if (st === 429 || st === 400 || st === 404)
      return rpcError(id, -32000, (error as Error).message);
    return apiError(error);
  }
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === "search_products") {
    const catalog = await listStorefrontProducts({
      q: typeof args.q === "string" ? args.q.slice(0, 80) : null,
      categoryId: typeof args.categoryId === "string" ? args.categoryId : null,
      storeId: typeof args.storeId === "string" ? args.storeId : null,
    });
    return {
      storeId: catalog.storeId,
      products: (catalog.products as { name: string }[]).slice(0, 20).map((p) => ({
        ...p,
        variants: (p as unknown as { variants: unknown[] }).variants.slice(0, 5),
      })),
    };
  }
  if (name === "quote_order") {
    const items = String(args.items ?? "")
      .split(",").filter(Boolean).map((chunk) => {
        const [variantId, quantity] = chunk.split(":");
        return { variantId, quantity: Number(quantity) || 0 };
      }).filter((i) => i.variantId && i.quantity > 0);
    return quoteStorefrontOrder({
      storeId: typeof args.storeId === "string" ? args.storeId : null,
      couponCode: typeof args.couponCode === "string" ? args.couponCode : null,
      items,
    });
  }
  // track_order: same two-factor lookup as the REST route (number + phone),
  // shipping status only — no names, phones or addresses leave the system.
  const number = String(args.number ?? "").trim().toUpperCase();
  const phone = String(args.phone ?? "").trim();
  if (!number || !phone) throw Object.assign(new Error("number and phone are required"), { status: 400 });
  const order = await prisma.order.findUnique({
    where: { number },
    select: {
      number: true, status: true, createdAt: true,
      store: { select: { name: true } },
      customer: { select: { phone: true } },
      shipment: { select: { carrier: true, trackingNumber: true, status: true } },
    },
  });
  if (!order?.customer.phone || normPhone(order.customer.phone) !== normPhone(phone))
    return { order: null };
  // customer.phone was selected for verification only — strip it before return.
  const { customer: _verified, ...safe } = order;
  void _verified;
  return { order: safe };
}
