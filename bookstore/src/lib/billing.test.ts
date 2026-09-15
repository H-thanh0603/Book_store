import { describe, it, expect, vi, beforeEach } from 'vitest'

// MONEY-002 regression: a FAILED gateway response must never flip a
// BillingInvoice to PAID. settleBillingPayment gates on wp.status — these
// tests pin that contract with a mocked db (no Postgres needed).

vi.mock('./db', () => ({ prisma: {} }))

import { prisma } from './db'
import { settleBillingPayment } from './billing'

describe('settleBillingPayment (MONEY-002 gate)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns false without touching the invoice when WebPayment is PENDING', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'wp-1', txnRef: 'bill_x', status: 'PENDING',
      billingInvoice: { id: 'inv-1', status: 'PENDING' },
    })
    const update = vi.fn()
    ;(prisma as unknown as Record<string, unknown>).webPayment = { findUnique }
    ;(prisma as unknown as Record<string, unknown>).billingInvoice = { update }
    expect(await settleBillingPayment('bill_x')).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('returns false without touching the invoice when WebPayment FAILED', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'wp-1', txnRef: 'bill_x', status: 'FAILED',
      billingInvoice: { id: 'inv-1', status: 'PENDING' },
    })
    const update = vi.fn()
    ;(prisma as unknown as Record<string, unknown>).webPayment = { findUnique }
    ;(prisma as unknown as Record<string, unknown>).billingInvoice = { update }
    expect(await settleBillingPayment('bill_x')).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('flips the invoice to PAID only when WebPayment is PAID', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'wp-1', txnRef: 'bill_x', status: 'PAID',
      billingInvoice: { id: 'inv-1', status: 'PENDING' },
    })
    const update = vi.fn().mockResolvedValue({ id: 'inv-1', status: 'PAID' })
    ;(prisma as unknown as Record<string, unknown>).webPayment = { findUnique }
    ;(prisma as unknown as Record<string, unknown>).billingInvoice = { update }
    expect(await settleBillingPayment('bill_x')).toBe(true)
    expect(update).toHaveBeenCalledOnce()
    expect(update.mock.calls[0][0].data.status).toBe('PAID')
  })

  it('is idempotent when the invoice is already PAID', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'wp-1', txnRef: 'bill_x', status: 'PAID',
      billingInvoice: { id: 'inv-1', status: 'PAID' },
    })
    const update = vi.fn()
    ;(prisma as unknown as Record<string, unknown>).webPayment = { findUnique }
    ;(prisma as unknown as Record<string, unknown>).billingInvoice = { update }
    expect(await settleBillingPayment('bill_x')).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it('returns false when no billing invoice is linked', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'wp-1', txnRef: 'bill_x', status: 'PAID', billingInvoice: null,
    })
    ;(prisma as unknown as Record<string, unknown>).webPayment = { findUnique }
    expect(await settleBillingPayment('bill_x')).toBe(false)
  })
})
