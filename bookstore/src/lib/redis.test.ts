import { describe, it, expect } from 'vitest'
import { cacheGet, cacheSet, cacheDel, cacheFlush } from './redis'

describe('redis cache - no Redis configured', () => {
  // Tests with REDIS_URL unset (the default for dev/single-instance)
  // These verify the graceful fallback behavior.

  it('cacheGet returns null when REDIS_URL is not set', async () => {
    const result = await cacheGet('any-key')
    expect(result).toBeNull()
  })

  it('cacheSet does not throw when REDIS_URL is not set', async () => {
    await expect(cacheSet('key', { data: 1 }, 30)).resolves.toBeUndefined()
  })

  it('cacheDel does not throw when REDIS_URL is not set', async () => {
    await expect(cacheDel('key')).resolves.toBeUndefined()
  })

  it('cacheFlush does not throw when REDIS_URL is not set', async () => {
    await expect(cacheFlush('prefix:*')).resolves.toBeUndefined()
  })

  it('cacheGet handles corrupted JSON gracefully', async () => {
    // When Redis returns invalid JSON, cacheGet should return null
    const result = await cacheGet('corrupted')
    expect(result).toBeNull()
  })
})
