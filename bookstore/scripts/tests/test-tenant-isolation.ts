// Tenant isolation smoke. Spins up two orgs (A and B) with one
// WebhookEndpoint each, then asserts:
//   - listing WebhookEndpoint with withOrg(A) returns only A's
//   - listing with withOrg(B) returns only B's
//   - the cross-org eventId does not surface in A's list
//   - assertSameOrg(A, B) throws
//
// This exercises the helpers in src/lib/org-scope.ts against a real
// Postgres. Run after `prisma migrate deploy` so the new columns exist.
//
// Run: npm run test:tenant

import assert from "node:assert/strict";
import "dotenv/config";
import { prisma } from "../../src/lib/db";
import { withOrg, assertSameOrg } from "../../src/lib/org-scope";
import {
  getDigestStats,
  getListingIssues,
  getSlowMovers,
  getTopSuggestions,
} from "../../src/lib/merchant-agent";
import type { AuthContext } from "../../src/lib/auth";

const RUN_ID = `tenant-iso-${Date.now()}`;

function auth(orgId: string): AuthContext {
  return {
    userId: "u-" + orgId, email: `${orgId}@x.vn`, orgId, orgStatus: "ACTIVE", trialEndsAt: null, roles: [],
  };
}

async function main() {
  const orgA = await prisma.organization.create({ data: { name: "Org A", slug: `org-a-${RUN_ID}`, status: "TRIAL", trialEndsAt: new Date(Date.now() + 86_400_000) } });
  const orgB = await prisma.organization.create({ data: { name: "Org B", slug: `org-b-${RUN_ID}`, status: "TRIAL", trialEndsAt: new Date(Date.now() + 86_400_000) } });
  const cat = await prisma.category.create({ data: { name: `IsoCat-${RUN_ID}` } });
  const epA = await prisma.webhookEndpoint.create({ data: { orgId: orgA.id, provider: "iso", url: "https://a.example.com", secret: "s-a", eventTypes: [] } });
  const epB = await prisma.webhookEndpoint.create({ data: { orgId: orgB.id, provider: "iso", url: "https://b.example.com", secret: "s-b", eventTypes: [] } });

  try {
    // 1. withOrg A -> only A's endpoint
    const seenByA = await prisma.webhookEndpoint.findMany({ where: withOrg(auth(orgA.id)) });
    assert.equal(seenByA.length, 1, "A should see exactly one endpoint");
    assert.equal(seenByA[0].id, epA.id);

    // 2. withOrg B -> only B's
    const seenByB = await prisma.webhookEndpoint.findMany({ where: withOrg(auth(orgB.id)) });
    assert.equal(seenByB.length, 1, "B should see exactly one endpoint");
    assert.equal(seenByB[0].id, epB.id);

    // 3. Cross-org eventId never surfaces for A. WebhookDelivery carries no
    // direct orgId column (org reached via endpoint), so org-scope through
    // endpoint: { orgId } — the shape withOrg() produces for direct-org models.
    const eventId = `iso-${Date.now()}`;
    await prisma.webhookDelivery.create({ data: { endpointId: epB.id, eventId, eventType: "iso.x", payload: {} } });
    const aDeliveries = await prisma.webhookDelivery.findMany({
      where: { endpoint: { orgId: orgA.id }, eventId },
    });
    assert.equal(aDeliveries.length, 0, "A must not see B's delivery");

    // 4. assertSameOrg catches the cross-claim attack
    assert.throws(() => assertSameOrg(auth(orgA.id), orgB.id), /org mismatch/);

    // 5. Merchant-agent read tools are org-scoped (audit: cross-tenant leak).
    //    Two orgs each get a product/variant/balance/suggestion; tools scoped
    //    to A must never return or count B's rows.
    const regionA = await prisma.region.create({ data: { name: `RA-${RUN_ID}`, orgId: orgA.id } });
    const regionB = await prisma.region.create({ data: { name: `RB-${RUN_ID}`, orgId: orgB.id } });
    const storeA = await prisma.store.create({ data: { code: `IA${Date.now() % 1_000_000}`, orgId: orgA.id, name: "IsoA", regionId: regionA.id } });
    const storeB = await prisma.store.create({ data: { code: `IB${Date.now() % 1_000_000}`, orgId: orgB.id, name: "IsoB", regionId: regionB.id } });
    const locA = await prisma.stockLocation.create({ data: { name: `LA-${RUN_ID}`, type: "STORE_SHELF", storeId: storeA.id } });
    const locB = await prisma.stockLocation.create({ data: { name: `LB-${RUN_ID}`, type: "STORE_SHELF", storeId: storeB.id } });
    const prodA = await prisma.product.create({ data: { name: "ProdA", orgId: orgA.id, categoryId: cat.id, status: "active" } });
    const prodB = await prisma.product.create({ data: { name: "ProdB", orgId: orgB.id, categoryId: cat.id, status: "active" } });
    const varA = await prisma.productVariant.create({ data: { sku: `ISOA-${RUN_ID}`, orgId: orgA.id, productId: prodA.id, name: "A" } });
    const varB = await prisma.productVariant.create({ data: { sku: `ISOB-${RUN_ID}`, orgId: orgB.id, productId: prodB.id, name: "B" } });
    await prisma.inventoryBalance.createMany({ data: [
      { variantId: varA.id, locationId: locA.id, onHand: 0 },   // A: out-of-stock line
      { variantId: varA.id, locationId: locB.id, onHand: 15 },  // slow mover
      { variantId: varB.id, locationId: locA.id, onHand: 0 },   // B: out-of-stock line
      { variantId: varB.id, locationId: locB.id, onHand: 20 },  // B's slow mover
    ] });
    const sugA = await prisma.replenishmentSuggestion.create({ data: {
      variantId: varA.id, locationId: locA.id, averageDailySales: 1, availableQty: 0,
      incomingQty: 0, safetyStock: 0, leadTimeDays: 7, recommendedQty: 10, rationale: {},
    } });
    await prisma.replenishmentSuggestion.create({ data: {
      variantId: varB.id, locationId: locB.id, averageDailySales: 1, availableQty: 0,
      incomingQty: 0, safetyStock: 0, leadTimeDays: 7, recommendedQty: 10, rationale: {},
    } });
    const supplierB = await prisma.supplier.create({ data: { code: `SB${Date.now() % 1_000_000}`, orgId: orgB.id, name: "SupB" } });
    const whB = await prisma.warehouse.create({ data: { name: `WB-${RUN_ID}` } });
    await prisma.purchaseOrder.create({ data: { number: `PO-ISO-${RUN_ID}`, supplierId: supplierB.id, warehouseId: whB.id, status: "pending_approval" } });
    await prisma.stockTransfer.create({ data: {
      number: `TRF-ISO-${RUN_ID}`,
      fromLocationId: locA.id, toLocationId: locB.id, status: "REQUESTED", requestedBy: "iso",
    } });

    const digestA = await getDigestStats({ orgId: orgA.id });
    assert.equal(digestA.pendingPO, 0, "A must not count B's pending PO");
    assert.equal(digestA.openSuggestions, 1, "A sees exactly its own open suggestion");
    assert.equal(digestA.outOfStockLines, 1, "A counts only its own zero-stock line");
    assert.equal(digestA.openTransfers, 1, "A counts only its own open transfer");
    const digestB = await getDigestStats({ orgId: orgB.id });
    assert.equal(digestB.openTransfers, 0, "B must not count A's open transfer");

    const slowA = await getSlowMovers({ orgId: orgA.id }, 20);
    assert.ok(slowA.every((r) => r.sku !== `ISOB-${RUN_ID}`), "slow movers must not leak B's variants");
    assert.ok(slowA.some((r) => r.sku === `ISOA-${RUN_ID}`), "slow movers include A's own stock");
    const topA = await getTopSuggestions({ orgId: orgA.id }, undefined, 20);
    assert.deepEqual(topA.map((s) => s.id), [sugA.id], "A sees only its own suggestion");
    const issuesA = await getListingIssues({ orgId: orgA.id });
    assert.ok(issuesA.length >= 1, "A's missing-description product is flagged");
    assert.ok(issuesA.every((i) => i.productId === prodA.id), "listing issues must not leak B's products");

    console.log(`[${RUN_ID}] OK -- merchant-agent tools org-scoped for ${orgA.slug} / ${orgB.slug}`);
  } finally {
    // Cleanup: children first (no cascades on several of these relations).
    await prisma.stockTransfer.deleteMany({ where: { OR: [{ fromLocation: { store: { region: { orgId: { in: [orgA.id, orgB.id] } } } } }, { toLocation: { store: { region: { orgId: { in: [orgA.id, orgB.id] } } } } }] } });
    await prisma.purchaseOrder.deleteMany({ where: { supplier: { orgId: { in: [orgA.id, orgB.id] } } } });
    await prisma.supplier.deleteMany({ where: { orgId: { in: [orgA.id, orgB.id] } } });
    await prisma.warehouse.deleteMany({ where: { name: `WB-${RUN_ID}` } });
    await prisma.replenishmentSuggestion.deleteMany({ where: { variant: { orgId: { in: [orgA.id, orgB.id] } } } });
    await prisma.inventoryBalance.deleteMany({ where: { variant: { orgId: { in: [orgA.id, orgB.id] } } } });
    await prisma.inventoryMovement.deleteMany({ where: { variant: { orgId: { in: [orgA.id, orgB.id] } } } });
    await prisma.productVariant.deleteMany({ where: { orgId: { in: [orgA.id, orgB.id] } } });
    await prisma.product.deleteMany({ where: { orgId: { in: [orgA.id, orgB.id] } } });
    await prisma.stockLocation.deleteMany({ where: { store: { region: { orgId: { in: [orgA.id, orgB.id] } } } } });
    await prisma.store.deleteMany({ where: { orgId: { in: [orgA.id, orgB.id] } } });
    await prisma.region.deleteMany({ where: { orgId: { in: [orgA.id, orgB.id] } } });
    await prisma.category.deleteMany({ where: { name: `IsoCat-${RUN_ID}` } });
    await prisma.webhookDelivery.deleteMany({ where: { endpointId: { in: [epA.id, epB.id] } } });
    await prisma.webhookEndpoint.deleteMany({ where: { id: { in: [epA.id, epB.id] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
