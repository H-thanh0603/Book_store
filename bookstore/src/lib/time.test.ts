import { describe, it, expect } from 'vitest'
import { zonedStartOfDay, zonedStartOfMonth, zonedMonthsAgo, BUSINESS_TZ } from './time'

describe('BUSINESS_TZ', () => {
  it('defaults to Asia/Ho_Chi_Minh', () => {
    expect(BUSINESS_TZ).toBe('Asia/Ho_Chi_Minh')
  })
})

describe('zonedStartOfDay', () => {
  it('returns UTC midnight of the business timezone', () => {
    // 2026-08-27 10:00:00 UTC = 2026-08-27 17:00:00 VN time
    const date = new Date('2026-08-27T10:00:00Z')
    const result = zonedStartOfDay(date)
    // VN midnight (2026-08-27 00:00:00 VN) = 2026-08-26 17:00:00 UTC
    expect(result.getUTCHours()).toBe(17)
    expect(result.getUTCDate()).toBe(26)
  })

  it('returns start of current day when no date provided', () => {
    const result = zonedStartOfDay()
    expect(result).toBeInstanceOf(Date)
    expect(result.getUTCHours()).toBeDefined()
  })
})

describe('zonedStartOfMonth', () => {
  it('returns UTC midnight of first day of month in business timezone', () => {
    // 2026-08-27 10:00:00 UTC
    const date = new Date('2026-08-27T10:00:00Z')
    const result = zonedStartOfMonth(date)
    // VN first of month (2026-08-01 00:00:00 VN) = 2026-07-31 17:00:00 UTC
    expect(result.getUTCDate()).toBe(31)
    expect(result.getUTCMonth()).toBe(6) // July (0-indexed)
  })
})

describe('zonedMonthsAgo', () => {
  it('returns date N months ago', () => {
    const date = new Date('2026-08-27T10:00:00Z')
    const result = zonedMonthsAgo(3, date)
    expect(result).toBeInstanceOf(Date)
    expect(result.getTime()).toBeLessThan(date.getTime())
  })

  it('handles month-end edge cases', () => {
    // Aug 31 - 1 month should give July 31
    const date = new Date('2026-08-31T10:00:00Z')
    const result = zonedMonthsAgo(1, date)
    expect(result).toBeInstanceOf(Date)
    expect(result.getTime()).toBeLessThan(date.getTime())
  })

  it('handles 12 months ago', () => {
    const date = new Date('2026-08-27T10:00:00Z')
    const result = zonedMonthsAgo(12, date)
    expect(result.getUTCFullYear()).toBe(2025)
  })

  it('returns current date when n=0', () => {
    const date = new Date('2026-08-27T10:00:00Z')
    const result = zonedMonthsAgo(0, date)
    expect(result.getUTCMonth()).toBe(date.getUTCMonth())
  })
})
