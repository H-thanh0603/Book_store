import { describe, expect, it } from "vitest";
import { buildAgentManifest } from "./agent";

describe("agent manifest", () => {
  it("exposes read-only tools and human-in-the-loop policy", () => {
    const manifest = buildAgentManifest("https://example.com");

    expect(manifest.tools.length).toBeGreaterThanOrEqual(4);
    // No tool may auto-checkout: consequential actions always need a human.
    for (const tool of manifest.tools) {
      expect(tool.readOnly).toBe(true);
    }
    const paths = manifest.tools.map((t) => `${t.method} ${t.path}`);
    expect(paths).toContain("GET /api/storefront");
    expect(paths).toContain("GET /api/storefront/quote");
    expect(paths).toContain("GET /api/storefront/track");
    // POST checkout must NOT appear as an agent tool.
    expect(JSON.stringify(manifest)).not.toContain("POST /api/storefront\"");
    expect(manifest.policies.consequentialActions).toMatch(/KHÔNG.*POST \/api\/storefront/);
    expect(manifest.docs).toBe("https://example.com/llms.txt");
  });

  it("v1.2 advertises MCP + ARD discovery and key auth", () => {
    const manifest = buildAgentManifest("https://example.com");
    expect(manifest.version).toBe("1.2.0");
    expect(manifest.discovery.mcpEndpoint).toBe("/api/mcp");
    expect(manifest.discovery.aiCatalog).toBe("/.well-known/ai-catalog.json");
    expect(manifest.auth.header).toBe("x-agent-key");
  });

  it("v1.2 adds read-only prepare_checkout handoff and memory policy", () => {
    const manifest = buildAgentManifest("https://example.com");
    const prepare = manifest.tools.find((t) => t.name === "prepare_checkout");
    expect(prepare).toMatchObject({ readOnly: true, requiresHumanApproval: false });
    // Still no direct checkout mutation anywhere in the manifest.
    expect(JSON.stringify(manifest)).not.toContain("POST /api/storefront\"");
    expect(manifest.policies.memory).toMatch(/allowlist/);
  });
});
