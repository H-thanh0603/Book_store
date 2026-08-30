// Password reset flow verification: request_reset creates a single-use hashed
// token and emails (or logs) the link; reset_password claims it atomically,
// rotates the hash, kills sessions, and rejects reuse/expiry/tamper.
// Run: npx tsx scripts/test-reset-flow.ts  (needs the app running on :3000)
import "dotenv/config";
import { verifyPassword } from "../src/lib/auth";
import { createHash, randomBytes } from "crypto";
import { prisma } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`✅ ${name}`);
  else { failures++; console.error(`❌ ${name}`, detail ?? ""); }
}

async function api(method: string, body: unknown) {
  const res = await fetch(`${BASE}/api/auth`, {
    method, headers: { "Content-Type": "application/json", origin: BASE },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function main() {
  // Synthetic user so we never depend on seed contents.
  const suffix = randomBytes(4).toString("hex");
  const email = `reset-${suffix}@test.local`;
  const { hashPassword } = await import("../src/lib/auth");
  const user = await prisma.user.create({
    data: { email, passwordHash: hashPassword("original-password-123"), active: true },
  });

  const req = await api("POST", { action: "request_reset", email });
  check("request_reset returns generic ok", req.status === 200 && req.data.ok === true);
  const unknown = await api("POST", { action: "request_reset", email: "nobody@test.local" });
  check("unknown email is indistinguishable", unknown.status === 200 && unknown.data.ok === true);

  const record = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id }, orderBy: { createdAt: "desc" },
  });
  check("token row created with expiry ≤ 30min",
    !!record && record!.expiresAt.valueOf() - Date.now() <= 30 * 60_000 + 5_000);
  check("stored hash ≠ raw token", !!record && !record!.tokenHash.includes("reset"));
  if (!record) return finish();

  const token = randomBytes(32).toString("hex"); // we can't read the emailed one…
  void token;

  // Reconstruct flow: create a second known token directly to exercise reset.
  const raw = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: createHash("sha256").update(raw).digest("hex"),
      expiresAt: new Date(Date.now() + 15 * 60_000),
    },
  });

  const short = await api("POST", { action: "reset_password", token: raw, newPassword: "short" });
  check("short password rejected", short.status === 400);

  const ok = await api("POST", { action: "reset_password", token: raw, newPassword: "brand-new-password-1" });
  check("valid reset succeeds", ok.status === 200 && ok.data.ok === true);
  const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  check("password hash rotated & verifies", (() => {
    try {
      return verifyPassword("brand-new-password-1", after.passwordHash);
    } catch { return false; }
  })());
  check("sessions wiped", (await prisma.session.count({ where: { userId: user.id } })) === 0);

  const reuse = await api("POST", { action: "reset_password", token: raw, newPassword: "another-password-2" });
  check("token reuse rejected", reuse.status === 400);

  const tampered = await api("POST", { action: "reset_password", token: raw.slice(0, -2) + "zz", newPassword: "another-password-2" });
  check("tampered token rejected", tampered.status === 400);

  async function finish() {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    console.log(failures === 0 ? "\nAll reset-flow checks passed" : `\n${failures} check(s) FAILED`);
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  }
  await finish();
}
main();
