import { describe, it, expect } from 'vitest'
import { generateReceiptHtml, type ReceiptData } from './receipt'

describe('generateReceiptHtml', () => {
  const testData: ReceiptData = {
    storeName: 'Melio Bookstore - Q1',
    storeAddress: '123 Nguyễn Huệ, Q1',
    storePhone: '028-1234-5678',
    receiptNumber: 'TXN-2026-000001',
    date: '27/08/2026 14:30',
    cashier: 'Trần Thị B',
    items: [
      { name: 'Atomic Habits', quantity: 2, unitPrice: 120000, total: 240000 },
      { name: 'Deep Work', quantity: 1, unitPrice: 95000, total: 95000 },
    ],
    subtotal: 335000,
    discountTotal: 30000,
    total: 305000,
    paymentMethod: 'CASH',
    amountPaid: 350000,
    change: 45000,
    loyaltyPoints: 30,
    customerName: 'Nguyễn Văn A',
    customerPhone: '0901234567',
  }

  it('generates valid HTML document', () => {
    const html = generateReceiptHtml(testData)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<html>')
    expect(html).toContain('</html>')
    expect(html).toContain('<pre>')
  })

  it('includes store information', () => {
    const html = generateReceiptHtml(testData)
    expect(html).toContain('Melio Bookstore - Q1')
    expect(html).toContain('123 Nguyễn Huệ, Q1')
    expect(html).toContain('028-1234-5678')
  })

  it('includes receipt details', () => {
    const html = generateReceiptHtml(testData)
    expect(html).toContain('TXN-2026-000001')
    expect(html).toContain('27/08/2026 14:30')
    expect(html).toContain('Thu ngân: Trần Thị B')
  })

  it('includes line items', () => {
    const html = generateReceiptHtml(testData)
    expect(html).toContain('Atomic Habits')
    expect(html).toContain('Deep Work')
    expect(html).toContain('x2')
    expect(html).toContain('x1')
  })

  it('includes totals', () => {
    const html = generateReceiptHtml(testData)
    expect(html).toContain('335.000')
    expect(html).toContain('-30.000')
    expect(html).toContain('305.000')
  })

  it('includes payment info', () => {
    const html = generateReceiptHtml(testData)
    expect(html).toContain('Thanh toán: CASH')
    expect(html).toContain('350.000')
    expect(html).toContain('45.000')
  })

  it('includes loyalty points when present', () => {
    const html = generateReceiptHtml(testData)
    expect(html).toContain('+30 pts')
  })

  it('hides loyalty points when not present', () => {
    const noLoyalty = { ...testData, loyaltyPoints: undefined }
    const html = generateReceiptHtml(noLoyalty)
    expect(html).not.toContain('pts')
  })

  it('hides change when zero', () => {
    const exactChange = { ...testData, amountPaid: 305000, change: 0 }
    const html = generateReceiptHtml(exactChange)
    expect(html).not.toContain('Trả lại:')
  })

  it('includes footer when provided', () => {
    const withFooter = { ...testData, footer: 'www.melio.vn' }
    const html = generateReceiptHtml(withFooter)
    expect(html).toContain('www.melio.vn')
  })

  it('hides footer when not provided', () => {
    const html = generateReceiptHtml(testData)
    expect(html).not.toContain('www.melio.vn')
  })

  it('includes customer info when present', () => {
    const html = generateReceiptHtml(testData)
    expect(html).toContain('Khách: Nguyễn Văn A')
    expect(html).toContain('SĐT KH: 0901234567')
  })

  it('hides customer info when not present', () => {
    const noCustomer = { ...testData, customerName: undefined, customerPhone: undefined }
    const html = generateReceiptHtml(noCustomer)
    expect(html).not.toContain('Khách:')
    expect(html).not.toContain('SĐT KH:')
  })

  it('includes HÓA ĐƠN BÁN HÀNG header', () => {
    const html = generateReceiptHtml(testData)
    expect(html).toContain('HÓA ĐƠN BÁN HÀNG')
  })

  it('includes thank you message', () => {
    const html = generateReceiptHtml(testData)
    expect(html).toContain('Cảm ơn quý khách!')
    expect(html).toContain('Hẹn gặp lại!')
  })
})
