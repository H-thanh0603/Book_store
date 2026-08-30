import { describe, it, expect } from 'vitest'
import { orderConfirmationEmail, lowStockAlertEmail, type OrderEmailData, type LowStockEmailData } from './email-templates'

describe('orderConfirmationEmail', () => {
  const testData: OrderEmailData = {
    orderNumber: 'ORD-2026-000001',
    customerName: 'Nguyễn Văn A',
    items: [
      { name: 'Atomic Habits', quantity: 2, unitPrice: 120000 },
      { name: 'Deep Work', quantity: 1, unitPrice: 95000 },
    ],
    subtotal: 335000,
    discountTotal: 30000,
    total: 305000,
    fulfillment: 'delivery',
    address: '123 Nguyễn Huệ, Q1, TP.HCM',
    phone: '0901234567',
  }

  it('generates correct subject', () => {
    const result = orderConfirmationEmail(testData)
    expect(result.subject).toContain('ORD-2026-000001')
    expect(result.subject).toContain('Melio Bookstore')
  })

  it('generates text version with all details', () => {
    const result = orderConfirmationEmail(testData)
    expect(result.text).toContain('Nguyễn Văn A')
    expect(result.text).toContain('ORD-2026-000001')
    expect(result.text).toContain('Atomic Habits')
    expect(result.text).toContain('305')
    expect(result.text).toContain('Giao hàng tận nơi')
    expect(result.text).toContain('123 Nguyễn Huệ')
  })

  it('generates HTML version', () => {
    const result = orderConfirmationEmail(testData)
    expect(result.html).toContain('<!DOCTYPE html>')
    expect(result.html).toContain('Melio Bookstore')
    expect(result.html).toContain('Đặt hàng thành công!')
    expect(result.html).toContain('ORD-2026-000001')
    expect(result.html).toContain('Atomic Habits')
    expect(result.html).toContain('305.000')
  })

  it('shows pickup fulfillment correctly', () => {
    const pickupData = { ...testData, fulfillment: 'pickup', address: undefined }
    const result = orderConfirmationEmail(pickupData)
    expect(result.text).toContain('Nhận tại cửa hàng')
    expect(result.html).toContain('Nhận tại cửa hàng')
    expect(result.text).not.toContain('Địa chỉ:')
  })

  it('hides discount when zero', () => {
    const noDiscount = { ...testData, discountTotal: 0 }
    const result = orderConfirmationEmail(noDiscount)
    expect(result.text).toContain('Giảm giá: 0 ₫')
    expect(result.html).not.toContain('Giảm giá')
  })
})

describe('lowStockAlertEmail', () => {
  const testData: LowStockEmailData = {
    productName: 'Atomic Habits',
    sku: 'BOOK-ATOMIC-001',
    currentStock: 3,
    locationName: 'Kho chính',
    storeName: 'Melio Bookstore - Q1',
  }

  it('generates alert subject', () => {
    const result = lowStockAlertEmail(testData)
    expect(result.subject).toContain('Cảnh báo tồn thấp')
    expect(result.subject).toContain('Atomic Habits')
    expect(result.subject).toContain('BOOK-ATOMIC-001')
  })

  it('generates text with stock info', () => {
    const result = lowStockAlertEmail(testData)
    expect(result.text).toContain('Atomic Habits')
    expect(result.text).toContain('BOOK-ATOMIC-001')
    expect(result.text).toContain('3')
    expect(result.text).toContain('Kho chính')
    expect(result.text).toContain('Melio Bookstore - Q1')
  })

  it('generates HTML with warning styling', () => {
    const result = lowStockAlertEmail(testData)
    expect(result.html).toContain('Cảnh báo tồn kho thấp')
    expect(result.html).toContain('#dc2626') // red color for low stock
    expect(result.html).toContain('BOOK-ATOMIC-001')
  })
})
