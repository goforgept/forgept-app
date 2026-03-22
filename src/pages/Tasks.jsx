import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function Tasks({ isAdmin }) {
  const [tasks, setTasks] = useState([])
  const [profiles, setProfiles] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('pending')
  const [profile, setProfile] = useState(null)
  const navigate = useNavigate()
  const [form, setForm] = useState({
    title: '', due_date: '', priority: 'normal',
    assigned_to: '', client_id: '', notes: ''
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    setProfile(profileData)

    if (!profileData?.org_id) { setLoading(false); return }

    const [tasksRes, profilesRes, clientsRes] = await Promise.all([
      supabase.from('tasks').select('*, clients(company), profiles!tasks_assigned_to_fkey(full_name)').eq('org_id', profileData.org_id).order('due_date', { ascending: true }),
      supabase.from('profiles').select('id, full_name').eq('org_id', profileData.org_id),
      supabase.from('clients').select('id, company').eq('org_id', profileData.org_id).order('company')
    ])

    setTasks(tasksRes.data || [])
    setProfiles(profilesRes.data || [])
    setClients(clientsRes.data || [])
    setForm(prev => ({ ...prev, assigned_to: profileData.id }))
    setLoading(false)
  }

  const handleAdd = async () => {
    if (!form.title) return
    setSaving(true)

    await supabase.from('tasks').insert({
      org_id: profile.org_id,
      title: form.title,
      due_date: form.due_date || null,
      priority: form.priority,
      assigned_to: form.assigned_to || profile.id,
      created_by: profile.id,
      client_id: form.client_id || null,
      completed: false
    })

    setForm({ title: '', due_date: '', priority: 'normal', assigned_to: profile.id, client_id: '', notes: '' })
    setShowForm(false)
    fetchData()
    setSaving(false)
  }

  const toggleComplete = async (task) => {
    await supabase.from('tasks').update({
      completed: !task.completed,
      completed_at: !task.completed ? new Date().toISOString() : null
    }).eq('id', task.id)
    fetchData()
  }

  const isOverdue = (task) => {
    if (!task.due_date || task.completed) return false
    return new Date(task.due_date) < new Date()
  }

  const isDueToday = (task) => {
    if (!task.due_date || task.completed) return false
    const today = new Date().toISOString().split('T')[0]
    return task.due_date === today
  }

  const filtered = tasks.filter(t => {
    if (filter === 'pending') return !t.completed
    if (filter === 'completed') return t.completed
    if (filter === 'overdue') return isOverdue(t)
    if (filter === 'today') return isDueToday(t)
    return true
  })

  const pendingCount = tasks.filter(t => !t.completed).length
  const overdueCount = tasks.filter(t => isOverdue(t)).length
  const todayCount = tasks.filter(t => isDueToday(t)).length

  const priorityColor = (p) => {
    if (p === 'high') return 'text-red-400'
    if (p === 'low') return 'text-[#8A9AB0]'
    return 'text-[#C8622A]'
  }

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} />

      <div className="flex-1 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-white text-2xl font-bold">Tasks</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
          >
            {showForm ? 'Cancel' : '+ New Task'}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[#1a2d45] rounded-xl p-4">
            <p className="text-[#8A9AB0] text-xs mb-1">Pending</p>
            <p className="text-white text-2xl font-bold">{pendingCount}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-4">
            <p className="text-[#8A9AB0] text-xs mb-1">Due Today</p>
            <p className="text-[#C8622A] text-2xl font-bold">{todayCount}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-4">
            <p className="text-[#8A9AB0] text-xs mb-1">Overdue</p>
            <p className="text-red-400 text-2xl font-bold">{overdueCount}</p>
          </div>
        </div>

        {/* New Task Form */}
        {showForm && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold mb-4">New Task</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="col-span-2">
                <label className="text-[#8A9AB0] text-xs mb-1 block">Task Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Call John about panel upgrade quote"
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Due Date</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={e => setForm(prev => ({ ...prev, due_date: e.target.value }))}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Priority</label>
                <select
                  value={form.priority}
                  onChange={e => setForm(prev => ({ ...prev, priority: e.target.value }))}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Assign To</label>
                <select
                  value={form.assigned_to}
                  onChange={e => setForm(prev => ({ ...prev, assigned_to: e.target.value }))}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Link to Client (optional)</label>
                <select
                  value={form.client_id}
                  onChange={e => setForm(prev => ({ ...prev, client_id: e.target.value }))}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                >
                  <option value="">— No client —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.company}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={handleAdd}
              disabled={saving || !form.title}
              className="bg-[#C8622A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Create Task'}
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2">
          {[
            { key: 'pending', label: `Pending (${pendingCount})` },
            { key: 'today', label: `Today (${todayCount})` },
            { key: 'overdue', label: `Overdue (${overdueCount})` },
            { key: 'completed', label: 'Completed' },
            { key: 'all', label: 'All' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                filter === f.key ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Task List */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          {loading ? (
            <p className="text-[#8A9AB0]">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-[#8A9AB0]">No tasks here. Click + New Task to get started.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(task => (
                <div
                  key={task.id}
                  className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
                    task.completed
                      ? 'border-[#2a3d55]/30 bg-[#0F1C2E]/30 opacity-60'
                      : isOverdue(task)
                      ? 'border-red-500/20 bg-red-500/5'
                      : isDueToday(task)
                      ? 'border-[#C8622A]/20 bg-[#C8622A]/5'
                      : 'border-[#2a3d55]/50 bg-[#0F1C2E]/50'
                  }`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleComplete(task)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      task.completed
                        ? 'bg-green-500 border-green-500'
                        : 'border-[#2a3d55] hover:border-[#C8622A]'
                    }`}
                  >
                    {task.completed && <span className="text-white text-xs">✓</span>}
                  </button>

                  {/* Content */}
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${task.completed ? 'line-through text-[#8A9AB0]' : 'text-white'}`}>
                      {task.title}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {task.clients?.company && (
                        <button
                          onClick={() => navigate(`/client/${task.client_id}`)}
                          className="text-[#C8622A] text-xs hover:underline"
                        >
                          {task.clients.company}
                        </button>
                      )}
                      {task.profiles?.full_name && (
                        <span className="text-[#8A9AB0] text-xs">{task.profiles.full_name}</span>
                      )}
                    </div>
                  </div>

                  {/* Priority */}
                  <span className={`text-xs font-semibold capitalize ${priorityColor(task.priority)}`}>
                    {task.priority}
                  </span>

                  {/* Due date */}
                  {task.due_date && (
                    <span className={`text-xs font-semibold ${
                      isOverdue(task) ? 'text-red-400' :
                      isDueToday(task) ? 'text-[#C8622A]' :
                      'text-[#8A9AB0]'
                    }`}>
                      {isOverdue(task) ? 'Overdue' : isDueToday(task) ? 'Today' : task.due_date}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}