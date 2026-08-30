import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { embeddingConfigured } from './embeddings'

describe('embeddingConfigured', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.GEMINI_API_KEY
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns false when GEMINI_API_KEY is not set', () => {
    expect(embeddingConfigured()).toBe(false)
  })

  it('returns true when GEMINI_API_KEY is set', () => {
    process.env.GEMINI_API_KEY = 'test-key'
    expect(embeddingConfigured()).toBe(true)
  })
})
