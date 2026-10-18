import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileSpreadsheetIcon, Loader2Icon, UploadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { healthQuery, useUploadDataset } from '@/lib/queries'
import type { DatasetInfo } from '@/lib/types'
import { cn } from '@/lib/utils'

const ACCEPT = '.csv,.tsv,.xlsx,.xlsm,.xls'

export function UploadCard({
  onUploaded,
}: {
  onUploaded: (info: DatasetInfo, file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const upload = useUploadDataset()
  // The server's upload limit, so oversized files are rejected before uploading.
  const maxMb = useQuery(healthQuery).data?.maxUploadSizeMb
  const busy = upload.isPending
  const error = fileError ?? (upload.isError ? upload.error.message : null)

  // A file dropped outside the drop zone would make the browser open it and
  // leave the app (losing the chat). Cancel those drops page-wide and show a
  // "not allowed" cursor; the drop zone cancels its own events first.
  useEffect(() => {
    const block = (e: DragEvent) => {
      if (e.defaultPrevented || !e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'none'
    }
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [])

  const start = (file: File | undefined) => {
    if (!file || busy) return
    if (maxMb !== undefined && file.size > maxMb * 1024 * 1024) {
      upload.reset()
      setFileError(
        `“${file.name}” is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${maxMb} MB.`,
      )
      return
    }
    setFileError(null)
    upload.mutate({ file }, { onSuccess: (info) => onUploaded(info, file) })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload data</CardTitle>
        <CardDescription>
          CSV or Excel (XLSX, XLS){maxMb ? `, up to ${maxMb} MB` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* aria-disabled instead of disabled: a disabled button may not get
            drag events, so a drop during an upload would reach the browser. */}
        <button
          type="button"
          aria-disabled={busy}
          onClick={() => !busy && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = busy ? 'none' : 'copy'
            if (!busy) setDragging(true)
          }}
          onDragLeave={(e) => {
            // Moving over the icon or text inside fires dragleave on the zone;
            // only reset when the pointer actually leaves it (stops flicker).
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setDragging(false)
            }
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            start(e.dataTransfer.files[0])
          }}
          className={cn(
            'flex w-full flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground transition-colors hover:bg-muted/50 aria-disabled:cursor-progress aria-disabled:opacity-60 aria-disabled:hover:bg-transparent',
            dragging && 'border-primary bg-muted/50',
          )}
        >
          {busy ? (
            <Loader2Icon className="size-6 animate-spin" />
          ) : (
            <FileSpreadsheetIcon className="size-6" />
          )}
          <span>
            {busy
              ? 'Uploading and profiling…'
              : 'Drop a file here or click to browse'}
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            start(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <Button
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <UploadIcon /> Choose file
        </Button>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
