import { DataTable } from '@/components/data-table'
import type { ChatResponse } from '@/lib/types'

export function TableResult({ result }: { result: ChatResponse }) {
  return <DataTable columns={result.columns} rows={result.rows} pageSize={10} />
}
