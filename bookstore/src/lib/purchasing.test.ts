import { describe, it, expect, vi, beforeEach } from 'vitest'
import { assertPoTransition } from './purchasing'

describe('assertPoTransition', () => {
  it('allows valid transitions', () => {
    expect(() => assertPoTransition('draft', 'pending_approval')).not.toThrow()
    expect(() => assertPoTransition('pending_approval', 'approved')).not.toThrow()
    expect(() => assertPoTransition('approved', 'sent')).not.toThrow()
    expect(() => assertPoTransition('sent', 'received')).not.toThrow()
    expect(() => assertPoTransition('received', 'closed')).not.toThrow()
  })

  it('allows cancellation from any non-terminal state', () => {
    expect(() => assertPoTransition('draft', 'cancelled')).not.toThrow()
    expect(() => assertPoTransition('pending_approval', 'cancelled')).not.toThrow()
    expect(() => assertPoTransition('approved', 'cancelled')).not.toThrow()
    expect(() => assertPoTransition('sent', 'cancelled')).not.toThrow()
  })

  it('rejects invalid transitions', () => {
    expect(() => assertPoTransition('cancelled', 'approved')).toThrow('Cannot transition PO')
    expect(() => assertPoTransition('closed', 'sent')).toThrow('Cannot transition PO')
    expect(() => assertPoTransition('draft', 'sent')).toThrow('Cannot transition PO')
    expect(() => assertPoTransition('received', 'sent')).toThrow('Cannot transition PO')
  })

  it('rejects self-transitions for terminal states', () => {
    expect(() => assertPoTransition('cancelled', 'cancelled')).toThrow('Cannot transition PO')
    expect(() => assertPoTransition('closed', 'closed')).toThrow('Cannot transition PO')
  })
})
