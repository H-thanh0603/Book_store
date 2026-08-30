import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hashPassword, verifyPassword, passwordNeedsRehash } from './auth'

describe('hashPassword', () => {
  it('returns a scrypt envelope string', () => {
    const hash = hashPassword('mypassword')
    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$/)
  })

  it('produces different hashes for same input (random salt)', () => {
    const h1 = hashPassword('test')
    const h2 = hashPassword('test')
    expect(h1).not.toBe(h2)
  })
})

describe('verifyPassword', () => {
  it('returns true for correct password', () => {
    const hash = hashPassword('correct123')
    expect(verifyPassword('correct123', hash)).toBe(true)
  })

  it('returns false for wrong password', () => {
    const hash = hashPassword('correct123')
    expect(verifyPassword('wrong', hash)).toBe(false)
  })

  it('returns false for malformed string', () => {
    expect(verifyPassword('test', 'not-a-hash')).toBe(false)
    expect(verifyPassword('test', 'scrypt$')).toBe(false)
    expect(verifyPassword('test', 'salt:')).toBe(false)
    expect(verifyPassword('test', 'scrypt$abc$8$1$salt:hash')).toBe(false)
  })

  it('returns false when hash length is wrong', () => {
    expect(verifyPassword('test', 'scrypt$16384$8$1$abc:short')).toBe(false)
  })

  it('handles legacy format without version prefix', () => {
    // Manually construct a legacy hash using the old parameters
    const { scryptSync, randomBytes } = require('crypto')
    const LEGACY_SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }
    const salt = randomBytes(16).toString('hex')
    const hash = scryptSync('legacy-test', salt, 64, LEGACY_SCRYPT).toString('hex')
    const legacy = `${salt}:${hash}`
    expect(verifyPassword('legacy-test', legacy)).toBe(true)
  })
})

describe('passwordNeedsRehash', () => {
  it('returns true for legacy (non-versioned) hashes', () => {
    const legacy = 'abc123:hashvalue'
    expect(passwordNeedsRehash(legacy)).toBe(true)
  })

  it('returns false for current versioned hashes', () => {
    const current = hashPassword('test')
    expect(passwordNeedsRehash(current)).toBe(false)
  })
})
