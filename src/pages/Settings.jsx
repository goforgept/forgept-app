import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function Settings({ isAdmin, featureProposals = true, featureCRM = false }) {
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    company_name: '',
    default_markup_percent: '35',
    followup_days: '30,14,7,0',
    terms_and_conditions: '',
    primary_color: '#0F1C2E',
    bill_to_address: '',
    bill_to_city: '',
    bill_to_state: '',
    bill_to_zip: '',
    ship_to_address: '',
    ship_to_city: '',
    ship_to_state: '',
    ship_to_zip: '',
  })
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [success, setSuccess] = useState(null)
  const [logoUrl, setLogoUrl] = useState(null)
  const [passwordForm, setPasswordForm] = useState({ current: '', newPass: '', confirm: '' })
  const [passwordError, setPasswordError] = useState(null)
  const [passwordSuccess, setPasswordSuccess] = useState(null)
  const [savingPassword, setSavingPassword] = useState(false)
  const [sameAsShipTo, setSameAsShipTo] = useState(false)

  useEffect(() => { fetchProfile() }, [])

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
      terms_and_conditions: data?.terms_and_conditions || '',
      primary_color: data?.primary_color || '#0F1C2E',
      bill_to_address: data?.bill_to_address || '',
      bill_to_city: data?.bill_to_city || '',
      bill_to_state: data?.bill_to_state || '',
      bill_to_zip: data?.bill_to_zip || '',
      ship_to_address: data?.ship_to_address || '',
      ship_to_city: data?.ship_to_city || '',
      ship_to_state: data?.ship_to_state || '',
      ship_to_zip: data?.ship_to_zip || '',
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
      .from('Logos')
      .upload(fileName, file, { upsert: true })

    if (uploadError) {
      alert('Error uploading logo: ' + uploadError.message)
      setUploadingLogo(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('Logos')
      .getPublicUrl(fileName)

    await supabase.from('profiles').update({ logo_url: publicUrl }).eq('id', user.id)
    setLogoUrl(publicUrl)
    setUploadingLogo(false)
    setSuccess('Logo uploaded successfully')
  }

  const handleSameAsShipTo = (checked) => {
    setSameAsShipTo(checked)
    if (checked) {
      setForm(prev => ({
        ...prev,
        bill_to_address: prev.ship_to_address,
        bill_to_city: prev.ship_to_city,
        bill_to_state: prev.ship_to_state,
        bill_to_zip: prev.ship_to_zip,
      }))
    }
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
        terms_and_conditions: form.terms_and_conditions,
        primary_color: form.primary_color,
        bill_to_address: form.bill_to_address,
        bill_to_city: form.bill_to_city,
        bill_to_state: form.bill_to_state,
        bill_to_zip: form.bill_to_zip,
        ship_to_address: form.ship_to_address,
        ship_to_city: form.ship_to_city,
        ship_to_state: form.ship_to_state,
        ship_to_zip: form.ship_to_zip,
      })
      .eq('id', user.id)
    setSuccess('Settings saved successfully')
    setSaving(false)
  }

  const handleChangePassword = async () => {
    setPasswordError(null)
    setPasswordSuccess(null)
    if (!passwordForm.newPass || !passwordForm.confirm) { setPasswordError('Please fill in all fields'); return }
    if (passwordForm.newPass !== passwordForm.confirm) { setPasswordError('New passwords do not match'); return }
    if (passwordForm.newPass.length < 8) { setPasswordError('Password must be at least 8 characters'); return }
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: passwordForm.newPass })
    if (error) { setPasswordError(error.message); setSavingPassword(false); return }
    setPasswordSuccess('Password updated successfully')
    setPasswordForm({ current: '', newPass: '', confirm: '' })
    setSavingPassword(false)
  }

  const inputClass = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

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
                className={inputClass} />
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

        {/* Change Password */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">Change Password</h3>
          {passwordError && <p className="text-red-400 text-sm mb-4">{passwordError}</p>}
          {passwordSuccess && <p className="text-green-400 text-sm mb-4">{passwordSuccess}</p>}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">New Password</label>
              <input type="password" value={passwordForm.newPass}
                onChange={e => setPasswordForm(prev => ({ ...prev, newPass: e.target.value }))}
                placeholder="••••••••" className={inputClass} />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Confirm New Password</label>
              <input type="password" value={passwordForm.confirm}
                onChange={e => setPasswordForm(prev => ({ ...prev, confirm: e.target.value }))}
                placeholder="••••••••" className={inputClass} />
            </div>
          </div>
          <button onClick={handleChangePassword}
            disabled={savingPassword || !passwordForm.newPass || !passwordForm.confirm}
            className="bg-[#C8622A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
            {savingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </div>

        {/* Proposal Branding */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-1">Proposal Branding</h3>
          <p className="text-[#8A9AB0] text-sm mb-4">Appears on all PDF proposals and purchase orders.</p>
          <div className="space-y-4">
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Company Name</label>
              <input type="text" value={form.company_name}
                onChange={e => setForm(prev => ({ ...prev, company_name: e.target.value }))}
                placeholder="Your company name" className={inputClass} />
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
              <p className="text-[#8A9AB0] text-xs mt-1">PNG or JPG recommended.</p>
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Default Markup %</label>
              <input type="number" value={form.default_markup_percent}
                onChange={e => setForm(prev => ({ ...prev, default_markup_percent: e.target.value }))}
                className="w-40 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Brand Color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={form.primary_color}
                  onChange={e => setForm(prev => ({ ...prev, primary_color: e.target.value }))}
                  className="w-12 h-10 rounded cursor-pointer border border-[#2a3d55] bg-transparent" />
                <input type="text" value={form.primary_color}
                  onChange={e => setForm(prev => ({ ...prev, primary_color: e.target.value }))}
                  className="w-32 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
              </div>
              <p className="text-[#8A9AB0] text-xs mt-1">Used in PDF proposals and purchase orders.</p>
            </div>
          </div>
        </div>

        {/* Bill To / Ship To */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-1">Bill To / Ship To</h3>
          <p className="text-[#8A9AB0] text-sm mb-5">Your company's addresses printed on every purchase order.</p>

          <div className="space-y-5">
            {/* Ship To */}
            <div>
              <h4 className="text-white text-sm font-semibold mb-3">Ship To</h4>
              <div className="space-y-3">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Street Address</label>
                  <input type="text" value={form.ship_to_address}
                    onChange={e => setForm(prev => ({ ...prev, ship_to_address: e.target.value }))}
                    placeholder="123 Main St" className={inputClass} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[#8A9AB0] text-xs mb-1 block">City</label>
                    <input type="text" value={form.ship_to_city}
                      onChange={e => setForm(prev => ({ ...prev, ship_to_city: e.target.value }))}
                      placeholder="Nashville" className={inputClass} />
                  </div>
                  <div>
                    <label className="text-[#8A9AB0] text-xs mb-1 block">State</label>
                    <input type="text" value={form.ship_to_state}
                      onChange={e => setForm(prev => ({ ...prev, ship_to_state: e.target.value }))}
                      placeholder="TN" className={inputClass} />
                  </div>
                  <div>
                    <label className="text-[#8A9AB0] text-xs mb-1 block">ZIP</label>
                    <input type="text" value={form.ship_to_zip}
                      onChange={e => setForm(prev => ({ ...prev, ship_to_zip: e.target.value }))}
                      placeholder="37201" className={inputClass} />
                  </div>
                </div>
              </div>
            </div>

            {/* Bill To */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-white text-sm font-semibold">Bill To</h4>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sameAsShipTo}
                    onChange={e => handleSameAsShipTo(e.target.checked)}
                    className="accent-[#C8622A]"
                  />
                  <span className="text-[#8A9AB0] text-xs">Same as Ship To</span>
                </label>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Street Address</label>
                  <input type="text" value={form.bill_to_address}
                    onChange={e => setForm(prev => ({ ...prev, bill_to_address: e.target.value }))}
                    placeholder="123 Main St"
                    disabled={sameAsShipTo}
                    className={`${inputClass} ${sameAsShipTo ? 'opacity-50 cursor-not-allowed' : ''}`} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[#8A9AB0] text-xs mb-1 block">City</label>
                    <input type="text" value={form.bill_to_city}
                      onChange={e => setForm(prev => ({ ...prev, bill_to_city: e.target.value }))}
                      placeholder="Nashville"
                      disabled={sameAsShipTo}
                      className={`${inputClass} ${sameAsShipTo ? 'opacity-50 cursor-not-allowed' : ''}`} />
                  </div>
                  <div>
                    <label className="text-[#8A9AB0] text-xs mb-1 block">State</label>
                    <input type="text" value={form.bill_to_state}
                      onChange={e => setForm(prev => ({ ...prev, bill_to_state: e.target.value }))}
                      placeholder="TN"
                      disabled={sameAsShipTo}
                      className={`${inputClass} ${sameAsShipTo ? 'opacity-50 cursor-not-allowed' : ''}`} />
                  </div>
                  <div>
                    <label className="text-[#8A9AB0] text-xs mb-1 block">ZIP</label>
                    <input type="text" value={form.bill_to_zip}
                      onChange={e => setForm(prev => ({ ...prev, bill_to_zip: e.target.value }))}
                      placeholder="37201"
                      disabled={sameAsShipTo}
                      className={`${inputClass} ${sameAsShipTo ? 'opacity-50 cursor-not-allowed' : ''}`} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Follow-up Cadence */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-1">Follow-up Cadence</h3>
          <p className="text-[#8A9AB0] text-sm mb-4">Days before close date to send follow-up emails. Separate with commas.</p>
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Days before close date</label>
            <input type="text" value={form.followup_days}
              onChange={e => setForm(prev => ({ ...prev, followup_days: e.target.value }))}
              placeholder="30,14,7,0"
              className="w-60 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            <p className="text-[#8A9AB0] text-xs mt-2">Example: 30,14,7,0 sends emails 30, 14, 7 days before close and on close date.</p>
          </div>
        </div>

        {/* Terms and Conditions */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-1">Terms and Conditions</h3>
          <p className="text-[#8A9AB0] text-sm mb-4">Appears at the bottom of every PDF proposal.</p>
          <textarea
            value={form.terms_and_conditions}
            onChange={e => setForm(prev => ({ ...prev, terms_and_conditions: e.target.value }))}
            placeholder="Enter your standard terms and conditions here..."
            rows={8}
            className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none"
          />
        </div>

        <button onClick={handleSave} disabled={saving}
          className="bg-[#C8622A] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}