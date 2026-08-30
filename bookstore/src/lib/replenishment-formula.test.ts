import { describe, it, expect } from 'vitest'
import { calculateReplenishment, type ReplenishmentInput } from './replenishment-formula'

describe('calculateReplenishment', () => {
  const baseInput: ReplenishmentInput = {
    soldUnits: 100,
    historyDays: 30,
    availableQty: 20,
    incomingQty: 0,
    safetyStock: 10,
    leadTimeDays: 7,
  }

  it('calculates basic replenishment', () => {
    const result = calculateReplenishment(baseInput)
    // averageDailySales = 100/30 = 3.33
    // targetQty = ceil(3.33 * 7 + 10) = ceil(33.33) = 34
    // recommendedQty = max(0, 34 - 20 - 0) = 14
    expect(result.averageDailySales).toBeCloseTo(3.33, 1)
    expect(result.recommendedQty).toBe(14)
    expect(result.daysOfCover).toBeCloseTo(6, 0)
  })

  it('returns zero when stock is sufficient', () => {
    const result = calculateReplenishment({
      ...baseInput,
      availableQty: 100,
    })
    expect(result.recommendedQty).toBe(0)
  })

  it('returns zero when incoming covers deficit', () => {
    const result = calculateReplenishment({
      ...baseInput,
      incomingQty: 20,
    })
    expect(result.recommendedQty).toBe(0)
  })

  it('handles zero history days', () => {
    const result = calculateReplenishment({
      ...baseInput,
      historyDays: 0,
      soldUnits: 0,
    })
    expect(result.averageDailySales).toBe(0)
    expect(result.daysOfCover).toBeNull()
    // targetQty = ceil(0 * 7 + 10) = 10
    // recommendedQty = max(0, 10 - 20 - 0) = 0
    expect(result.recommendedQty).toBe(0)
  })

  it('blends current and prior sales for trend', () => {
    const result = calculateReplenishment({
      soldUnits: 100,
      priorSoldUnits: 60,
      historyDays: 30,
      availableQty: 20,
      incomingQty: 0,
      safetyStock: 10,
      leadTimeDays: 7,
    })
    // currentDaily = 100/30 = 3.33
    // priorDaily = 60/30 = 2.0
    // effectiveDaily = (3.33 + 2.0) / 2 = 2.67
    // targetQty = ceil(2.67 * 7 + 10) = ceil(28.67) = 29
    // recommendedQty = max(0, 29 - 20 - 0) = 9
    expect(result.recommendedQty).toBe(9)
  })

  it('handles spike in current sales (dampened by prior)', () => {
    const result = calculateReplenishment({
      soldUnits: 200,
      priorSoldUnits: 30,
      historyDays: 30,
      availableQty: 10,
      incomingQty: 0,
      safetyStock: 5,
      leadTimeDays: 7,
    })
    // currentDaily = 200/30 = 6.67
    // priorDaily = 30/30 = 1.0
    // effectiveDaily = (6.67 + 1.0) / 2 = 3.83
    expect(result.averageDailySales).toBeCloseTo(6.67, 1)
    expect(result.recommendedQty).toBeGreaterThan(0)
  })

  it('always non-negative recommendedQty', () => {
    const result = calculateReplenishment({
      soldUnits: 0,
      historyDays: 30,
      availableQty: 1000,
      incomingQty: 500,
      safetyStock: 10,
      leadTimeDays: 7,
    })
    expect(result.recommendedQty).toBeGreaterThanOrEqual(0)
  })

  it('daysOfCover is null when no sales', () => {
    const result = calculateReplenishment({
      ...baseInput,
      soldUnits: 0,
    })
    expect(result.daysOfCover).toBeNull()
  })

  it('safetyStock always adds to target', () => {
    const lowSafety = calculateReplenishment({ ...baseInput, safetyStock: 0 })
    const highSafety = calculateReplenishment({ ...baseInput, safetyStock: 50 })
    expect(highSafety.recommendedQty).toBeGreaterThanOrEqual(lowSafety.recommendedQty)
  })
})
