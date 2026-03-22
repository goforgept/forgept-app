import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function TaskList({ clientId, proposalId, orgId, userId, profiles = [] }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', due_date: '', priority: 'normal', assigned_to: userId || '' })
  const navigate = useNavigate()

  useEffect(() => {
    fetchTasks()
  }, [clientId, proposalId])

  useEffect(() => {
    setForm(prev => ({ ...prev, assigned_to: userId || '' }))
  }, [userId])

  const fetchTasks = async () => {
    let query = supabase
      .from('tasks')
      .select('*, profiles!tasks_assigned_to_fkey(full_name)')
      .order('due_date', { ascending: true })

    if (proposalId) query = query.eq('proposal_id', proposalId)
    else if (clientId) query = query.eq('client_id', clientId)

    const { data } = await query
    setTasks(data || [])
    setLoading(false)
  }

  const handleAdd = async () => {
    if (!form.title) return
    setSaving(true)

    await supabase.from('tasks').insert({
      org_id: orgId,
      title: form.title,
      due_date: form.due_date || null,
      priority: form.priority,
      assigned_to: form.assigned_to || userId,
      created_by: userId,
      client_id: clientId || null,
      proposal_id: proposalId || null,
      completed: false
    })

    setForm({ title: '', due_date: '', priority: 'normal', assigned_to: userId || '' })
    setShowForm(false)
    fetchTasks()
    setSaving(false)
  }

  const toggleComplete = async (task) => {
    await supabase.from('tasks').update({
      completed: !task.completed,
      completed_at: !task.completed ? new Date().toISOString() : null
    }).eq('id', task.id)
    fetchTasks()
  }

  const isOverdue = (task) => {
    if (!task.due_date || task.completed) return false
    return new Date(task.due_date) < new Date()
  }

  const isDueToday = (task) => {
    if (!task.due_date || task.completed) return false
    return task.due_date === new Date().toISOString().split('T')[0]
  }

  const priorityColor = (p) => {
    if (p === 'high') return 'text-red-400'
    if (p === 'low') return 'text-[#8A9AB0]'
    return 'text-[#C8622A]'
  }

  const pending = tasks.filter(t => !t.completed)
  const completed = tasks.filter(t => t.completed)

  return (
    <div className="bg-[#1a2d45] rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-white font-bold text-lg">Tasks</h3>
          {pending.length > 0 && (
            <span className="bg-[#C8622A]/20 text-[#C8622A] text-xs px-2 py-0.5 rounded-full font-semibold">
              {pending.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#C8622A] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#b5571f] transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Task'}
        </button>
      </div>

      {showForm && (
        <div className="bg-[#0F1C2E] rounded-xl p-4 mb-4 space-y-3">
          <input
            type="text"
            placeholder="Task title — e.g. Follow up on pricing"
            value={form.title}
            onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
            className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
          />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Due Date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => setForm(prev => ({ ...prev, due_date: e.target.value }))}
                className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]"
              />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Priority</label>
              <select
                value={form.priority}
                onChange={e => setForm(prev => ({ ...prev, priority: e.target.value }))}
                className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
            {profiles.length > 0 && (
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Assign To</label>
                <select
                  value={form.assigned_to}
                  onChange={e => setForm(prev => ({ ...prev, assigned_to: e.target.value }))}
                  className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]"
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <button
            onClick={handleAdd}
            disabled={saving || !form.title}
            className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Create Task'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-[#8A9AB0] text-sm">Loading...</p>
      ) : tasks.length === 0 ? (
        <p className="text-[#8A9AB0] text-sm">No tasks yet. Click + Add Task to create one.</p>
      ) : (
        <div className="space-y-2">
          {[...pending, ...completed].map(task => (
            <div
              key={task.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                task.completed
                  ? 'border-[#2a3d55]/30 bg-[#0F1C2E]/30 opacity-50'
                  : isOverdue(task)
                  ? 'border-red-500/20 bg-red-500/5'
                  : isDueToday(task)
                  ? 'border-[#C8622A]/20 bg-[#C8622A]/5'
                  : 'border-[#2a3d55]/50 bg-[#0F1C2E]/30'
              }`}
            >
              <button
                onClick={() => toggleComplete(task)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  task.completed ? 'bg-green-500 border-green-500' : 'border-[#2a3d55] hover:border-[#C8622A]'
                }`}
              >
                {task.completed && <span className="text-white text-xs">✓</span>}
              </button>
              <div className="flex-1">
                <p className={`text-sm font-medium ${task.completed ? 'line-through text-[#8A9AB0]' : 'text-white'}`}>
                  {task.title}
                </p>
                {task.profiles?.full_name && (
                  <p className="text-[#8A9AB0] text-xs mt-0.5">{task.profiles.full_name}</p>
                )}
              </div>
              <span className={`text-xs font-semibold capitalize ${priorityColor(task.priority)}`}>
                {task.priority}
              </span>
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
  )
}