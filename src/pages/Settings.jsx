import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function Settings({ isAdmin }) {
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({ full_name: '', email: '' })
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    setProfile(data)
    setForm({ full_name: data?.full_name || '', email: data?.email || '' })
  }

  const handleSave = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase
      .from('profiles')
      .update({ full_name: form.full_name })
      .eq('id', user.id)
    setSuccess('Profile updated successfully')
    setSaving(false)
  }

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} />

      <div className="flex-1 p-6 space-y-6 max-w-2xl">
        <h2 className="text-white text-2xl font-bold">Settings</h2>

        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">Profile</h3>
          {success && <p className="text-green-400 text-sm mb-4">{success}</p>}
          <div className="space-y-4">
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Full Name</label>
              <input
                type="text"
                value={form.full_name}
                onChange={e => setForm(prev => ({ ...prev, full_name: e.target.value }))}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
              />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Email</label>
              <input
                type="text"
                value={form.email}
                disabled
                className="w-full bg-[#0F1C2E] text-[#8A9AB0] border border-[#2a3d55] rounded-lg px-3 py-2 text-sm cursor-not-allowed"
              />
              <p className="text-[#8A9AB0] text-xs mt-1">Email cannot be changed here</p>
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Role</label>
              <input
                type="text"
                value={profile?.role || ''}
                disabled
                className="w-full bg-[#0F1C2E] text-[#8A9AB0] border border-[#2a3d55] rounded-lg px-3 py-2 text-sm cursor-not-allowed"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#C8622A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-2">Change Password</h3>
          <p className="text-[#8A9AB0] text-sm mb-4">Use the forgot password flow on the login page to reset your password.</p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-[#8A9AB0] hover:text-white text-sm transition-colors"
          >
            Sign out and reset password →
          </button>
        </div>
      </div>
    </div>
  )
}