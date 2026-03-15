import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function Settings({ isAdmin }) {
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    company_name: '',
    default_markup_percent: '35',
    followup_days: '30,14,7,0',
    terms_and_conditions: ''
  })
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [success, setSuccess] = useState(null)
  const [logoUrl, setLogoUrl] = useState(null)

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
    setLogoUrl(data?.logo_url || null)
    setForm({
      full_name: data?.full_name || '',
      email: data?.email || '',
      company_name: data?.company_name || '',
      default_markup_percent: data?.default_markup_percent || '35',
      followup_days: data?.followup_days || '30,14,7,0',
      terms_and_conditions: data?.terms_and_conditions || ''
    })
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingLogo(true)

    const { data: { user } } = await supabase.auth.getUser()
    const fileExt = file.name.split('.').pop()
    const fileName = `${user.id}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(fileName, file, { upsert: true })

    if (uploadError) {
      alert('Error uploading logo')
      setUploadingLogo(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('logos')
      .getPublicUrl(fileName)

    await supabase
      .from('profiles')
      .update({ logo_url: publicUrl })
      .eq('id', user.id)

    setLogoUrl(publicUrl)
    setUploadingLogo(false)
    setSuccess('Logo uploaded successfully')
  }

  const handleSave = async () => {
    setSaving(true)
    setSuccess(null)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase
      .from('profiles')
      .update({
        full_name: form.full_name,
        company_name: form.company_name,
        default_markup_percent: parseFloat(form.default_markup_percent) || 35,
        followup_days: form.followup_days,
        terms_and_conditions: form.terms_and_conditions
      })
      .eq('id', user.id)
    setSuccess('Settings saved successfully')
    setSaving(false)
  }

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} />

      <div className="flex-1 p-6 space-y-6 max-w-3xl">
        <h2 className="text-white text-2xl font-bold">Settings</h2>

        {success && <p className="text-green-400 text-sm">{success}</p>}

        {/* Profile */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">Profile</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Full Name</label>
              <input type="text" value={form.full_name}
                onChange={e => setForm(prev => ({ ...prev, full_name: e.target.value }))}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Email</label>
              <input type="text" value={form.email} disabled
                className="w-full bg-[#0F1C2E] text-[#8A9AB0] border border-[#2a3d55] rounded-lg px-3 py-2 text-sm cursor-not-allowed" />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Role</label>
              <input type="text" value={profile?.role || ''} disabled
                className="w-full bg-[#0F1C2E] text-[#8A9AB0] border border-[#2a3d55] rounded-lg px-3 py-2 text-sm cursor-not-allowed" />
            </div>
          </div>
        </div>

        {/* Proposal Branding */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">Proposal Branding</h3>
          <p className="text-[#8A9AB0] text-sm mb-4">This information will appear on all PDF proposals you generate.</p>
          <div className="space-y-4">
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Company Name</label>
              <input type="text" value={form.company_name}
                onChange={e => setForm(prev => ({ ...prev, company_name: e.target.value }))}
                placeholder="Your company name for proposals"
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Company Logo</label>
              {logoUrl && (
                <div className="mb-3">
                  <img src={logoUrl} alt="Company logo" className="h-16 object-contain bg-white rounded-lg p-2" />
                </div>
              )}
              <label className="cursor-pointer">
                <div className="bg-[#0F1C2E] border border-dashed border-[#2a3d55] rounded-lg px-4 py-3 text-sm text-[#8A9AB0] hover:border-[#C8622A] transition-colors inline-block">
                  {uploadingLogo ? 'Uploading...' : logoUrl ? '↑ Replace Logo' : '↑ Upload Logo'}
                </div>
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
              <p className="text-[#8A9AB0] text-xs mt-1">PNG or JPG recommended. Will appear at top of PDF proposals.</p>
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Default Markup %</label>
              <input type="number" value={form.default_markup_percent}
                onChange={e => setForm(prev => ({ ...prev, default_markup_percent: e.target.value }))}
                className="w-40 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            </div>
          </div>
        </div>

        {/* Follow-up Cadence */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">Follow-up Cadence</h3>
          <p className="text-[#8A9AB0] text-sm mb-4">Enter the days before close date to send follow-up emails. Separate with commas. Use 0 for the close date itself.</p>
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Days before close date</label>
            <input type="text" value={form.followup_days}
              onChange={e => setForm(prev => ({ ...prev, followup_days: e.target.value }))}
              placeholder="30,14,7,0"
              className="w-60 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            <p className="text-[#8A9AB0] text-xs mt-2">Example: 30,14,7,0 sends emails 30 days, 14 days, 7 days before close, and on close date</p>
          </div>
        </div>

        {/* Terms and Conditions */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">Terms and Conditions</h3>
          <p className="text-[#8A9AB0] text-sm mb-4">These terms will automatically appear at the bottom of every PDF proposal.</p>
          <textarea
            value={form.terms_and_conditions}
            onChange={e => setForm(prev => ({ ...prev, terms_and_conditions: e.target.value }))}
            placeholder="Enter your standard terms and conditions here..."
            rows={8}
            className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#C8622A] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}