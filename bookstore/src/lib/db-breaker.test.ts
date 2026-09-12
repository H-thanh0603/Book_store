import { describe, it, expect, vi } from 'vitest'

// Circuit-breaker behavior (WS1.3 / REL-003): consecutive pool-checkout
// failures open the breaker; while open, checkouts fail fast with a
// 503-shaped error instead of waiting out the 5s connect timeout each time.

process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db'
// NOTE: static imports below hoist above these assignments, so db.ts reads
// the DEFAULTS (5 failures, 30s cooldown) — the test drives those defaults.

const failures = vi.hoisted(() => ({ count: 0, failConnect: true }))

vi.mock('pg', () => ({
  default: {
    // NOTE: regular function, not arrow — db.ts does `new pg.Pool(...)`.
    Pool: vi.fn(function (this: unknown) {
      return {
        waitingCount: 0,
        on: vi.fn(),
        connect: vi.fn().mockImplementation(async () => {
          failures.count += 1
          if (failures.failConnect) throw new Error('connect ECONNREFUSED')
          return { release: vi.fn() }
        }),
        end: vi.fn(),
      }
    }),
  },
}))

vi.mock('./metrics', () => ({ observePoolAcquire: vi.fn() }))

// vitest.setup.ts mocks @/lib/db globally — this file tests the REAL module.
vi.unmock('@/lib/db')

import pg from 'pg'
import { dbBreakerState } from './db'

function firstPoolConnect(): () => Promise<unknown> {
  const results = (pg.Pool as unknown as { mock: { results: { value: unknown }[] } }).mock.results
  expect(results.length).toBeGreaterThan(0)
  return (results[0].value as { connect: () => Promise<unknown> }).connect
}

describe('db circuit breaker', () => {
  it('opens after N consecutive checkout failures and fails fast', async () => {
    const connect = firstPoolConnect()
    const before = failures.count
    for (let i = 0; i < 5; i++) await expect(connect()).rejects.toThrow('ECONNREFUSED')
    expect(dbBreakerState().open).toBe(true)
    const err = await connect().catch((e: Error) => e)
    expect((err as { status?: number; code?: string }).status).toBe(503)
    expect((err as { code?: string }).code).toBe('UNAVAILABLE')
    // Fail-fast: the underlying connect was NOT called for the open-breaker probe.
    expect(failures.count).toBe(before + 5)
  })

  it('half-opens after cooldown and closes on success', async () => {
    vi.useFakeTimers()
    try {
      const connect = firstPoolConnect()
      expect(dbBreakerState().open).toBe(true)
      await vi.advanceTimersByTimeAsync(31_000)
      expect(dbBreakerState().open).toBe(false)
      failures.failConnect = false
      await expect(connect()).resolves.toBeDefined()
      expect(dbBreakerState()).toEqual({ failures: 0, open: false })
    } finally {
      vi.useRealTimers()
    }
  })
})
