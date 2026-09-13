import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/storefront", () => ({
  listStorefrontProducts: vi.fn(async () => ({
    storeId: "store-1",
    products: [{ id: "p1", name: "Sách A", variants: [{ id: "v1" }] }],
    categories: [],
    stores: [],
  })),
  quoteStorefrontOrder: vi.fn(async () => ({ subtotal: 100, discountTotal: 10, total: 90 })),
  trackStorefrontOrder: vi.fn(async () => ({
    order: {
      number: "MB-1",
      status: "SHIPPED",
      createdAt: new Date("2026-01-01"),
      total: 90,
      storeName: "Q1",
      shipment: null,
      items: [],
      stages: [],
    },
  })),
}));

vi.mock("@/lib/agent-auth", () => ({
  agentRateLimit: vi.fn(async () => null),
  finishAgentCall: vi.fn(async () => {}),
}));

vi.mock("@/lib/db", () => ({ prisma: {}, prismaRead: {} }));

import { POST } from "./route";

function rpc(method: string, params: Record<string, unknown> = {}, id: unknown = 1) {
  return new Request("https://x.test/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
}

describe("POST /api/mcp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("answers initialize with capabilities", async () => {
    const res = await POST(rpc("initialize") as never);
    const data = await res.json();
    expect(data.result.serverInfo.name).toBe("melio-bookstore");
    expect(data.result.capabilities.tools).toEqual({});
  });

  it("lists the 4 MCP tools (concierge stays HTTP-only)", async () => {
    const res = await POST(rpc("tools/list") as never);
    const data = await res.json();
    const names = data.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(["search_products", "quote_order", "track_order", "prepare_checkout_card"]);
  });

  it("calls search_products and truncates payload", async () => {
    const res = await POST(rpc("tools/call", { name: "search_products", arguments: { q: "sách" } }) as never);
    const data = await res.json();
    const text = data.result.content[0].text;
    expect(text).toContain("Sách A");
  });

  it("rejects unknown tools with -32602", async () => {
    const res = await POST(rpc("tools/call", { name: "checkout", arguments: {} }) as never);
    const data = await res.json();
    expect(data.error.code).toBe(-32602);
  });

  it("rejects non-JSON-RPC bodies with -32600", async () => {
    const res = await POST(
      new Request("https://x.test/api/mcp", { method: "POST", body: "{}" }) as never
    );
    const data = await res.json();
    expect(data.error.code).toBe(-32600);
  });

  it("tracks orders without leaking the verification phone", async () => {
    const res = await POST(
      rpc("tools/call", {
        name: "track_order",
        arguments: { number: "MB-1", phone: "0901234567" },
      }) as never
    );
    const data = await res.json();
    const order = JSON.parse(data.result.content[0].text).order;
    expect(order.number).toBe("MB-1");
    expect(JSON.stringify(order)).not.toContain("0901234567");
  });
});
