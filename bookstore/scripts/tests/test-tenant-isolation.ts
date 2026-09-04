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

    // 3. Cross-org eventId never surfaces for A
    const eventId = `iso-${Date.now()}`;
    await prisma.webhookDelivery.create({ data: { endpointId: epB.id, eventId, eventType: "iso.x", payload: {} } });
    const aDeliveries = await prisma.webhookDelivery.findMany({
      where: { ...withOrg(auth(orgA.id)), eventId },
    });
    assert.equal(aDeliveries.length, 0, "A must not see B's delivery");

    // 4. assertSameOrg catches the cross-claim attack
    assert.throws(() => assertSameOrg(auth(orgA.id), orgB.id), /org mismatch/);

    console.log(`[${RUN_ID}] OK -- tenant isolation verified for ${orgA.slug} / ${orgB.slug}`);
  } finally {
    await prisma.webhookDelivery.deleteMany({ where: { endpointId: { in: [epA.id, epB.id] } } });
    await prisma.webhookEndpoint.deleteMany({ where: { id: { in: [epA.id, epB.id] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
