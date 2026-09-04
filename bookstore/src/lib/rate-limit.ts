import { createHash } from "crypto";
import { prisma } from "./db";
import { incrWindow } from "./redis";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function clientIp(headers: Headers) {
  // Behind a proxy that overwrites X-Forwarded-For (see docs/OPERATIONS.md
  // "Reverse-proxy contract" / deploy/nginx.conf): full client precision.
  if (process.env.TRUST_PROXY_HEADERS === "true")
    return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  // No trusted reverse proxy: fall back to edge-injected headers (only present
  // when a real CDN/edge set them) instead of collapsing EVERY client into a
  // single "untrusted-proxy" bucket, which let any busy NAT lock out all
  // logins/checkouts platform-wide. Direct connections share the "local" bucket;
  // per-account keys keep credential stuffing bounded regardless.
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("true-client-ip") ??
    headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}

/**
 * Fixed-window limiter shared by every app instance.
 * Redis-first when REDIS_URL is set — public endpoints (AI chat, storefront)
 * otherwise cost one Postgres upsert per request, turning the limiter itself
 * into a DoS vector. Falls back to the Postgres bucket when Redis is absent
 * or unreachable; behavior and contract are identical either way.
 */
export async function enforceRateLimit(namespace: string, identity: string, limit: number, windowMs: number) {
  const key = `${namespace}:${digest(identity.toLowerCase())}`;

  const redisCount = await incrWindow(`rl:${key}`, windowMs);
  if (redisCount !== null) {
    if (redisCount > limit) {
      const error = Object.assign(new Error("Too many attempts; try again later"), {
        status: 429, code: "RATE_LIMITED",
      });
      throw error;
    }
    return;
  }

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
