import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withCheckoutSlot, MAX_CONCURRENT_CHECKOUTS } from './throttle'

describe('withCheckoutSlot', () => {
  it('executes compute function when slot available', async () => {
    const result = await withCheckoutSlot(async () => 42)
    expect(result).toBe(42)
  })

  it('returns result from compute function', async () => {
    const result = await withCheckoutSlot(async () => {
      return { success: true, data: 'test' }
    })
    expect(result).toEqual({ success: true, data: 'test' })
  })

  it('releases slot after execution', async () => {
    await withCheckoutSlot(async () => 'first')
    // Should not block - slot was released
    const result = await withCheckoutSlot(async () => 'second')
    expect(result).toBe('second')
  })

  it('propagates errors from compute function', async () => {
    await expect(
      withCheckoutSlot(async () => {
        throw new Error('Compute failed')
      })
    ).rejects.toThrow('Compute failed')
  })
})

describe('MAX_CONCURRENT_CHECKOUTS', () => {
  it('is a positive number', () => {
    expect(typeof MAX_CONCURRENT_CHECKOUTS).toBe('number')
    expect(MAX_CONCURRENT_CHECKOUTS).toBeGreaterThan(0)
  })

  it('defaults to 20', () => {
    expect(MAX_CONCURRENT_CHECKOUTS).toBe(20)
  })
})

// ── Redis lease backend ─────────────────────────────────────────────────────
// getRedis() is mocked: a toy in-memory sorted set stands in for Redis so the
// Lua semantics (evict-expired → count → grant/deny) are exercised through
// withCheckoutSlot without a live server.
const mockRedis = vi.hoisted(() => {
  const zset = new Map<string, number>() // member → score (epoch ms)
  return {
    zset,
    eval: vi.fn(async (_script: string, _numKeys: number, key: string, member: string, score: number, max: number, now: number) => {
      if (key !== 'checkout:slots') throw new Error('unexpected key')
      for (const [m, s] of zset) if (s < now) zset.delete(m) // ZREMRANGEBYSCORE
      if (zset.size >= max) return 0
      zset.set(member, score)
      return 1
    }),
    zrem: vi.fn(async (_key: string, member: string) => { zset.delete(member) }),
  }
})

vi.mock('./redis', () => ({ getRedis: () => mockRedis }))

describe('withCheckoutSlot — Redis lease backend', () => {
  beforeEach(() => mockRedis.zset.clear())

  it('grants and releases a shared slot', async () => {
    const out = await withCheckoutSlot(async () => {
      expect(mockRedis.zset.size).toBe(1)
      return 'done'
    })
    expect(out).toBe('done')
    expect(mockRedis.zset.size).toBe(0) // released in finally
  })

  it('enforces the shared cap across acquirers', async () => {
    // Fill every slot and hold them.
    const holds = Array.from({ length: MAX_CONCURRENT_CHECKOUTS }, () =>
      withCheckoutSlot(() => new Promise((r) => setTimeout(r, 80)))
    )
    await new Promise((r) => setTimeout(r, 20)) // let them all acquire
    expect(mockRedis.zset.size).toBe(MAX_CONCURRENT_CHECKOUTS)
    // One more within the same window must come back busy…
    const extra = withCheckoutSlot(() => Promise.resolve('extra'))
    extra.then(() => { throw new Error('should not complete before a release') }).catch(() => {})
    await new Promise((r) => setTimeout(r, 30))
    await Promise.all(holds) // releases happen
    const out = await extra // …then succeeds once a slot freed up
    expect(out).toBe('extra')
  })

  it('evicts expired leases so a crashed worker cannot leak a slot', async () => {
    // Simulate a stale lease from a crashed process: score far in the past.
    mockRedis.zset.set('dead:worker', Date.now() - 999_999)
    const out = await withCheckoutSlot(async () => 'after-crash')
    expect(out).toBe('after-crash')
    expect(mockRedis.zset.has('dead:worker')).toBe(false)
  })

  it('falls back to the in-process counter when Redis throws', async () => {
    mockRedis.eval.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const out = await withCheckoutSlot(async () => 'fallback-ok')
    expect(out).toBe('fallback-ok')
  })
})
