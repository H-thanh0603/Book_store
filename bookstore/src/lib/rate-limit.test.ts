import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clientIp, enforceRateLimit, pruneRateLimits } from './rate-limit'

vi.mock('./db', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ count: 1, resetAt: new Date(Date.now() + 60000) }]),
    rateLimitBucket: { deleteMany: vi.fn() },
  },
}))

import { prisma } from './db'

describe('clientIp', () => {
  it('returns local when no proxy headers', () => {
    const headers = new Headers()
    const ip = clientIp(headers)
    expect(ip).toBe('local')
  })

  it('returns cf-connecting-ip when present', () => {
    const headers = new Headers()
    headers.set('cf-connecting-ip', '1.2.3.4')
    const ip = clientIp(headers)
    expect(ip).toBe('1.2.3.4')
  })

  it('returns true-client-ip as fallback', () => {
    const headers = new Headers()
    headers.set('true-client-ip', '5.6.7.8')
    const ip = clientIp(headers)
    expect(ip).toBe('5.6.7.8')
  })

  it('returns x-real-ip when TRUST_PROXY_HEADERS is true', () => {
    const original = process.env.TRUST_PROXY_HEADERS
    process.env.TRUST_PROXY_HEADERS = 'true'
    try {
      const headers = new Headers()
      headers.set('x-real-ip', '10.0.0.1')
      const ip = clientIp(headers)
      expect(ip).toBe('10.0.0.1')
    } finally {
      process.env.TRUST_PROXY_HEADERS = original
    }
  })

  it('parses first IP from x-forwarded-for when TRUST_PROXY_HEADERS is true', () => {
    const original = process.env.TRUST_PROXY_HEADERS
    process.env.TRUST_PROXY_HEADERS = 'true'
    try {
      const headers = new Headers()
      headers.set('x-forwarded-for', '1.2.3.4, 5.6.7.8, 9.10.11.12')
      const ip = clientIp(headers)
      expect(ip).toBe('1.2.3.4')
    } finally {
      process.env.TRUST_PROXY_HEADERS = original
    }
  })

  it('returns unknown when no headers and proxy trusted', () => {
    const original = process.env.TRUST_PROXY_HEADERS
    process.env.TRUST_PROXY_HEADERS = 'true'
    try {
      const headers = new Headers()
      const ip = clientIp(headers)
      expect(ip).toBe('unknown')
    } finally {
      process.env.TRUST_PROXY_HEADERS = original
    }
  })
})

describe('enforceRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves when under limit', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: 1, resetAt: new Date(Date.now() + 60000) }])
    await expect(enforceRateLimit('test', 'user1', 5, 60000)).resolves.toBeUndefined()
  })

  it('throws 429 when over limit', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: 6, resetAt: new Date(Date.now() + 60000) }])
    await expect(enforceRateLimit('test', 'user1', 5, 60000)).rejects.toThrow('Too many attempts')
  })
})

describe('pruneRateLimits', () => {
  it('calls deleteMany on rateLimitBucket', async () => {
    await pruneRateLimits()
    expect(prisma.rateLimitBucket.deleteMany).toHaveBeenCalled()
  })
})
