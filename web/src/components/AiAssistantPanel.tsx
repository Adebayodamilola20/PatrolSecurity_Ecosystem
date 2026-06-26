import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Bot, FileText, Loader2, MessageSquare, Send, ShieldCheck, X } from 'lucide-react'
import { api } from '../services/api'

type ChatRole = 'user' | 'assistant'

interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  sources?: string[]
  generatedReportId?: string | null
  unavailable?: boolean
}

interface AiAssistantPanelProps {
  mode?: 'drawer' | 'page'
  open?: boolean
  onClose?: () => void
}

const quickPrompts = [
  'Summarize today’s activity so far.',
  'Who is currently on duty?',
  'Any missed patrols or geofence issues?',
  'Draft a daily activity report for today.',
]

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function AiAssistantPanel({ mode = 'drawer', open = true, onClose }: AiAssistantPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'I can help with verified patrol activity, guards on duty, timesheets, incidents, pass-on logs, geofence checks, and report drafts.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMessage: ChatMessage = { id: createId(), role: 'user', content: trimmed }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput('')
    setError('')
    setLoading(true)

    try {
      const history = nextMessages
        .filter((message) => message.id !== 'welcome')
        .slice(-8)
        .map(({ role, content }) => ({ role, content }))
      const res = await api.ai.chat({ message: trimmed, history })
      if (res.generatedReportId && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ai:report-saved', { detail: { id: res.generatedReportId } }))
      }
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: 'assistant',
          content: res.answer,
          sources: res.sources,
          generatedReportId: res.generatedReportId,
          unavailable: res.assistantUnavailable,
        },
      ])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The assistant could not respond right now.'
      setError(message)
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: 'assistant',
          content: 'I could not reach the AI service right now. Please try again shortly.',
          unavailable: true,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    sendMessage(input)
  }

  if (!open) return null

  const shellClass = mode === 'page'
    ? 'flex h-[calc(100vh-150px)] min-h-[620px] flex-col overflow-hidden rounded-xl border border-border bg-card'
    : 'fixed inset-x-3 bottom-20 z-[70] flex h-[min(680px,calc(100vh-120px))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl md:inset-x-auto md:right-5 md:w-[420px]'

  return (
    <section className={shellClass} aria-label="AI Operations Assistant">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Bot className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">AI Operations Assistant</h2>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            Verified system data only
          </div>
        </div>
        {mode === 'drawer' && (
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close AI assistant"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] rounded-xl px-3 py-2 text-sm ${
              message.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : message.unavailable
                  ? 'border border-warning/30 bg-warning/10 text-warning'
                  : 'border border-border bg-background/70 text-foreground'
            }`}>
              <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
              {!!message.sources?.length && (
                <div className="mt-2 border-t border-current/10 pt-2 text-[11px] opacity-75">
                  Sources: {message.sources.join(', ')}
                </div>
              )}
              {message.generatedReportId && (
                <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-success/15 px-2 py-1 text-[11px] text-success">
                  <FileText className="h-3.5 w-3.5" />
                  Draft report saved
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking verified records
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        {messages.length === 1 && (
          <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => sendMessage(prompt)}
                className="rounded-lg border border-border bg-background/60 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        {error && <div className="mb-2 text-xs text-warning">{error}</div>}
        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                sendMessage(input)
              }
            }}
            placeholder="Ask about guards, patrols, reports, incidents, or SOPs..."
            rows={2}
            className="min-h-11 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Send message"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </section>
  )
}

export function AiAssistantLauncher({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-5 right-5 z-[65] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-black/25 hover:opacity-90"
      aria-label="Open AI Operations Assistant"
    >
      <MessageSquare className="h-5 w-5" />
    </button>
  )
}
