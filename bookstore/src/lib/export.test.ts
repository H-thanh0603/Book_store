import { describe, it, expect } from 'vitest'
import { exportData, exportFilename } from './export'
import type { ExportColumn } from './export'

describe('exportData', () => {
  const columns: ExportColumn<{ name: string; age: number }>[] = [
    { key: 'name', header: 'Name' },
    { key: 'age', header: 'Age' },
  ]

  const data = [
    { name: 'Alice', age: 30 },
    { name: 'Bob', age: 25 },
  ]

  it('generates CSV with headers and rows', () => {
    const result = exportData(data, columns, 'test', 'csv')
    expect(result.extension).toBe('csv')
    expect(result.contentType).toBe('text/csv; charset=utf-8')
    const text = result.buffer.toString('utf-8')
    expect(text).toContain('Name,Age')
    expect(text).toContain('Alice,30')
    expect(text).toContain('Bob,25')
  })

  it('generates XLSX with correct content type', () => {
    const result = exportData(data, columns, 'test', 'xlsx')
    expect(result.extension).toBe('xlsx')
    expect(result.contentType).toContain('spreadsheetml')
  })

  it('applies custom format function', () => {
    const cols: ExportColumn<{ name: string; price: number }>[] = [
      { key: 'name', header: 'Name' },
      { key: 'price', header: 'Price', format: (r) => `${r.price.toLocaleString()}đ` },
    ]
    const items = [{ name: 'Book', price: 100000 }]
    const result = exportData(items, cols, 'test', 'csv')
    expect(result.buffer.toString('utf-8')).toContain('100,000đ')
  })

  it('handles empty data', () => {
    const result = exportData([], columns, 'test', 'csv')
    expect(result.extension).toBe('csv')
    expect(result.buffer).toBeDefined()
  })
})

describe('exportFilename', () => {
  it('generates filename with date', () => {
    const result = exportFilename('products', 'csv')
    expect(result).toMatch(/^products_\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('generates xlsx extension', () => {
    const result = exportFilename('orders', 'xlsx')
    expect(result).toMatch(/^orders_\d{4}-\d{2}-\d{2}\.xlsx$/)
  })
})
