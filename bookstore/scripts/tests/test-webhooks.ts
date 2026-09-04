// Webhook bus end-to-end smoke. Stands up a real endpoint via Node's
// built-in http server on a random port, points a WebhookEndpoint at it,
// emits an event, and asserts the POST landed with the expected HMAC
// signature header. No network, no sandbox creds.
//
// Run: npm run test:webhooks

import assert from "node:assert/strict";
import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { prisma } from "../../src/lib/db";
import { emit, processPendingDeliveries } from "../../src/lib/webhook-bus";
import { hmacSign } from "../../src/lib/einvoice";

const RUN_ID = `webhook-smoke-${Date.now()}`;

async function main() {
  // 1. Boot a tiny receiver and capture the POST.
  const received: Array<{ body: string; sig: string; eventId: string; type: string }> = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST") { res.statusCode = 404; res.end(); return; }
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      received.push({
        body: Buffer.concat(chunks).toString("utf8"),
        sig: String(req.headers["x-melio-signature"] ?? ""),
        eventId: String(req.headers["x-melio-event-id"] ?? ""),
        type: String(req.headers["x-melio-event-type"] ?? ""),
      });
      res.statusCode = 200;
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const url = `http://127.0.0.1:${port}/hook`;
  console.log(`[${RUN_ID}] receiver listening on ${url}`);

  try {
    // 2. Persist the endpoint.
    const secret = "smoke-secret-1234567890";
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        orgId: "default",
        provider: "smoke",
        url,
        secret,
        eventTypes: ["smoke.test"],
        active: true,
        description: "integration test",
      },
    });
    console.log(`[${RUN_ID}] endpoint created ${endpoint.id}`);

    // 3. Emit and run the worker.
    const eventId = `smoke-${Date.now()}`;
    const r = await emit({
      eventId,
      eventType: "smoke.test",
      orgId: "default",
      payload: { hello: "world" },
    });
    assert.equal(r.queued, 1, "expected one delivery queued");

    const processed = await processPendingDeliveries();
    assert.ok(processed.delivered >= 1, "expected delivery to land");

    // 4. Verify the receiver got it with the right signature.
    const got = received.find((x) => x.eventId === eventId);
    assert.ok(got, "receiver did not record the event");
    const expected = hmacSign(secret, got.body);
    assert.ok(got.sig.includes(expected), `signature mismatch: got=${got.sig} expected-contains=${expected}`);
    assert.equal(got.type, "smoke.test");

    // 5. Idempotency: emit again with the same eventId -> no new delivery.
    const r2 = await emit({ eventId, eventType: "smoke.test", orgId: "default", payload: {} });
    assert.equal(r2.queued, 0, "second emit should be a no-op");

    console.log(`[${RUN_ID}] OK -- sig match + dedup verified`);
  } finally {
    await prisma.webhookDelivery.deleteMany({ where: { endpoint: { provider: "smoke" } } });
    await prisma.webhookEndpoint.deleteMany({ where: { provider: "smoke" } });
    server.close();
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
