import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function ManageReps() {
  const [reps, setReps] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', full_name: '' })
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    fetchReps()
  }, [])

  const fetchReps = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    setReps(data || [])
    setLoading(false)
  }

  const handleAddRep = async () => {
    setAdding(true)
    setError(null)
    setSuccess(null)

    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    })

    if (error) { setError(error.message); setAdding(false); return }

    await supabase.from('profiles').insert({
      id: data.user.id,
      email: form.email,
      full_name: form.full_name,
      role: 'rep'
    })

    setSuccess(`Rep account created for ${form.email}`)
    setForm({ email: '', password: '', full_name: '' })
    fetchReps()
    setAdding(false)
  }

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={true} />

      <div className="flex-1 p-6 space-y-6">
        <h2 className="text-white text-2xl font-bold">Manage Reps</h2>

        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">Add New Rep</h3>
          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          {success && <p className="text-green-400 text-sm mb-4">{success}</p>}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Full Name</label>
              <input
                type="text"
                value={form.full_name}
                onChange={e => setForm(prev => ({ ...prev, full_name: e.target.value }))}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                placeholder="John Smith"
              />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                placeholder="rep@company.com"
              />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Temporary Password</label>
              <input
                type="text"
                value={form.password}
                onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                placeholder="TempPass123!"
              />
            </div>
          </div>
          <button
            onClick={handleAddRep}
            disabled={adding || !form.email || !form.password || !form.full_name}
            className="bg-[#C8622A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
          >
            {adding ? 'Creating...' : 'Create Rep Account'}
          </button>
        </div>

        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">All Users ({reps.length})</h3>
          {loading ? (
            <p className="text-[#8A9AB0]">Loading...</p>
          ) : reps.length === 0 ? (
            <p className="text-[#8A9AB0]">No users yet.</p>
          ) : (
            <div className="space-y-3">
              {reps.map(rep => (
                <div key={rep.id} className="flex justify-between items-center border-b border-[#2a3d55] py-3">
                  <div>
                    <p className="text-white font-medium">{rep.full_name || '—'}</p>
                    <p className="text-[#8A9AB0] text-sm">{rep.email}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    rep.role === 'admin'
                      ? 'bg-[#C8622A]/20 text-[#C8622A]'
                      : 'bg-[#8A9AB0]/20 text-[#8A9AB0]'
                  }`}>
                    {rep.role}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}