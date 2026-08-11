import { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'

const SUPABASE_URL = 'https://qxypaepvmtmkhbssedki.supabase.co'

const ACTION_LINKS = {
  created_client:   (r) => ({ label: `View ${r.company}`, path: `/client/${r.id}` }),
  created_ticket:   (r) => ({ label: `View ticket`, path: `/service-tickets` }),
  created_task:     (r) => ({ label: `View tasks`, path: `/tasks` }),
  created_proposal: (r) => ({ label: `Open proposal`, path: `/proposal/${r.id}` }),
}

function ToolBadge({ tool, result }) {
  const labels = {
    create_client: '+ Client',
    search_clients: '⌕ Clients',
    create_service_ticket: '+ Ticket',
    create_task: '+ Task',
    create_proposal: '+ Proposal',
    get_pipeline_summary: '↗ Pipeline',
    get_recent_activity: '↗ Activity',
  }
  const ok = !result?.error
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
      ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
    }`}>
      {ok ? '✓' : '✗'} {labels[tool] || tool}
    </span>
  )
}

export default function AIAgent() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesContainerRef = useRef(null)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    const el = messagesContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, loading])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          messages: newMessages.map(m => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : m.content,
          })),
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply,
        toolResults: data.toolResults || [],
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, something went wrong: ${err.message}`,
        toolResults: [],
      }])
    }
    setLoading(false)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const clearChat = () => setMessages([])

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-[#C8622A] text-white shadow-lg hover:bg-[#b5571f] transition-all duration-200 flex items-center justify-center"
        title="AI Agent"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-22 right-6 z-50 w-96 max-h-[600px] bg-fp-card border border-fp-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-fp-border">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#C8622A]" />
              <span className="text-fp-text text-sm font-semibold">ForgePt Agent</span>
              <span className="text-[10px] text-fp-muted bg-fp-inset px-1.5 py-0.5 rounded-full">AI</span>
            </div>
            {messages.length > 0 && (
              <button onClick={clearChat} className="text-fp-muted hover:text-fp-text text-xs transition-colors">Clear</button>
            )}
          </div>

          {/* Messages */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[300px]">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <p className="text-fp-muted text-sm">Ask me anything or give me a command.</p>
                <div className="mt-4 space-y-1.5">
                  {[
                    'Create a client named Acme Corp',
                    'Show me the pipeline summary',
                    'Create a service ticket — AC unit down, high priority',
                    'Create a task to follow up with John by Friday',
                  ].map(ex => (
                    <button key={ex} onClick={() => setInput(ex)}
                      className="block w-full text-left text-xs text-fp-muted hover:text-fp-text bg-fp-inset hover:bg-fp-hover px-3 py-2 rounded-lg transition-colors">
                      "{ex}"
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${msg.role === 'user'
                  ? 'bg-[#C8622A] text-white rounded-2xl rounded-tr-sm px-3 py-2 text-sm'
                  : 'space-y-1.5'
                }`}>
                  {msg.role === 'assistant' ? (
                    <>
                      {msg.toolResults?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {msg.toolResults.map((tr, j) => (
                            <ToolBadge key={j} tool={tr.tool} result={tr.result} />
                          ))}
                        </div>
                      )}
                      <div className="bg-fp-inset rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-fp-text whitespace-pre-wrap">
                        {msg.content}
                      </div>
                      {/* Action links for created records */}
                      {msg.toolResults?.filter(tr => ACTION_LINKS[tr.result?.action]).map((tr, j) => {
                        const link = ACTION_LINKS[tr.result.action]?.(tr.result)
                        return link ? (
                          <button key={j} onClick={() => { navigate(link.path); setOpen(false) }}
                            className="text-[#C8622A] text-xs font-semibold hover:underline block">
                            {link.label} →
                          </button>
                        ) : null
                      })}
                    </>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-fp-inset rounded-2xl rounded-tl-sm px-3 py-2">
                  <div className="flex gap-1 items-center h-4">
                    <span className="w-1.5 h-1.5 bg-fp-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-fp-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-fp-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-fp-border">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Create a client, ticket, task..."
                rows={1}
                className="flex-1 bg-fp-inset text-fp-text text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-[#C8622A]/40 placeholder-fp-muted"
                style={{ maxHeight: '100px', overflowY: 'auto' }}
              />
              <button onClick={send} disabled={!input.trim() || loading}
                className="bg-[#C8622A] text-white w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[#b5571f] transition-colors disabled:opacity-40 flex-shrink-0 self-end">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
            <p className="text-[10px] text-fp-muted mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      )}
    </>
  )
}
