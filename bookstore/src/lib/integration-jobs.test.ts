import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockIntegrationJob = vi.hoisted(() => ({
  create: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  updateMany: vi.fn(),
}))

vi.mock('./db', () => ({
  prisma: {
    integrationJob: mockIntegrationJob,
  },
}))

import { claimIntegrationJob } from './integration-jobs'

describe('claimIntegrationJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const validInput = {
    provider: 'shopee',
    kind: 'order.created',
    externalId: 'ext-123',
    idempotencyKey: 'idem-key-123',
    payload: { test: true },
  }

  it('creates new job when no duplicate', async () => {
    mockIntegrationJob.create.mockResolvedValue({
      id: 'job-1', ...validInput, status: 'PROCESSING', attempts: 1,
    })

    const result = await claimIntegrationJob(validInput)
    expect(result.claimed).toBe(true)
    expect(mockIntegrationJob.create).toHaveBeenCalled()
  })
})
