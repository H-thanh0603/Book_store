import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The module reads SENTRY_DSN at import time (parsed once) but ERROR_WEBHOOK_URL
// per call. Fresh module + real env mutation per scenario, cleaned in afterEach.

const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => new Response('{}', { status: 200 }))
vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

const ENV_KEYS = ['SENTRY_DSN', 'ERROR_WEBHOOK_URL'] as const
const savedEnv: Record<string, string | undefined> = {}

async function freshModule(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    if (env[k] === undefined) delete process.env[k]
    else process.env[k] = env[k]!
  }
  return await import('./error-tracking')
}

const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
const quietWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
const quietLog = vi.spyOn(console, 'log').mockImplementation(() => {})

describe('trackError transports', () => {
  beforeEach(() => fetchMock.mockClear())
  afterEach(() => {
    quiet.mockClear(); quietWarn.mockClear()
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k]
      else process.env[k] = savedEnv[k]
    }
  })

  it('sends nothing when no transport is configured (log-only, old behaviour)', async () => {
    const { trackError } = await freshModule({ SENTRY_DSN: undefined, ERROR_WEBHOOK_URL: undefined })
    trackError(new Error('boom'), 'error', { component: 'test' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(quiet).toHaveBeenCalledOnce() // structured console log still written
  })

  it('POSTs a Slack-style payload to ERROR_WEBHOOK_URL', async () => {
    const { trackError } = await freshModule({ SENTRY_DSN: undefined, ERROR_WEBHOOK_URL: 'https://hooks.example.com/x' })
    trackError('webhook me', 'error', { component: 'test', action: 'smoke' })
    await new Promise((r) => setTimeout(r, 10))
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://hooks.example.com/x')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.bookstore_severity).toBe('error')
    expect(body.bookstore_message).toBe('webhook me')
  })

  it('POSTs a Sentry envelope to the DSN host with auth header', async () => {
    const { trackError } = await freshModule({
      SENTRY_DSN: 'https://abc123@sentry.example.io/42',
      ERROR_WEBHOOK_URL: undefined,
    })
    trackError('sentry me', 'error', { component: 'test' })
    await new Promise((r) => setTimeout(r, 10))
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://sentry.example.io/api/42/envelope/')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers['X-Sentry-Auth']).toContain('sentry_key=abc123')
    const envelope = (init as RequestInit).body as string
    const [head, , payload] = envelope.split('\n')
    expect(JSON.parse(head).event_id).toBeTruthy()
    const event = JSON.parse(payload)
    expect(event.level).toBe('error')
    expect(event.message.formatted).toBe('sentry me')
  })

  it('dedupes identical message+context within the window', async () => {
    const { trackError } = await freshModule({ ERROR_WEBHOOK_URL: 'https://hooks.example.com/x' })
    trackError('same failure', 'error', { component: 'a', action: 'b' })
    trackError('same failure', 'error', { component: 'a', action: 'b' })
    trackError('same failure', 'error', { component: 'a', action: 'b' })
    await new Promise((r) => setTimeout(r, 10))
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('does not dedupe different contexts', async () => {
    const { trackError } = await freshModule({ ERROR_WEBHOOK_URL: 'https://hooks.example.com/x' })
    trackError('same failure', 'error', { component: 'a' })
    trackError('same failure', 'error', { component: 'b' })
    await new Promise((r) => setTimeout(r, 10))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throttles a burst to 30 sends per minute', async () => {
    const { trackError } = await freshModule({ ERROR_WEBHOOK_URL: 'https://hooks.example.com/x' })
    for (let i = 0; i < 40; i++) trackError(`burst-${i}`, 'error', { component: 'x' })
    await new Promise((r) => setTimeout(r, 10))
    expect(fetchMock.mock.calls.length).toBe(30)
  })

  it('never lets a transport failure break the caller', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    const { trackError } = await freshModule({ ERROR_WEBHOOK_URL: 'https://hooks.example.com/x' })
    expect(() => trackError('survives bad transport', 'error', {})).not.toThrow()
    await new Promise((r) => setTimeout(r, 10))
  })

  it('info severity is never shipped to transports', async () => {
    const { trackError } = await freshModule({ ERROR_WEBHOOK_URL: 'https://hooks.example.com/x' })
    trackError('just info', 'info', {})
    expect(fetchMock).not.toHaveBeenCalled()
    expect(quietLog).toHaveBeenCalledOnce()
  })
})
