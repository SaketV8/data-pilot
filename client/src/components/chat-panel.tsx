import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2Icon, RotateCcwIcon, SendIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { QueryResultRenderer } from '@/components/results/query-result-renderer'
import { schemaQuery, useChat } from '@/lib/queries'
import type { ChatResponse, ChatTurn, DatasetSchema } from '@/lib/types'

// Matches the server, which keeps the last 8 turns of history (chat.py).
const MAX_HISTORY_TURNS = 8

interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  result?: ChatResponse
  error?: boolean
}

export function ChatPanel({ datasetId }: { datasetId: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const chat = useChat()
  const schema = useQuery(schemaQuery(datasetId))
  const bottomRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(0)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, chat.isPending])

  const ask = (question: string) => {
    const text = question.trim()
    if (!text || chat.isPending) return
    // Successful turns only, so follow-ups refer to real answers: drop failed
    // replies and the questions that caused them (messages alternate user →
    // assistant). Send only the most recent turns, which is all the server uses;
    // the full conversation would exceed its history limit and fail with a 422.
    const history: ChatTurn[] = messages
      .filter(
        (m, i) => !m.error && !(m.role === 'user' && messages[i + 1]?.error),
      )
      .slice(-MAX_HISTORY_TURNS)
      .map((m) => ({
        role: m.role,
        content: m.content,
        sql: m.result?.sql ?? null,
      }))
    const push = (m: Omit<Message, 'id'>) =>
      setMessages((prev) => [...prev, { ...m, id: nextId.current++ }])

    push({ role: 'user', content: text })
    setDraft('')
    chat.mutate(
      { datasetId, question: text, history },
      {
        onSuccess: (result) =>
          push({ role: 'assistant', content: result.answer, result }),
        onError: (err) =>
          push({ role: 'assistant', content: err.message, error: true }),
      },
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* -mx-1 px-1: room for focus rings, which the scroll container would
          otherwise clip at its edges. */}
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-4">
        {messages.length === 0 ? (
          <div className="flex min-h-full flex-col items-center justify-center gap-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Ask a question about this dataset. Answers are calculated by
              DuckDB.
            </p>
            {schema.data && (
              <div className="flex flex-wrap justify-center gap-2">
                {exampleQuestions(schema.data).map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    size="sm"
                    // Long questions wrap on narrow screens instead of
                    // overflowing the panel.
                    className="h-auto min-h-7 py-1 whitespace-normal"
                    onClick={() => ask(q)}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground">
                    {m.content}
                  </div>
                </div>
              ) : m.error ? (
                <Alert key={m.id} variant="destructive">
                  <AlertDescription>{m.content}</AlertDescription>
                </Alert>
              ) : (
                <AssistantMessage key={m.id} result={m.result!} />
              ),
            )}
            {chat.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" /> Analyzing…
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex shrink-0 items-end gap-2 border-t bg-background pt-3"
        onSubmit={(e) => {
          e.preventDefault()
          ask(draft)
        }}
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              ask(draft)
            }
          }}
          placeholder={
            messages.length
              ? 'Ask a follow-up…'
              : 'e.g. Which region generated the highest revenue?'
          }
          className="max-h-40 min-h-10 resize-none"
          rows={1}
          maxLength={2000}
        />
        <Button
          type="submit"
          size="icon-lg"
          disabled={!draft.trim() || chat.isPending}
          aria-label="Send"
        >
          <SendIcon />
        </Button>
        {messages.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label="New conversation"
            title="New conversation"
            disabled={chat.isPending}
            onClick={() => setMessages([])}
          >
            <RotateCcwIcon />
          </Button>
        )}
      </form>
    </div>
  )
}

function AssistantMessage({ result }: { result: ChatResponse }) {
  return (
    <div className="space-y-3 rounded-2xl border bg-card px-4 py-3">
      {result.display.title && result.display.type !== 'clarification' && (
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {result.display.title}
        </div>
      )}
      <p className="text-sm leading-relaxed">{result.answer}</p>
      <QueryResultRenderer result={result} />
      {result.truncated && (
        <p className="text-xs text-muted-foreground">
          Showing the first {result.rowCount.toLocaleString()} rows.
        </p>
      )}
      {(result.explanation || result.sql || result.assumptions.length > 0) && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">
            How this was calculated
          </summary>
          <div className="mt-2 space-y-2">
            {result.explanation && <p>{result.explanation}</p>}
            {result.assumptions.length > 0 && (
              <ul className="list-disc pl-4">
                {result.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
            {result.sql && (
              <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono whitespace-pre-wrap text-foreground">
                {result.sql}
              </pre>
            )}
          </div>
        </details>
      )}
    </div>
  )
}

function exampleQuestions(schema: DatasetSchema): string[] {
  const numeric = schema.columns.find(
    (c) => c.dataType === 'number' && !/(^|_)id$/.test(c.name),
  )
  const category = schema.columns.find(
    (c) => c.dataType === 'string' && c.distinctCount <= 50,
  )
  const date = schema.columns.find((c) => c.dataType === 'date')
  const questions = [`How many rows are in this dataset?`]
  if (numeric) questions.push(`Show the top 10 rows by ${numeric.name}`)
  if (numeric && category)
    questions.push(`What is the average ${numeric.name} by ${category.name}?`)
  if (numeric && date)
    questions.push(`Show the monthly trend of total ${numeric.name}`)
  if (category) questions.push(`Which ${category.name} appears most often?`)
  return questions.slice(0, 4)
}
