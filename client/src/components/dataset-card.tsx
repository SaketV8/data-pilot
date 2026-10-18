import { useQuery } from '@tanstack/react-query'
import { Loader2Icon, Trash2Icon } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { schemaQuery } from '@/lib/queries'
import { formatValue } from '@/lib/format'
import type { DatasetInfo } from '@/lib/types'

interface DatasetCardProps {
  info: DatasetInfo
  /** Sheet switching needs the original file, which is only kept for this session. */
  canSwitchSheet: boolean
  switchingSheet: boolean
  onSheetChange: (sheet: string) => void
  onDelete: () => void
  deleting: boolean
}

export function DatasetCard({
  info,
  canSwitchSheet,
  switchingSheet,
  onSheetChange,
  onDelete,
  deleting,
}: DatasetCardProps) {
  const schema = useQuery(schemaQuery(info.id))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="truncate" title={info.filename}>
          {info.filename}
        </CardTitle>
        <CardDescription>
          {info.rowCount.toLocaleString()} rows · {info.columnCount} columns
        </CardDescription>
        <CardAction>
          {/* Deleting is permanent, so it asks for confirmation first. */}
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete dataset"
                  title="Delete dataset"
                  disabled={deleting}
                />
              }
            >
              {deleting ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <Trash2Icon />
              )}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this dataset?</AlertDialogTitle>
                <AlertDialogDescription>
                  “{info.filename}” will be removed from the server and this
                  conversation cleared. This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                {/* A Close button, so confirming dismisses the dialog; the
                    trash icon then shows the spinner while the delete runs. */}
                <AlertDialogCancel variant="destructive" onClick={onDelete}>
                  Delete
                </AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {info.sheets.length > 1 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Worksheet
            </div>
            {canSwitchSheet ? (
              <Select
                value={info.sheet}
                onValueChange={(value) =>
                  value && value !== info.sheet && onSheetChange(value)
                }
                disabled={switchingSheet}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {info.sheets.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm">
                {info.sheet}{' '}
                <span className="text-muted-foreground">
                  (re-upload the file to pick another sheet)
                </span>
              </p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">
            Columns
          </div>
          {schema.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : schema.isError ? (
            <p className="text-sm text-destructive">{schema.error.message}</p>
          ) : (
            <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border text-sm">
              {schema.data.columns.map((col) => (
                <li key={col.name} className="space-y-0.5 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="truncate font-medium"
                      title={col.originalName}
                    >
                      {col.name}
                    </span>
                    <Badge variant="secondary">{col.dataType}</Badge>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {col.nullCount > 0 ? `${col.nullCount} missing · ` : ''}
                    e.g.{' '}
                    {col.sampleValues
                      .map((v) => formatValue(v, col.dataType, col.name))
                      .join(', ') || '—'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
