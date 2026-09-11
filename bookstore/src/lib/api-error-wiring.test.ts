import { describe, it, expect, vi, beforeEach } from 'vitest'

// apiError's 500 path must ship through trackError (which the
// error-tracking suite covers). Here we verify the WIRING: that apiError
// calls trackError with the right shape, and only for 500s.

const trackError = vi.fn()
vi.mock('./error-tracking', () => ({
  trackError: (...args: unknown[]) => trackError(...args),
}))

vi.mock('./db', () => ({ prisma: {} }))
vi.mock('./metrics', () => ({ recordHttpError: vi.fn() }))
// apiError reads the request id from next/headers — outside a request scope
// that throws. Mirror the surface it reads (headers().get). Same pattern as
// customer-auth.test.ts.
vi.mock('next/headers', () => ({
  headers: async () => ({ get: () => undefined }),
}))

import { apiError } from './api'

describe('apiError → trackError wiring', () => {
  beforeEach(() => trackError.mockClear())

  it('ships 500s with requestId + status context', async () => {
    await apiError({ status: 500, message: 'kaboom' })
    expect(trackError).toHaveBeenCalledOnce()
    const [msg, severity, ctx] = trackError.mock.calls[0]
    expect(msg).toBe('kaboom')
    expect(severity).toBe('error')
    expect(ctx.component).toBe('api')
    expect(ctx.action).toBe('api_500')
    expect(ctx.metadata.status).toBe(500)
  })

  it('does NOT ship 4xx errors to transports (they are client mistakes)', async () => {
    await apiError({ status: 400, code: 'VALIDATION', message: 'bad input' })
    await apiError({ status: 403, code: 'FORBIDDEN', message: 'no' })
    await apiError({ status: 404, code: 'NOT_FOUND', message: 'gone' })
    expect(trackError).not.toHaveBeenCalled()
  })

  it('treats a raw unknown error as a 500 (no status field) and ships it', async () => {
    await apiError(new Error('unexpected'))
    expect(trackError).toHaveBeenCalledOnce()
    expect(trackError.mock.calls[0][2].metadata.status).toBe(500)
  })
})
