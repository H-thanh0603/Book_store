import { describe, it, expect } from 'vitest'
import { toMoney, fail, reqStr, optStr, reqInt, optBool, optDate, requireRef, ok } from './api'

describe('toMoney', () => {
  it('converts valid non-negative integer to bigint', () => {
    expect(toMoney(0, 'price')).toBe(0n)
    expect(toMoney(100000, 'price')).toBe(100000n)
    expect(toMoney(Number.MAX_SAFE_INTEGER, 'price')).toBe(BigInt(Number.MAX_SAFE_INTEGER))
  })

  it('rejects negative numbers', () => {
    expect(() => toMoney(-1, 'price')).toThrow('non-negative integer')
  })

  it('rejects floats', () => {
    expect(() => toMoney(1.5, 'price')).toThrow('non-negative integer')
  })

  it('rejects non-numbers', () => {
    expect(() => toMoney('100', 'price')).toThrow('non-negative integer')
    expect(() => toMoney(null, 'price')).toThrow('non-negative integer')
    expect(() => toMoney(undefined, 'price')).toThrow('non-negative integer')
    expect(() => toMoney(NaN, 'price')).toThrow('non-negative integer')
    expect(() => toMoney(Infinity, 'price')).toThrow('non-negative integer')
  })
})

describe('fail', () => {
  it('throws Error with status, code, and message', () => {
    try {
      fail(404, 'NOT_FOUND', 'Item not found')
    } catch (e: any) {
      expect(e.message).toBe('Item not found')
      expect(e.status).toBe(404)
      expect(e.code).toBe('NOT_FOUND')
    }
  })

  it('includes details when provided', () => {
    try {
      fail(400, 'VALIDATION', 'Bad input', { field: 'name' })
    } catch (e: any) {
      expect(e.details).toEqual({ field: 'name' })
    }
  })
})

describe('reqStr', () => {
  it('returns trimmed string when valid', () => {
    expect(reqStr('  hello  ', 'name')).toBe('hello')
  })

  it('rejects empty string', () => {
    expect(() => reqStr('', 'name')).toThrow('name is required')
  })

  it('rejects whitespace-only string', () => {
    expect(() => reqStr('   ', 'name')).toThrow('name is required')
  })

  it('rejects non-string', () => {
    expect(() => reqStr(123, 'name')).toThrow('name is required')
    expect(() => reqStr(null, 'name')).toThrow('name is required')
  })

  it('rejects string exceeding max length', () => {
    expect(() => reqStr('a'.repeat(256), 'name', 255)).toThrow('at most 255 characters')
  })
})

describe('optStr', () => {
  it('returns null for undefined/null/empty', () => {
    expect(optStr(undefined, 'field')).toBeNull()
    expect(optStr(null, 'field')).toBeNull()
    expect(optStr('', 'field')).toBeNull()
  })

  it('delegates to reqStr for non-empty values', () => {
    expect(optStr('hello', 'field')).toBe('hello')
  })
})

describe('reqInt', () => {
  it('returns valid integer in range', () => {
    expect(reqInt(5, 'qty', 1, 100)).toBe(5)
    expect(reqInt(1, 'qty', 1, 100)).toBe(1)
    expect(reqInt(100, 'qty', 1, 100)).toBe(100)
  })

  it('rejects out of range', () => {
    expect(() => reqInt(0, 'qty', 1, 100)).toThrow()
    expect(() => reqInt(101, 'qty', 1, 100)).toThrow()
  })

  it('rejects non-integer', () => {
    expect(() => reqInt(1.5, 'qty', 1, 100)).toThrow()
    expect(() => reqInt('5' as any, 'qty', 1, 100)).toThrow()
  })
})

describe('optBool', () => {
  it('returns undefined for null/undefined', () => {
    expect(optBool(undefined, 'f')).toBeUndefined()
    expect(optBool(null, 'f')).toBeUndefined()
  })

  it('returns boolean when valid', () => {
    expect(optBool(true, 'f')).toBe(true)
    expect(optBool(false, 'f')).toBe(false)
  })

  it('rejects non-boolean', () => {
    expect(() => optBool(1, 'f')).toThrow()
    expect(() => optBool('true', 'f')).toThrow()
  })
})

describe('optDate', () => {
  it('returns null for empty values', () => {
    expect(optDate(undefined, 'f')).toBeNull()
    expect(optDate(null, 'f')).toBeNull()
    expect(optDate('', 'f')).toBeNull()
  })

  it('parses valid date strings', () => {
    const d = optDate('2026-01-15', 'f')
    expect(d).toBeInstanceOf(Date)
    expect(d!.getFullYear()).toBe(2026)
  })

  it('throws for invalid dates', () => {
    expect(() => optDate('not-a-date', 'f')).toThrow('not a valid date')
  })
})

describe('requireRef', () => {
  it('returns row when present', () => {
    const row = { id: '123', name: 'test' }
    expect(requireRef(row, 'Item')).toEqual(row)
  })

  it('throws 404 when null', () => {
    try {
      requireRef(null, 'Item')
    } catch (e: any) {
      expect(e.status).toBe(404)
      expect(e.code).toBe('NOT_FOUND')
      expect(e.message).toContain('Item not found')
    }
  })
})

describe('ok', () => {
  it('serializes bigint to number when safe', () => {
    const response = ok({ price: 50000n, name: 'test' })
    expect(response.status).toBe(200)
  })

  it('serializes bigint to string when exceeds safe integer', () => {
    const big = BigInt(Number.MAX_SAFE_INTEGER) + 1n
    const response = ok({ price: big })
    expect(response.status).toBe(200)
  })
})
