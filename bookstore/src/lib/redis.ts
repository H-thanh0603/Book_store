import Redis from 'ioredis'

const globalForRedis = globalThis as unknown as {
  redis?: Redis | null
}

function createRedisClient(): Redis | null {
  const url = process.env.REDIS_URL
  if (!url) return null
  return new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      const delay = Math.min(times * 50, 2000)
      return delay
    },
    lazyConnect: true,
    enableReadyCheck: true,
  })
}

export function getRedis(): Redis | null {
  if (globalForRedis.redis !== undefined) return globalForRedis.redis
  globalForRedis.redis = createRedisClient()
  return globalForRedis.redis
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    const raw = await redis.get(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
  } catch {
    // Silently fail — cache miss is acceptable
  }
}

export async function cacheDel(key: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.del(key)
  } catch {
    // Silently fail
  }
}

export async function cacheFlush(pattern: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    const keys = await redis.keys(pattern)
    if (keys.length > 0) await redis.del(...keys)
  } catch {
    // Silently fail
  }
}

/**
 * Fixed-window counter: INCR + EXPIRE on first hit. Returns null when Redis
 * is unavailable so callers can fall back (e.g. the Postgres rate limiter).
 * One atomic round-trip, no script needed: a key without TTL simply expires
 * on the next window's first INCR (EXPIRE is NX-scoped to count===1).
 */
export async function incrWindow(key: string, windowMs: number): Promise<number | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    const count = await redis.incr(key)
    if (count === 1) await redis.pexpire(key, windowMs)
    return count
  } catch {
    return null
  }
}
