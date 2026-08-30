import { describe, it, expect, beforeEach } from 'vitest'
import { observeRequest, observePoolAcquire, snapshot, recordHttpError } from './metrics'

describe('observeRequest', () => {
  it('records request metrics', () => {
    observeRequest('/api/products', 'GET', 200, 50)
    observeRequest('/api/products', 'GET', 200, 100)
    observeRequest('/api/products', 'GET', 200, 75)

    const snap = snapshot()
    const route = snap.routes.find(r => r.route === 'GET /api/products')
    expect(route).toBeDefined()
    expect(route!.count).toBe(3)
    expect(route!.avgMs).toBe(75)
    expect(route!.maxMs).toBe(100)
  })

  it('tracks 429 rate limits', () => {
    observeRequest('/api/ratelimit-test', 'GET', 200, 10)
    observeRequest('/api/ratelimit-test', 'GET', 429, 0)
    observeRequest('/api/ratelimit-test', 'GET', 429, 0)

    const snap = snapshot()
    const route = snap.routes.find(r => r.route === 'GET /api/ratelimit-test')
    expect(route).toBeDefined()
    expect(route!.rateLimited429).toBe(2)
  })

  it('tracks 5xx server errors', () => {
    observeRequest('/api/error-test', 'POST', 500, 100)
    observeRequest('/api/error-test', 'POST', 503, 50)

    const snap = snapshot()
    const route = snap.routes.find(r => r.route === 'POST /api/error-test')
    expect(route).toBeDefined()
    expect(route!.serverErrors5xx).toBe(2)
  })
})

describe('observePoolAcquire', () => {
  it('records pool acquire metrics', () => {
    observePoolAcquire(10, 0)
    observePoolAcquire(20, 1)
    observePoolAcquire(5, 0)

    const snap = snapshot()
    expect(snap.dbPool.acquires).toBeGreaterThanOrEqual(3)
    expect(snap.dbPool.acquireAvgMs).toBeGreaterThanOrEqual(0)
  })

  it('tracks high water mark', () => {
    observePoolAcquire(10, 7)
    const snap = snapshot()
    expect(snap.dbPool.waitingHighWater).toBeGreaterThanOrEqual(7)
  })
})

describe('snapshot', () => {
  it('returns a valid snapshot structure', () => {
    const snap = snapshot()
    expect(snap).toHaveProperty('uptimeSec')
    expect(snap).toHaveProperty('routes')
    expect(snap).toHaveProperty('totals')
    expect(snap).toHaveProperty('dbPool')
    expect(Array.isArray(snap.routes)).toBe(true)
    expect(typeof snap.totals.requests).toBe('number')
    expect(typeof snap.dbPool.acquires).toBe('number')
  })
})
