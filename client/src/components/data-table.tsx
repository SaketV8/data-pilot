import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { formatValue } from '@/lib/format'
import type { ResultColumn, Row } from '@/lib/types'
import { cn } from '@/lib/utils'

interface DataTableProps {
  columns: ResultColumn[]
  rows: Row[]
  /** Client-side page size; omit to show all rows (e.g. server-paginated data). */
  pageSize?: number
  sortable?: boolean
}

const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns,
  columnMeta: {},
})

const columnHelper = createColumnHelper<typeof features, Row>()

export function DataTable({
  columns,
  rows,
  pageSize,
  sortable = true,
}: DataTableProps) {
  const columnDefs = columnHelper.columns(
    columns.map((col) =>
      columnHelper.accessor((row) => row[col.key], {
        id: col.key,
        header: col.label,
        sortUndefined: 'last',
        cell: (info) =>
          formatValue(info.row.original[col.key], col.dataType, col.key),
        meta: { numeric: col.dataType === 'number' },
      }),
    ),
  )

  const table = useTable({
    features,
    data: rows,
    columns: columnDefs,
    enableSorting: sortable,
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: pageSize ?? Math.max(rows.length, 1),
      },
    },
  })

  const numeric = (meta: { numeric?: boolean } | undefined) => meta?.numeric

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        numeric(header.column.columnDef.meta) && 'text-right',
                      )}
                    >
                      <button
                        type="button"
                        disabled={!header.column.getCanSort()}
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 font-medium disabled:cursor-default"
                      >
                        <table.FlexRender header={header} />
                        {sorted === 'asc' && <ArrowUpIcon className="size-3" />}
                        {sorted === 'desc' && (
                          <ArrowDownIcon className="size-3" />
                        )}
                      </button>
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-muted-foreground"
                >
                  No rows.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        'max-w-72 truncate',
                        numeric(cell.column.columnDef.meta) &&
                          'text-right tabular-nums',
                      )}
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {pageSize && table.getPageCount() > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>
            Page {table.state.pagination.pageIndex + 1} of{' '}
            {table.getPageCount()}
          </span>
          <Button
            variant="outline"
            size="xs"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
