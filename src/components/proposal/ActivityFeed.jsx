import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'

export default function ActivityFeed({ proposalId, clientId, orgId, refreshKey }) {
  const [activity, setActivity] = useState([])
  const [newActivityNote, setNewActivityNote] = useState('')
  const [savingActivity, setSavingActivity] = useState(false)

  const fetchActivity = async () => {
    const { data } = await supabase
      .from('activities')
      .select('*, profiles(full_name)')
      .eq('proposal_id', proposalId)
      .order('created_at', { ascending: false })
    setActivity(data || [])
  }

  useEffect(() => { fetchActivity() }, [proposalId, refreshKey])

  const addManualActivity = async () => {
    const title = typeof newActivityNote === 'string' ? newActivityNote.trim() : newActivityNote?.title?.trim()
    const type = typeof newActivityNote === 'string' ? 'note' : (newActivityNote?.type || 'note')
    if (!title) return
    setSavingActivity(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('activities').insert({ proposal_id: proposalId, client_id: clientId || null, org_id: orgId, user_id: user.id, type, title })
    setNewActivityNote('')
    await fetchActivity()
    setSavingActivity(false)
  }

  return (
    <div className="bg-[#1a2d45] rounded-xl p-6">
      <h3 className="text-white font-bold text-lg mb-4">Activity</h3>
      <div className="bg-[#0F1C2E] rounded-xl p-4 mb-5 space-y-3">
        <div className="flex gap-2">
          {[{value:'note',label:'Note',icon:'📝'},{value:'call',label:'Call',icon:'📞'},{value:'email',label:'Email',icon:'✉️'},{value:'meeting',label:'Meeting',icon:'🤝'}].map(t => (
            <button key={t.value} onClick={() => setNewActivityNote(prev => ({ ...prev, type: t.value }))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${(newActivityNote?.type || 'note') === t.value ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="text"
            value={typeof newActivityNote === 'string' ? newActivityNote : (newActivityNote?.title || '')}
            onChange={e => setNewActivityNote(prev => typeof prev === 'string' ? { type: 'note', title: e.target.value } : { ...prev, title: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && addManualActivity()}
            placeholder="Log a note, call, follow-up..."
            className="flex-1 bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]" />
          <button onClick={addManualActivity} disabled={savingActivity || !(typeof newActivityNote === 'string' ? newActivityNote.trim() : newActivityNote?.title?.trim())}
            className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">Log</button>
        </div>
      </div>
      {activity.length === 0 ? (
        <p className="text-[#8A9AB0] text-sm">No activity yet. Changes and notes will appear here.</p>
      ) : (
        <div className="space-y-0">
          {activity.map((item, i) => {
            const icons = { call: '📞', email: '✉️', meeting: '🤝', note: '📝' }
            const icon = icons[item.type] || '📝'
            return (
              <div key={item.id} className="flex gap-3 relative">
                {i < activity.length - 1 && <div className="absolute left-4 top-8 bottom-0 w-px bg-[#2a3d55]" />}
                <div className="w-8 h-8 rounded-full bg-[#0F1C2E] border border-[#2a3d55] flex items-center justify-center text-sm shrink-0 z-10">{icon}</div>
                <div className="flex-1 pb-4">
                  <div className="flex justify-between items-start">
                    <p className="text-white text-sm font-medium">{item.title}</p>
                    <span className="text-[#8A9AB0] text-xs shrink-0 ml-2">{new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {item.body && <p className="text-[#8A9AB0] text-xs mt-1 leading-relaxed">{item.body}</p>}
                  <p className="text-[#2a3d55] text-xs mt-0.5">{item.profiles?.full_name || 'System'}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
