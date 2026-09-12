import { NextRequest, NextResponse } from "next/server";

// MCP server discovery (IETF draft-serra-mcp-discovery-uri §4): a client
// asking "does this domain speak MCP?" fetches /.well-known/mcp-server.
// We answer honestly: JSON-RPC surface is POST /api/mcp (initialize,
// tools/list, tools/call, ping — stateless, no SSE session needed), auth is
// x-agent-key (A1), and ask_concierge is intentionally HTTP-only.
export function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  return NextResponse.json(
    {
      name: "melio-bookstore",
      version: "1.1.0",
      protocolVersion: "2025-06-18",
      transport: {
        type: "streamable-http-stateless",
        endpoint: `${origin}/api/mcp`,
        notes:
          "Plain JSON-RPC 2.0 over POST. No mcp-session-id handshake required; every request is self-contained.",
      },
      capabilities: {
        tools: ["search_products", "quote_order", "track_order"],
        toolsHttpOnly: ["ask_concierge"],
      },
      auth: {
        type: "api-key",
        header: "x-agent-key",
        required: false,
        notes:
          "Anonymous callers share per-IP buckets (catalog 60/min, quote 60/min, track 20/min, concierge 20/min). Registered keys get a private per-minute quota. No OAuth — documented here instead of implied.",
      },
      policies: {
        consequentialActions:
          "Checkout, payment and refund are human-only. Agents quote, humans pay.",
        grounding:
          "Every product name/price cited must come from search_products or ask_concierge output. Never invent catalog data.",
      },
      docs: `${origin}/llms.txt`,
      catalog: `${origin}/.well-known/ai-catalog.json`,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=300",
      },
    }
  );
}
