import { describe, it, expect, vi, beforeEach } from 'vitest'
import { vnpayConfigured } from './vnpay'

describe('vnpayConfigured', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.VNP_TMN_CODE
    delete process.env.VNP_HASH_SECRET
    delete process.env.VNP_RETURN_URL
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns false when no env vars set', () => {
    expect(vnpayConfigured()).toBe(false)
  })

  it('returns true when all env vars set', () => {
    process.env.VNP_TMN_CODE = 'test-code'
    process.env.VNP_HASH_SECRET = 'test-secret'
    process.env.VNP_RETURN_URL = 'https://example.com/vnpay-return'
    expect(vnpayConfigured()).toBe(true)
  })

  it('returns false when only some env vars set', () => {
    process.env.VNP_TMN_CODE = 'test-code'
    process.env.VNP_HASH_SECRET = 'test-secret'
    expect(vnpayConfigured()).toBe(false)
  })
})
