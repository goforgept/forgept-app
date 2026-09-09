import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

const NOTIFICATION_TYPES = [
  { type: 'task_due',           label: 'Task due now',             icon: '✅' },
  { type: 'task_overdue',       label: 'Task overdue',             icon: '⏰' },
  { type: 'ticket_overdue',     label: 'Service ticket overdue',   icon: '🔧' },
  { type: 'invoice_overdue',    label: 'Invoice overdue',          icon: '⚠️' },
  { type: 'proposal_past_close',label: 'Proposal past close date', icon: '📋' },
  { type: 'email_opened',       label: 'Email opened',             icon: '✉️' },
  { type: 'proposal_sent',      label: 'Proposal sent',            icon: '📄' },
  { type: 'invoice_sent',       label: 'Invoice sent',             icon: '🧾' },
]

function loadMuted() {
  try { return JSON.parse(localStorage.getItem('notif_muted') || '{}') } catch { return {} }
}
function saveMuted(m) {
  try { localStorage.setItem('notif_muted', JSON.stringify(m)) } catch {}
}

export default function NotificationBell({ userId: userIdProp }) {
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [muted, setMuted] = useState(loadMuted)
  const [resolvedUserId, setResolvedUserId] = useState(userIdProp || null)
  const navigate = useNavigate()
  const panelRef = useRef(null)

  // Resolve userId — use prop if available, otherwise fetch from auth
  useEffect(() => {
    if (userIdProp) { setResolvedUserId(userIdProp); return }
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.id) setResolvedUserId(data.user.id)
    })
  }, [userIdProp])

  useEffect(() => {
    if (!resolvedUserId) return
    fetchNotifications()

    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${resolvedUserId}`
      }, (payload) => {
        setNotifications(prev => [payload.new, ...prev])
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [resolvedUserId])

  const fetchNotifications = async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', resolvedUserId)
      .order('created_at', { ascending: false })
      .limit(50)
    console.error('[Bell] userId:', resolvedUserId, 'rows:', data?.length, 'error:', error?.message)
    setNotifications(data || [])
  }

  const toggleMute = (type) => {
    setMuted(prev => {
      const next = { ...prev, [type]: !prev[type] }
      saveMuted(next)
      return next
    })
  }

  const visible = notifications.filter(n => !muted[n.type])
  const unreadCount = visible.filter(n => !n.read).length

  const markAllRead = async () => {
    await supabase.from('notifications').update({ read: true }).eq('user_id', resolvedUserId).eq('read', false)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const handleClick = async (notification) => {
    await supabase.from('notifications').update({ read: true }).eq('id', notification.id)
    setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, read: true } : n))
    setOpen(false)
    if (notification.link) navigate(notification.link)
  }

  const formatTime = (date) => {
    const diff = Math.floor((Date.now() - new Date(date)) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  const typeIcon = (type) => NOTIFICATION_TYPES.find(t => t.type === type)?.icon || '🔔'

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => { setOpen(v => !v); setShowSettings(false) }}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-fp-inset transition-colors"
      >
        <span className="text-fp-muted hover:text-fp-text text-lg transition-colors">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-fp-brand text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setShowSettings(false) }} />
          <div className="absolute left-0 top-11 w-80 bg-fp-card border border-fp-border rounded-xl shadow-2xl z-50 overflow-hidden">

            {/* Header */}
            <div className="flex justify-between items-center px-4 py-3 border-b border-fp-border">
              <div className="flex items-center gap-2">
                <h3 className="text-fp-text text-sm font-bold">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="bg-fp-brand text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-fp-muted hover:text-fp-text text-xs transition-colors">
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setShowSettings(v => !v)}
                  title="Notification preferences"
                  className={`text-sm px-1.5 py-0.5 rounded transition-colors ${showSettings ? 'text-fp-brand' : 'text-fp-muted hover:text-fp-text'}`}
                >
                  ⚙
                </button>
              </div>
            </div>

            {/* Settings panel */}
            {showSettings ? (
              <div className="px-4 py-3 space-y-2">
                <p className="text-fp-muted text-xs font-semibold uppercase tracking-wider mb-3">Mute notification types</p>
                {NOTIFICATION_TYPES.map(({ type, label, icon }) => (
                  <button key={type} onClick={() => toggleMute(type)}
                    className="w-full flex items-center justify-between py-1.5 text-left transition-colors hover:text-fp-text group">
                    <span className="flex items-center gap-2 text-sm text-fp-muted group-hover:text-fp-text">
                      <span>{icon}</span>
                      <span className={muted[type] ? 'line-through opacity-50' : ''}>{label}</span>
                    </span>
                    <span className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${muted[type] ? 'bg-fp-inset border border-fp-border' : 'bg-fp-brand'}`}>
                      <span className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${muted[type] ? '' : 'translate-x-4'}`} />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                {visible.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-fp-muted text-sm">No notifications.</p>
                  </div>
                ) : (
                  visible.map(n => (
                    <button key={n.id} onClick={() => handleClick(n)}
                      className={`w-full text-left px-4 py-3 border-b border-fp-border/50 hover:bg-fp-inset transition-colors flex gap-3 items-start ${!n.read ? 'bg-fp-inset/50' : ''}`}>
                      <span className="text-base shrink-0 mt-0.5">{typeIcon(n.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-tight ${!n.read ? 'text-fp-text font-medium' : 'text-fp-muted'}`}>
                          {n.title}
                        </p>
                        {n.body && <p className="text-fp-muted text-xs mt-0.5 line-clamp-2">{n.body}</p>}
                        <p className="text-fp-muted text-xs mt-1">{formatTime(n.created_at)}</p>
                      </div>
                      {!n.read && <div className="w-2 h-2 rounded-full bg-fp-brand shrink-0 mt-1.5" />}
                    </button>
                  ))
                )}
              </div>
            )}

            <div className="px-4 py-2 border-t border-fp-border">
              <button onClick={() => { navigate('/tasks'); setOpen(false) }}
                className="text-fp-brand hover:text-fp-text text-xs transition-colors">
                View all tasks →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
