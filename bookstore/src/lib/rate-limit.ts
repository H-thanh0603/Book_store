import { createHash } from "crypto";
import { prisma } from "./db";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function clientIp(headers: Headers) {
  if (process.env.TRUST_PROXY_HEADERS !== "true") return "untrusted-proxy";
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Atomic, database-backed fixed-window limiter shared by every app instance. */
export async function enforceRateLimit(namespace: string, identity: string, limit: number, windowMs: number) {
  const key = `${namespace}:${digest(identity.toLowerCase())}`;
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
    VALUES (${key}, 1, ${resetAt}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN ${resetAt} ELSE "RateLimitBucket"."resetAt" END,
      "updatedAt" = ${now}
    RETURNING "count", "resetAt"
  `;
  const bucket = rows[0];
  if (bucket.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt.getTime() - now.getTime()) / 1000));
    const error = Object.assign(new Error("Too many attempts; try again later"), {
      status: 429, code: "RATE_LIMITED", retryAfter,
    });
    throw error;
  }
}

export async function pruneRateLimits() {
  await prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date(Date.now() - 86_400_000) } } });
}
