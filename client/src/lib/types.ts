// Mirrors server/src/server/schemas.py (the API serializes to camelCase).

export type DataType = 'number' | 'string' | 'date' | 'boolean'
export type DisplayType =
  'summary' | 'table' | 'metrics' | 'chart' | 'clarification'
export type ChartType = 'bar' | 'line' | 'scatter' | 'pie'
export type CellValue =
  string | number | boolean | null | CellValue[] | { [key: string]: CellValue }
export type Row = Record<string, CellValue>

export interface DatasetInfo {
  id: string
  filename: string
  tableName: string
  sheet: string | null
  sheets: string[]
  rowCount: number
  columnCount: number
  createdAt: string
}

export interface ColumnProfile {
  name: string
  originalName: string
  sqlType: string
  dataType: DataType
  nullCount: number
  distinctCount: number
  sampleValues: CellValue[]
}

export interface DatasetSchema {
  datasetId: string
  tableName: string
  rowCount: number
  columns: ColumnProfile[]
}

export interface ResultColumn {
  key: string
  label: string
  dataType: DataType
}

export interface PreviewPage {
  columns: ResultColumn[]
  rows: Row[]
  page: number
  pageSize: number
  totalRows: number
}

export interface ChartSpec {
  type: ChartType
  x: string
  y: string[]
  title: string | null
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
  sql?: string | null
}

export interface ChatRequest {
  datasetId: string
  question: string
  history: ChatTurn[]
}

export interface ChatResponse {
  answer: string
  display: { type: DisplayType; title: string | null }
  columns: ResultColumn[]
  rows: Row[]
  explanation: string | null
  sql: string | null
  chart: ChartSpec | null
  assumptions: string[]
  truncated: boolean
  rowCount: number
}

export interface HealthResponse {
  status: 'ok'
  llmConfigured: boolean
  model: string
  maxUploadSizeMb: number
}

export interface UsageStats {
  llmCallsLastMinute: number
  llmCallsTotal: number
  rateLimitPerMinute: number
  trackingSince: string
}
