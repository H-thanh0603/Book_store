import * as XLSX from 'xlsx'

export type ExportFormat = 'csv' | 'xlsx'

export type ExportColumn<T> = {
  key: string
  header: string
  format?: (value: T) => string | number | null
}

/**
 * Export an array of data to CSV or Excel format.
 * Returns a Buffer that can be sent as a file download response.
 */
export function exportData<T extends Record<string, unknown>>(
  data: T[],
  columns: ExportColumn<T>[],
  filename: string,
  format: ExportFormat = 'csv',
): { buffer: Buffer; contentType: string; extension: string } {
  const rows = data.map((item) => {
    const row: Record<string, unknown> = {}
    for (const col of columns) {
      row[col.header] = col.format
        ? col.format(item as T)
        : (item as Record<string, unknown>)[col.key] ?? ''
    }
    return row
  })

  const ws = XLSX.utils.json_to_sheet(rows)

  // Auto-size columns
  const colWidths = columns.map((col) => ({
    wch: Math.max(
      col.header.length,
      ...rows.map((row) => String(row[col.header] ?? '').length).slice(0, 100),
    ),
  }))
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')

  if (format === 'xlsx') {
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    return {
      buffer: Buffer.from(buffer),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
    }
  }

  // CSV
  const csv = XLSX.utils.sheet_to_csv(ws)
  return {
    buffer: Buffer.from(csv, 'utf-8'),
    contentType: 'text/csv; charset=utf-8',
    extension: 'csv',
  }
}

/**
 * Generate a filename with date and extension.
 */
export function exportFilename(base: string, format: ExportFormat): string {
  const date = new Date().toISOString().slice(0, 10)
  return `${base}_${date}.${format}`
}
