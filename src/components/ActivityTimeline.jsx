import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const ACTIVITY_TYPES = [
  { value: 'call', label: 'Call', icon: '📞' },
  { value: 'email', label: 'Email', icon: '✉️' },
  { value: 'meeting', label: 'Meeting', icon: '🤝' },
  { value: 'note', label: 'Note', icon: '📝' },
]

export default function ActivityTimeline({ clientId, proposalId, orgId, userId }) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ type: 'note', title: '', body: '' })

  useEffect(() => {
    fetchActivities()
  }, [clientId, proposalId])

  const fetchActivities = async () => {
    let query = supabase
      .from('activities')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: false })
    if (clientId) query = query.eq('client_id', clientId)
    if (proposalId) query = query.eq('proposal_id', proposalId)
    const { data } = await query
    setActivities(data || [])
    setLoading(false)
  }

  const handleAdd = async () => {
    if (!form.title) return
    setSaving(true)
    await supabase.from('activities').insert({
      org_id: orgId,
      client_id: clientId || null,
      proposal_id: proposalId || null,
      user_id: userId,
      type: form.type,
      title: form.title,
      body: form.body
    })
    setForm({ type: 'note', title: '', body: '' })
    setShowForm(false)
    fetchActivities()
    setSaving(false)
  }

  const formatDate = (date) => {
    const d = new Date(date)
    const now = new Date()
    const diff = Math.floor((now - d) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
    return d.toLocaleDateString()
  }

  const getIcon = (type) => ACTIVITY_TYPES.find(t => t.value === type)?.icon || '📝'

  return (
    <div className="bg-[#1a2d45] rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-white font-bold text-lg">Activity</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#C8622A] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#b5571f] transition-colors"
        >
          {showForm ? 'Cancel' : '+ Log Activity'}
        </button>
      </div>

      {showForm && (
        <div className="bg-[#0F1C2E] rounded-xl p-4 mb-4 space-y-3">
          <div className="flex gap-2">
            {ACTIVITY_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setForm(prev => ({ ...prev, type: t.value }))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  form.type === t.value ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Title — e.g. Called John about pricing"
            value={form.title}
            onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
            className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
          />
          <textarea
            placeholder="Notes (optional)"
            value={form.body}
            onChange={e => setForm(prev => ({ ...prev, body: e.target.value }))}
            rows={2}
            className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none"
          />
          <button
            onClick={handleAdd}
            disabled={saving || !form.title}
            className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Log Activity'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-[#8A9AB0] text-sm">Loading...</p>
      ) : activities.length === 0 ? (
        <p className="text-[#8A9AB0] text-sm">No activity yet. Log a call, email, or note above.</p>
      ) : (
        <div className="space-y-0">
          {activities.map((activity, i) => (
            <div key={activity.id} className="flex gap-3 relative">
              {i < activities.length - 1 && (
                <div className="absolute left-4 top-8 bottom-0 w-px bg-[#2a3d55]" />
              )}
              <div className="w-8 h-8 rounded-full bg-[#0F1C2E] border border-[#2a3d55] flex items-center justify-center text-sm shrink-0 z-10">
                {getIcon(activity.type)}
              </div>
              <div className="flex-1 pb-4">
                <div className="flex justify-between items-start">
                  <p className="text-white text-sm font-medium">{activity.title}</p>
                  <span className="text-[#8A9AB0] text-xs shrink-0 ml-2">{formatDate(activity.created_at)}</span>
                </div>
                {activity.body && (
                  <p className="text-[#8A9AB0] text-xs mt-1 leading-relaxed">{activity.body}</p>
                )}
                <p className="text-[#2a3d55] text-xs mt-0.5">{activity.profiles?.full_name}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
