import { describe, it, expect,} from 'vitest'
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
