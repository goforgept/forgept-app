import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function NotificationBell({ userId }) {
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!userId) return
    fetchNotifications()

    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        setNotifications(prev => [payload.new, ...prev])
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [userId])

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
    setNotifications(data || [])
  }

  const markAllRead = async () => {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const handleClick = async (notification) => {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notification.id)
    setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, read: true } : n))
    setOpen(false)
    if (notification.link) navigate(notification.link)
  }

  const unreadCount = notifications.filter(n => !n.read).length

  const formatTime = (date) => {
    const d = new Date(date)
    const now = new Date()
    const diff = Math.floor((now - d) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  const typeIcon = (type) => {
    if (type === 'task_due') return '✅'
    if (type === 'email_opened') return '✉️'
    if (type === 'proposal_sent') return '📄'
    return '🔔'
  }

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(!open); if (!open && unreadCount > 0) markAllRead() }}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#0F1C2E] transition-colors"
      >
        <span className="text-[#8A9AB0] hover:text-white text-lg transition-colors">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#C8622A] text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 w-80 bg-[#1a2d45] border border-[#2a3d55] rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 border-b border-[#2a3d55]">
              <h3 className="text-white text-sm font-bold">Notifications</h3>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[#8A9AB0] hover:text-white text-xs transition-colors">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-[#8A9AB0] text-sm">No notifications yet.</p>
                </div>
              ) : (
                notifications.map(n => (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`w-full text-left px-4 py-3 border-b border-[#2a3d55]/50 hover:bg-[#0F1C2E] transition-colors flex gap-3 items-start ${!n.read ? 'bg-[#0F1C2E]/50' : ''}`}
                  >
                    <span className="text-base shrink-0 mt-0.5">{typeIcon(n.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-tight ${!n.read ? 'text-white font-medium' : 'text-[#8A9AB0]'}`}>
                        {n.title}
                      </p>
                      {n.body && <p className="text-[#8A9AB0] text-xs mt-0.5 truncate">{n.body}</p>}
                      <p className="text-[#2a3d55] text-xs mt-1">{formatTime(n.created_at)}</p>
                    </div>
                    {!n.read && <div className="w-2 h-2 rounded-full bg-[#C8622A] shrink-0 mt-1.5" />}
                  </button>
                ))
              )}
            </div>
            <div className="px-4 py-2 border-t border-[#2a3d55]">
              <button onClick={() => { navigate('/tasks'); setOpen(false) }} className="text-[#C8622A] hover:text-white text-xs transition-colors">
                View all tasks →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
