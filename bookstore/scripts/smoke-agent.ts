#!/usr/bin/env tsx
// Agent smoke tour (no LLM key needed): verifies the commerce-agent parity
// surface end to end — manifest, backends, validators, MCP tool list shape,
// staged propose→reject cycle (row cleaned up; propose/reject audit rows
// remain as evidence), managed manifests. Run: npx tsx scripts/smoke-agent.ts
import "../src/lib/db"; // ensure env loads like other scripts (dotenv via prisma.config chain)
import { buildAgentManifest } from "../src/lib/agent";
import {
  getMerchantBackend,
  getStorefrontBackend,
  isUnavailable,
  resetCommerceBackends,
} from "../src/lib/commerce/index";
import { encodeAgentCart, encodeAgentCartSigned, parseAgentCartParam } from "../src/lib/agent-cart";
import { validateMemoryInput } from "../src/lib/customer-memory";
import {
  proposeStagedChange,
  reviewStagedChange,
  validateStagedPayload,
} from "../src/lib/staged-changes";
import { prisma } from "../src/lib/db";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const scriptsDir = dirname(fileURLToPath(import.meta.url));
const shoppingManifest = JSON.parse(readFileSync(join(scriptsDir, "../managed-agents/shopping-agent.json"), "utf8")) as { tools: string[]; manifestVersion: string };
const merchantManifest = JSON.parse(readFileSync(join(scriptsDir, "../managed-agents/merchant-agent.json"), "utf8")) as { stagedKinds: string[]; manifestVersion: string };

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

async function main() {
  // 1. Manifest v1.2: read-only tools, no direct checkout, memory policy.
  const manifest = buildAgentManifest("https://example.com");
  check("manifest version 1.2.0", manifest.version === "1.2.0", manifest.version);
  check("all tools read-only", manifest.tools.every((t) => t.readOnly));
  check("no POST /api/storefront tool", !JSON.stringify(manifest).includes("POST /api/storefront\""));
  check("memory policy", /allowlist/.test(manifest.policies.memory));

  // 2. Stub backends: every method unavailable, prompt bytes untouched.
  process.env.COMMERCE_BACKEND = "stub";
  resetCommerceBackends();
  const storeStub = getStorefrontBackend();
  const merchStub = getMerchantBackend();
  check("stub search unavailable", isUnavailable(await storeStub.searchProducts({ q: "x" })));
  check("stub card unavailable", isUnavailable(await storeStub.prepareCheckout({ storeId: "s", items: [] })));
  check("stub digest unavailable", isUnavailable(await merchStub.getDigestStats()));
  check("stub apply refuses", (await merchStub.applyChange({ kind: "promotion.create", payload: {} }) as { refused?: boolean }).refused === true);
  delete process.env.COMMERCE_BACKEND;
  resetCommerceBackends();
  check("prisma backend default", getStorefrontBackend().kind === "prisma");

  // 3. Pure validators.
  check("memory accepts genre", validateMemoryInput("genre", "trinh thám").ok);
  check("memory refuses secrets", !validateMemoryInput("budget", "thẻ 4111 1111 1111 1111").ok);
  check("staged rejects kind", !validateStagedPayload("order.refund", {}).ok);
  check("staged caps promo", !validateStagedPayload("promotion.create", { name: "x", type: "percentage", value: 50 }).ok);
  const cart = [{ variantId: "v1", quantity: 2, name: "Sách A", price: 120000 }];
  // v2 signed handoff (commit 169d303): unsigned payloads must be rejected,
  // signed payloads must round-trip. Use a throwaway secret when none is set.
  const hadCartSecret = !!process.env.AGENT_CART_SECRET;
  if (!hadCartSecret) process.env.AGENT_CART_SECRET = "smoke-test-secret-0123456789";
  check("agent_cart rejects unsigned", parseAgentCartParam(encodeAgentCart(cart)).length === 0);
  check("agent_cart round-trip", JSON.stringify(parseAgentCartParam(encodeAgentCartSigned(cart))) === JSON.stringify(cart));
  if (!hadCartSecret) delete process.env.AGENT_CART_SECRET;

  // 4. Managed manifests agree with code.
  check("shopping manifest tools", (shoppingManifest.tools as string[]).includes("prepare_checkout_card"));
  check("merchant manifest kinds", (merchantManifest.stagedKinds as string[]).length === 3);
  check("manifest versions match", shoppingManifest.manifestVersion === manifest.version && merchantManifest.manifestVersion === manifest.version);

  // 5. Staged propose→reject cycle against the real DB.
  const org = await prisma.organization.findFirst({ select: { id: true } });
  const user = org && await prisma.user.findFirst({ where: { orgId: org.id }, select: { id: true } });
  if (!org || !user) {
    check("db fixtures present", false, "no org/user — seed first");
  } else {
    const ctx = { orgId: org.id, userId: user.id, permissions: ["promotion.manage"] };
    const proposed = await proposeStagedChange("promotion.create", "Smoke promo (xóa sau test)", { name: "Smoke promo", type: "fixed", value: 10000 }, ctx);
    check("propose staged", proposed.proposed === true);
    if (proposed.proposed) {
      const rejected = await reviewStagedChange(proposed.id, "REJECT", ctx, "smoke test");
      check("reject staged", rejected.reviewed === true && rejected.status === "REJECTED");
      await prisma.stagedChange.delete({ where: { id: proposed.id } });
      console.log("PASS staged row cleaned up");
    }
  }

  await prisma.$disconnect();
  if (failures > 0) {
    console.error(`SMOKE FAILED: ${failures} check(s)`);
    process.exit(1);
  }
  console.log("SMOKE OK");
}

main().catch((err) => {
  console.error("SMOKE ERROR", err);
  process.exit(1);
});
