import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronDownIcon, DatabaseIcon, TriangleAlertIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChatPanel } from '@/components/chat-panel'
import { DatasetCard } from '@/components/dataset-card'
import { ModeToggle } from '@/components/mode-toggle'
import { PreviewPanel } from '@/components/preview-panel'
import { UploadCard } from '@/components/upload-card'
import {
  datasetQuery,
  healthQuery,
  useDeleteDataset,
  useUploadDataset,
} from '@/lib/queries'
import type { DatasetInfo } from '@/lib/types'
import { cn } from '@/lib/utils'

interface HomeSearch {
  dataset?: string
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    dataset: typeof search.dataset === 'string' ? search.dataset : undefined,
  }),
  component: Home,
})

function Home() {
  const { dataset: datasetId } = Route.useSearch()
  const navigate = useNavigate({ from: '/' })
  const health = useQuery(healthQuery)
  const dataset = useQuery({
    ...datasetQuery(datasetId ?? ''),
    enabled: !!datasetId,
  })
  const remove = useDeleteDataset()
  // Deleting the previous sheet's dataset uses its own mutation, so the delete
  // button of the new dataset doesn't show a spinner while it runs.
  const removePrevious = useDeleteDataset()
  const reupload = useUploadDataset()
  // The uploaded File is kept so an Excel worksheet can be switched without re-picking it.
  const [source, setSource] = useState<{
    datasetId: string
    file: File
  } | null>(null)

  // On small screens the upload/dataset panel collapses so chat gets the full height.
  const [panelOpen, setPanelOpen] = useState(!datasetId)

  const select = (id: string | undefined) =>
    navigate({ search: { dataset: id } })

  const onUploaded = (info: DatasetInfo, file: File) => {
    setSource({ datasetId: info.id, file })
    setPanelOpen(false)
    select(info.id)
  }

  const switchSheet = (sheet: string) => {
    if (!source || !datasetId) return
    const previous = datasetId
    reupload.mutate(
      { file: source.file, sheet },
      {
        onSuccess: (info) => {
          onUploaded(info, source.file)
          removePrevious.mutate(previous)
        },
      },
    )
  }

  const info = dataset.data

  return (
    <div className="flex h-dvh flex-col">
      <header className="shrink-0 border-b">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <DatabaseIcon className="size-5" />
          <h1 className="font-semibold">Data Pilot</h1>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            Chat with your data
          </span>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {info ? (
              <Badge variant="outline" className="max-w-64 truncate">
                Active: {info.filename}
                {info.sheet ? ` · ${info.sheet}` : ''}
              </Badge>
            ) : (
              <Badge variant="secondary">No dataset</Badge>
            )}
            <ModeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6 lg:py-6">
        <button
          type="button"
          aria-expanded={panelOpen}
          aria-controls="data-panel"
          onClick={() => setPanelOpen((open) => !open)}
          className="flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm lg:hidden"
        >
          <DatabaseIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium">
            {info ? info.filename : 'Upload data'}
          </span>
          <span className="text-xs text-muted-foreground">
            {panelOpen ? 'Hide' : info ? 'Dataset & upload' : 'Show'}
          </span>
          <ChevronDownIcon
            className={cn(
              'size-4 transition-transform',
              panelOpen && 'rotate-180',
            )}
          />
        </button>

        <aside
          id="data-panel"
          className={cn(
            'shrink-0 space-y-4 overflow-y-auto lg:block lg:max-h-none lg:min-h-0',
            panelOpen ? 'max-h-[55dvh]' : 'hidden',
          )}
        >
          <UploadCard onUploaded={onUploaded} />
          {info && (
            <DatasetCard
              info={info}
              canSwitchSheet={source?.datasetId === info.id}
              switchingSheet={reupload.isPending}
              onSheetChange={switchSheet}
              deleting={remove.isPending}
              onDelete={() =>
                remove.mutate(info.id, {
                  onSuccess: () => {
                    setSource(null)
                    select(undefined)
                  },
                })
              }
            />
          )}
          {reupload.isError && (
            <Alert variant="destructive">
              <AlertDescription>{reupload.error.message}</AlertDescription>
            </Alert>
          )}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          {health.isError && (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertTitle>API unreachable</AlertTitle>
              <AlertDescription>{health.error.message}</AlertDescription>
            </Alert>
          )}
          {health.data && !health.data.llmConfigured && (
            <Alert>
              <TriangleAlertIcon />
              <AlertTitle>Language model not configured</AlertTitle>
              <AlertDescription>
                Uploads and previews work, but chat needs NVIDIA_NIM_API_KEY set
                in server/.env.
              </AlertDescription>
            </Alert>
          )}

          {!datasetId ? (
            <EmptyState />
          ) : dataset.isPending ? (
            <Skeleton className="h-96" />
          ) : dataset.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Dataset unavailable</AlertTitle>
              <AlertDescription>{dataset.error.message}</AlertDescription>
            </Alert>
          ) : (
            <Tabs
              defaultValue="chat"
              key={dataset.data.id}
              className="min-h-0 flex-1"
            >
              <TabsList>
                <TabsTrigger value="chat">Chat</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
              <TabsContent value="chat" keepMounted className="min-h-0 pt-2">
                <ChatPanel datasetId={dataset.data.id} />
              </TabsContent>
              <TabsContent
                value="preview"
                className="min-h-0 overflow-y-auto pt-2"
              >
                <PreviewPanel datasetId={dataset.data.id} />
              </TabsContent>
            </Tabs>
          )}
        </section>
      </main>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-24 text-center">
      <DatabaseIcon className="size-8 text-muted-foreground" />
      <h2 className="font-medium">Upload a dataset to get started</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Upload a CSV or Excel file, then ask questions like “Who is the top
        student?” or “Show monthly revenue trends.”
      </p>
    </div>
  )
}
