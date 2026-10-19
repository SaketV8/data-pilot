import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GaugeIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { usageQuery } from '@/lib/queries'
import type { UsageStats } from '@/lib/types'
import { cn } from '@/lib/utils'

export function UsageDialog() {
  const [open, setOpen] = useState(false)
  // Only fetch (and poll) while the dialog is open.
  const usage = useQuery({ ...usageQuery, enabled: open })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label="LLM usage"
            title="LLM usage"
          />
        }
      >
        <GaugeIcon />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>LLM usage</DialogTitle>
          <DialogDescription>
            Calls to the language model from all conversations.
          </DialogDescription>
        </DialogHeader>
        {usage.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{usage.error.message}</AlertDescription>
          </Alert>
        ) : !usage.data ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <UsageStatsView {...usage.data} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function UsageStatsView({
  llmCallsLastMinute,
  llmCallsTotal,
  rateLimitPerMinute,
  trackingSince,
}: UsageStats) {
  const ratio = llmCallsLastMinute / rateLimitPerMinute
  return (
    <div className="space-y-4">
      <Progress
        value={Math.min(llmCallsLastMinute, rateLimitPerMinute)}
        max={rateLimitPerMinute}
        className={cn(
          ratio >= 1
            ? '[&_[data-slot=progress-indicator]]:bg-destructive'
            : ratio >= 0.75 &&
                '[&_[data-slot=progress-indicator]]:bg-amber-500',
        )}
      >
        <ProgressLabel>Requests in the last minute</ProgressLabel>
        <ProgressValue>
          {() => `${llmCallsLastMinute} / ${rateLimitPerMinute}`}
        </ProgressValue>
      </Progress>
      <Separator />
      <div>
        <div className="text-sm text-muted-foreground">Total requests</div>
        <div className="text-2xl font-semibold tabular-nums">
          {llmCallsTotal.toLocaleString()}
        </div>
        <div className="text-xs text-muted-foreground">
          Since {new Date(trackingSince).toLocaleString()}
        </div>
      </div>
    </div>
  )
}
