import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/data-table'
import { previewQuery } from '@/lib/queries'

const PAGE_SIZE = 25

export function PreviewPanel({ datasetId }: { datasetId: string }) {
  const [page, setPage] = useState(1)
  const preview = useQuery(previewQuery(datasetId, page, PAGE_SIZE))

  if (preview.isPending) return <Skeleton className="h-96" />
  if (preview.isError)
    return <p className="text-sm text-destructive">{preview.error.message}</p>

  const { columns, rows, totalRows } = preview.data
  const pages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))
  const first = totalRows === 0 ? 0 : (page - 1) * PAGE_SIZE + 1

  return (
    <div className="space-y-2">
      <DataTable
        columns={columns}
        rows={rows}
        pageSize={PAGE_SIZE}
        sortable={false}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Rows {first.toLocaleString()}–
          {Math.min(page * PAGE_SIZE, totalRows).toLocaleString()} of{' '}
          {totalRows.toLocaleString()}
          {preview.isPlaceholderData && ' · loading…'}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="xs"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
