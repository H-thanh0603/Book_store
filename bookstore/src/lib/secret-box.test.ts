import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { isSealed, sealSecret, openSecret, sealJson } from './secret-box'

describe('secret-box', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    // Generate a valid 32-byte key for testing
    process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32).toString('base64')
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe('isSealed', () => {
    it('returns true for sealed values', () => {
      const sealed = sealSecret('test-value')
      expect(isSealed(sealed)).toBe(true)
    })

    it('returns false for unsealed strings', () => {
      expect(isSealed('plain-text')).toBe(false)
      expect(isSealed('enc:missing-parts')).toBe(false)
    })

    it('returns false for non-strings', () => {
      expect(isSealed(null)).toBe(false)
      expect(isSealed(123)).toBe(false)
      expect(isSealed(undefined)).toBe(false)
    })
  })

  describe('sealSecret', () => {
    it('produces a sealed string with correct prefix', () => {
      const sealed = sealSecret('my-secret')
      expect(sealed).toMatch(/^enc:v1:.+$/)
    })

    it('produces different output for same input (random IV)', () => {
      const s1 = sealSecret('same')
      const s2 = sealSecret('same')
      expect(s1).not.toBe(s2)
    })
  })

  describe('openSecret', () => {
    it('decrypts sealed value correctly', () => {
      const original = 'my-api-key-123'
      const sealed = sealSecret(original)
      expect(openSecret(sealed)).toBe(original)
    })

    it('roundtrips complex strings', () => {
      const complex = '{"key":"value","number":42,"unicode":"Tiếng Việt"}'
      const sealed = sealSecret(complex)
      expect(openSecret(sealed)).toBe(complex)
    })
  })

  describe('sealJson', () => {
    it('seals JSON-serialized value', () => {
      const data = { apiKey: 'secret', count: 42 }
      const sealed = sealJson(data)
      expect(isSealed(sealed)).toBe(true)
      const decrypted = JSON.parse(openSecret(sealed))
      expect(decrypted).toEqual(data)
    })
  })

  describe('error handling', () => {
    it('throws when INTEGRATION_ENCRYPTION_KEY is missing', () => {
      delete process.env.INTEGRATION_ENCRYPTION_KEY
      expect(() => sealSecret('test')).toThrow('INTEGRATION_ENCRYPTION_KEY is required')
    })

    it('throws when key is wrong length', () => {
      process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(16).toString('base64')
      expect(() => sealSecret('test')).toThrow('must be a base64-encoded 32-byte key')
    })
  })
})
