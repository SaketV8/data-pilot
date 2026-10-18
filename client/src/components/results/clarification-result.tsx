import { HelpCircleIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { ChatResponse } from '@/lib/types'

export function ClarificationResult({ result }: { result: ChatResponse }) {
  return (
    <Alert>
      <HelpCircleIcon />
      <AlertTitle>{result.display.title ?? 'Clarification needed'}</AlertTitle>
      <AlertDescription>
        Reply below with more detail and I'll run the analysis.
      </AlertDescription>
    </Alert>
  )
}
