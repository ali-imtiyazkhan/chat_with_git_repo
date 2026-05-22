'use client'
import { useState, useEffect, useRef } from 'react'
import { Send, Bot, User, Loader2, AlertCircle, Zap, Trash2, Copy, Check } from 'lucide-react'
import Navbar from '@/components/Navbar'
import { streamChat, getStatus, StatusResponse } from '@/lib/api'
import clsx from 'clsx'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

const SUGGESTIONS = [
  'What does this codebase do?',
  'Explain the main architecture',
  'What are the key dependencies?',
  'How is authentication handled?',
  'Where is the entry point?',
  'List all API endpoints',
]

function renderContent(text: string) {
  // Very lightweight markdown-to-html for chat
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code class="language-${lang}">${code.replace(/</g, '&lt;')}</code></pre>`
    )
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hupoli])(.+)$/gm, '$1')
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [thinking, setThinking] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const poll = async () => {
      try { setStatus(await getStatus()) } catch {}
    }
    poll()
    const id = setInterval(poll, 3000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text?: string) => {
    const q = (text ?? input).trim()
    if (!q || thinking || !status?.indexed) return

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: q }
    const botId = crypto.randomUUID()
    const botMsg: Message = { id: botId, role: 'assistant', content: '', streaming: true }

    setMessages(prev => [...prev, userMsg, botMsg])
    setInput('')
    setThinking(true)

    await streamChat(
      q,
      (token) => {
        setMessages(prev =>
          prev.map(m => m.id === botId ? { ...m, content: m.content + token } : m)
        )
      },
      () => {
        setMessages(prev =>
          prev.map(m => m.id === botId ? { ...m, streaming: false } : m)
        )
        setThinking(false)
      },
      (err) => {
        setMessages(prev =>
          prev.map(m => m.id === botId ? { ...m, content: `Error: ${err}`, streaming: false } : m)
        )
        setThinking(false)
      }
    )
  }

  const copyMsg = (id: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const clearChat = () => setMessages([])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const notReady = !status?.indexed
  const isIndexing = status?.indexing

  return (
    <div className="noise flex flex-col h-screen bg-[var(--bg)]">
      <Navbar />

      {/* Status bar */}
      <div className="fixed top-14 left-0 right-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-sm px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isIndexing ? (
            <><Loader2 size={12} className="text-[var(--warning)] animate-spin" />
              <span className="text-xs font-mono text-[var(--warning)]">Indexing repository…</span></>
          ) : status?.indexed ? (
            <><span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse" />
              <span className="text-xs font-mono text-[var(--muted)]">
                {status.repo} · {status.file_count} files · {status.chunk_count} chunks
              </span></>
          ) : (
            <><span className="w-2 h-2 rounded-full bg-[var(--muted)]" />
              <span className="text-xs font-mono text-[var(--muted)]">No repository indexed — go to Home to load one</span></>
          )}
        </div>
        {messages.length > 0 && (
          <button onClick={clearChat} className="flex items-center gap-1 text-xs font-mono text-[var(--muted)] hover:text-[var(--error)] transition-colors">
            <Trash2 size={11} /> Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto pt-28 pb-36 px-4">
        <div className="max-w-3xl mx-auto space-y-6">

          {messages.length === 0 && (
            <div className="pt-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl border border-[var(--border)] bg-[var(--surface)] mb-5">
                <Bot size={28} className="text-[var(--accent)]" />
              </div>
              <h2 className="font-display text-2xl font-bold mb-2">Ask about the codebase</h2>
              <p className="text-[var(--muted)] text-sm mb-8">
                {notReady ? 'Load a repository from the Home page first.' : 'Try one of these to get started:'}
              </p>
              {!notReady && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl mx-auto">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="text-left px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-xs font-mono text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] hover:bg-[var(--accent-dim)] transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={clsx('flex gap-3', msg.role === 'user' && 'flex-row-reverse')}>
              {/* Avatar */}
              <div className={clsx(
                'w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 mt-1',
                msg.role === 'assistant'
                  ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                  : 'border-[var(--border)] bg-[var(--surface-2)]'
              )}>
                {msg.role === 'assistant'
                  ? <Bot size={14} className="text-[var(--accent)]" />
                  : <User size={14} className="text-[var(--muted)]" />
                }
              </div>

              {/* Bubble */}
              <div className={clsx(
                'group relative max-w-[80%] rounded-2xl px-4 py-3',
                msg.role === 'user'
                  ? 'bg-[var(--surface-2)] border border-[var(--border)] text-sm text-[var(--text)]'
                  : 'bg-[var(--surface)] border border-[var(--border)] text-sm'
              )}>
                {msg.role === 'assistant' ? (
                  <>
                    {msg.content ? (
                      <div
                        className="prose-chat leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
                      />
                    ) : (
                      <div className="flex gap-1.5 items-center py-1">
                        <div className="typing-dot" />
                        <div className="typing-dot" />
                        <div className="typing-dot" />
                      </div>
                    )}
                    {msg.streaming && msg.content && (
                      <span className="inline-block w-0.5 h-4 bg-[var(--accent)] ml-0.5 animate-blink align-middle" />
                    )}
                  </>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}

                {/* Copy button */}
                {!msg.streaming && msg.content && (
                  <button
                    onClick={() => copyMsg(msg.id, msg.content)}
                    className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--surface-2)] border border-[var(--border)] rounded-md p-1"
                  >
                    {copiedId === msg.id
                      ? <Check size={11} className="text-[var(--success)]" />
                      : <Copy size={11} className="text-[var(--muted)]" />
                    }
                  </button>
                )}
              </div>
            </div>
          ))}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-md p-4">
        <div className="max-w-3xl mx-auto">
          <div className={clsx(
            'flex items-end gap-3 p-3 rounded-xl border transition-colors',
            notReady
              ? 'border-[var(--border)] opacity-50'
              : 'border-[var(--border)] focus-within:border-[var(--accent)]'
          )}>
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={e => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              onKeyDown={handleKey}
              placeholder={notReady ? 'Load a repository first…' : 'Ask anything about the codebase…'}
              disabled={notReady || thinking}
              className="flex-1 bg-transparent text-sm font-body text-[var(--text)] placeholder:text-[var(--muted)] outline-none resize-none leading-relaxed"
              style={{ minHeight: '24px', maxHeight: '120px' }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || thinking || notReady}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--accent)] text-black hover:opacity-90 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
            >
              {thinking
                ? <Loader2 size={15} className="animate-spin" />
                : <Send size={15} />
              }
            </button>
          </div>
          <p className="text-center text-[10px] font-mono text-[var(--muted)] mt-2">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  )
}
