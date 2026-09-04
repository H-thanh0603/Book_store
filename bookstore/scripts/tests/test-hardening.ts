import "dotenv/config";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { prisma } from "../../src/lib/db";
import { runJob } from "../../src/lib/jobs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.SEED_USER_PASSWORD;
if (!PASSWORD) throw new Error("SEED_USER_PASSWORD is required");

async function main() {
  process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const { openSecret, sealSecret } = await import("../../src/lib/secret-box");
  const sealed = sealSecret("provider-secret-value");
  assert.notEqual(sealed, "provider-secret-value");
  assert.equal(openSecret(sealed), "provider-secret-value");
  console.log("✅ integration secrets use authenticated AES-256-GCM encryption");

  const live = await fetch(`${BASE}/api/health/live`);
  const ready = await fetch(`${BASE}/api/health/ready`);
  assert.equal(live.status, 200);
  assert.equal(ready.status, 200);
  assert.ok(live.headers.get("x-request-id"));
  console.log("✅ liveness, readiness and request ID");

  const csrf = await fetch(`${BASE}/api/auth`, {
    method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.invalid" },
    body: JSON.stringify({ action: "login", email: "owner@melio.vn", password: PASSWORD }),
  });
  assert.equal(csrf.status, 403);
  console.log("✅ cross-origin browser mutation rejected");

  let throttled: Response | undefined;
  for (let attempt = 0; attempt < 11; attempt++) throttled = await fetch(`${BASE}/api/auth`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "login", email: "rate-limit-test@invalid.local", password: "wrong-password" }),
  });
  assert.equal(throttled?.status, 429);
  assert.ok(throttled?.headers.get("retry-after"));
  console.log("✅ shared login rate limit returns 429 + Retry-After");

  const login = await fetch(`${BASE}/api/auth`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "login", email: "owner@melio.vn", password: PASSWORD }),
  });
  assert.equal(login.status, 200);
  const rawToken = login.headers.get("set-cookie")?.match(/bs_session=([^;]+)/)?.[1];
  assert.ok(rawToken);
  assert.equal(await prisma.session.findUnique({ where: { token: rawToken } }), null);
  const tokenHash = createHash("sha256").update(rawToken!).digest("hex");
  assert.ok(await prisma.session.findUnique({ where: { token: tokenHash } }));
  console.log("✅ session bearer token stored only as SHA-256 hash");

  const stale = await prisma.jobRun.create({ data: {
    kind: "loss.scan", status: "RUNNING", attempts: 0,
    workerId: "dead-worker", leaseExpiresAt: new Date(Date.now() - 60_000), startedAt: new Date(Date.now() - 120_000),
  } });
  const recovered = await runJob("loss.scan", stale.id);
  assert.equal(recovered?.status, "SUCCEEDED");
  console.log("✅ expired RUNNING job recovered by lease claim");

  await prisma.session.deleteMany({ where: { token: tokenHash } });
  await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: "login-" } } });
  await prisma.jobRun.delete({ where: { id: stale.id } });
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
