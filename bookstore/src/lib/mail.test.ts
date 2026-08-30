import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { smtpConfigured, sendMail } from './mail'

describe('smtpConfigured', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.SMTP_HOST
    delete process.env.SMTP_PORT
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns false when SMTP_HOST is not set', () => {
    expect(smtpConfigured()).toBe(false)
  })

  it('returns false when only SMTP_HOST is set', () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    expect(smtpConfigured()).toBe(false)
  })

  it('returns true when both SMTP_HOST and SMTP_PORT are set', () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    process.env.SMTP_PORT = '587'
    expect(smtpConfigured()).toBe(true)
  })
})

describe('sendMail', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.SMTP_HOST
    delete process.env.SMTP_PORT
    vi.clearAllMocks()
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns delivered: false when SMTP not configured', async () => {
    const result = await sendMail({
      to: 'test@example.com',
      subject: 'Test',
      text: 'Hello',
      html: '<p>Hello</p>',
    })
    expect(result.delivered).toBe(false)
  })
})
