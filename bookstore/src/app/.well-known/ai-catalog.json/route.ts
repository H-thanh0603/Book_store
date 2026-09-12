import { NextRequest, NextResponse } from "next/server";

// Agentic Resource Discovery catalog (Google ARD, June 2026): a machine
// catalog of this domain's agent capabilities, hosted at the well-known
// path so registries can crawl it. Domain ownership is the identity root
// (we ARE the domain); no third-party registry enrollment is claimed.
//
// Honesty notes (deliberate deviations from a maximal ARD catalog):
// - No trust-manifest signatures yet: ARD's cryptographic layer needs a
//   publisher key ceremony we haven't run. The catalog is served over
//   HTTPS from our own domain — that is the entire trust claim for now.
// - ask_concierge is an HTTP tool, not MCP: listed with its native
//   protocol instead of being force-fit into an MCP envelope.
export function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  return NextResponse.json(
    {
      kind: "ai-catalog",
      version: "1.1.0",
      publisher: {
        name: "Melio Bookstore",
        domain: req.nextUrl.host,
        humanEntry: `${origin}/shop`,
      },
      capabilities: [
        {
          kind: "mcp-server",
          name: "melio-bookstore",
          endpoint: `${origin}/api/mcp`,
          protocolVersion: "2025-06-18",
          tools: ["search_products", "quote_order", "track_order"],
          auth: { type: "api-key", header: "x-agent-key", required: false },
          discovery: `${origin}/.well-known/mcp-server`,
        },
        {
          kind: "http-tool",
          name: "ask_concierge",
          endpoint: `${origin}/api/concierge`,
          method: "POST",
          description:
            "AI librarian grounded in the live catalog. Read-only; max 8-turn history.",
          auth: { type: "api-key", header: "x-agent-key", required: false },
        },
        {
          kind: "http-tool",
          name: "track_order",
          endpoint: `${origin}/api/storefront/track`,
          method: "GET",
          description:
            "Two-factor delivery lookup (order number + phone). Shipping status only, no PII.",
          auth: { type: "api-key", header: "x-agent-key", required: false },
        },
      ],
      policies: {
        readOnly:
          "All catalog capabilities are read-only. Checkout, payment and refund require the human shopper.",
        provenance:
          "AI-generated content served by this domain carries W3C PROV attribution (prov:wasGeneratedBy). See /.well-known/agent §provenance.",
        sessionLog:
          "Every agent tool call appends a hash-chained, independently verifiable event. Verify at GET /api/agent-events/verify.",
      },
      docs: `${origin}/llms.txt`,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=300",
      },
    }
  );
}
