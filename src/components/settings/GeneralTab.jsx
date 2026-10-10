import { useState } from 'react'
import { supabase } from '../../supabase'

export default function GeneralTab({
  form, setForm, inputClass,
  orgTimezone, setOrgTimezone,
  passwordForm, setPasswordForm, passwordError, passwordSuccess, savingPassword, handleChangePassword,
  sameAsShipTo, handleSameAsShipTo, profile, saving, handleSave, readOnly = false,
  currentTheme = 'dark', applyTheme,
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return
    setDeletingAccount(true)
    try {
      await supabase.functions.invoke('delete-account')
    } catch (e) {}
    await supabase.auth.signOut()
  }

  return (
    <div className="space-y-6">
      {/* Appearance */}
      <div className="bg-fp-card rounded-xl p-6">
        <h3 className="text-fp-text font-bold mb-1">Appearance</h3>
        <p className="text-fp-muted text-sm mb-5">Choose how ForgePt looks for you. Light mode is rolling out gradually across the app.</p>
        <div className="flex gap-3">
          {[
            { value: 'dark',  label: 'Dark',  icon: '🌙', desc: 'Default dark theme' },
            { value: 'light', label: 'Light', icon: '☀️', desc: 'Light theme' },
          ].map(opt => (
            <button key={opt.value} onClick={() => applyTheme?.(opt.value)}
              className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                currentTheme === opt.value
                  ? 'border-fp-brand bg-fp-brand/10'
                  : 'border-fp-border hover:border-fp-brand/50'
              }`}>
              <span className="text-2xl">{opt.icon}</span>
              <span className="text-fp-text text-sm font-semibold">{opt.label}</span>
              <span className="text-fp-muted text-xs">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>
      {/* Profile */}
      <div className="bg-fp-card rounded-xl p-6">
        <h3 className="text-fp-text font-bold mb-4">Profile</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Full Name</label>
            <input type="text" value={form.full_name} onChange={e => setForm(prev => ({ ...prev, full_name: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Email</label>
            <input type="text" value={form.email} disabled className="w-full bg-fp-bg text-fp-muted border border-fp-border rounded-lg px-3 py-2 text-sm cursor-not-allowed" />
          </div>
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Job Title</label>
            <input type="text" value={form.job_title || ''} onChange={e => setForm(prev => ({ ...prev, job_title: e.target.value }))} placeholder="e.g. Solutions Consultant" className={inputClass} />
          </div>
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Phone</label>
            <input type="tel" value={form.phone || ''} onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))} placeholder="e.g. (555) 123-4567" className={inputClass} />
          </div>
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Role</label>
            <input type="text" value={profile?.role || ''} disabled className="w-full bg-fp-bg text-fp-muted border border-fp-border rounded-lg px-3 py-2 text-sm cursor-not-allowed" />
          </div>
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Timezone</label>
            <select value={orgTimezone} onChange={e => setOrgTimezone(e.target.value)} className={inputClass}>
              {['America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu'].map(tz => (
                <option key={tz} value={tz}>{tz.replace('America/', '').replace('Pacific/', '').replace(/_/g, ' ')}</option>
              ))}
            </select>
            <p className="text-fp-muted text-xs mt-1">Used for calendar event scheduling.</p>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-fp-card rounded-xl p-6">
        <h3 className="text-fp-text font-bold mb-4">Change Password</h3>
        {passwordError && <p className="text-red-400 text-sm mb-4">{passwordError}</p>}
        {passwordSuccess && <p className="text-green-400 text-sm mb-4">{passwordSuccess}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="col-span-2">
            <label className="text-fp-muted text-xs mb-1 block">Current Password</label>
            <input type="password" value={passwordForm.current} onChange={e => setPasswordForm(prev => ({ ...prev, current: e.target.value }))} placeholder="••••••••" className={inputClass} />
          </div>
          <div>
            <label className="text-fp-muted text-xs mb-1 block">New Password</label>
            <input type="password" value={passwordForm.newPass} onChange={e => setPasswordForm(prev => ({ ...prev, newPass: e.target.value }))} placeholder="••••••••" className={inputClass} />
          </div>
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Confirm New Password</label>
            <input type="password" value={passwordForm.confirm} onChange={e => setPasswordForm(prev => ({ ...prev, confirm: e.target.value }))} placeholder="••••••••" className={inputClass} />
          </div>
        </div>
        <button onClick={handleChangePassword} disabled={savingPassword || !passwordForm.current || !passwordForm.newPass || !passwordForm.confirm}
          className="bg-fp-brand text-white px-6 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-colors disabled:opacity-50">
          {savingPassword ? 'Updating...' : 'Update Password'}
        </button>
      </div>

      {/* Bill To / Ship To */}
      <div className="bg-fp-card rounded-xl p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-fp-text font-bold">Bill To / Ship To</h3>
          {readOnly && <span className="text-fp-muted text-xs">Admin only</span>}
        </div>
        <p className="text-fp-muted text-sm mb-5">Your company's addresses printed on every purchase order.</p>
        <div className="space-y-5">
          <div>
            <h4 className="text-fp-text text-sm font-semibold mb-3">Ship To</h4>
            <div className="space-y-3">
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Street Address</label>
                <input type="text" value={form.ship_to_address} onChange={e => setForm(prev => ({ ...prev, ship_to_address: e.target.value }))} placeholder="123 Main St" disabled={readOnly} className={`${inputClass} ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="text-fp-muted text-xs mb-1 block">City</label><input type="text" value={form.ship_to_city} onChange={e => setForm(prev => ({ ...prev, ship_to_city: e.target.value }))} placeholder="Nashville" disabled={readOnly} className={`${inputClass} ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`} /></div>
                <div><label className="text-fp-muted text-xs mb-1 block">State</label><input type="text" value={form.ship_to_state} onChange={e => setForm(prev => ({ ...prev, ship_to_state: e.target.value }))} placeholder="TN" disabled={readOnly} className={`${inputClass} ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`} /></div>
                <div><label className="text-fp-muted text-xs mb-1 block">ZIP</label><input type="text" value={form.ship_to_zip} onChange={e => setForm(prev => ({ ...prev, ship_to_zip: e.target.value }))} placeholder="37201" disabled={readOnly} className={`${inputClass} ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`} /></div>
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-fp-text text-sm font-semibold">Bill To</h4>
              <label className={`flex items-center gap-2 ${readOnly ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                <input type="checkbox" checked={sameAsShipTo} onChange={e => !readOnly && handleSameAsShipTo(e.target.checked)} disabled={readOnly} className="accent-fp-brand" />
                <span className="text-fp-muted text-xs">Same as Ship To</span>
              </label>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Street Address</label>
                <input type="text" value={form.bill_to_address} onChange={e => setForm(prev => ({ ...prev, bill_to_address: e.target.value }))} placeholder="123 Main St" disabled={sameAsShipTo || readOnly} className={`${inputClass} ${(sameAsShipTo || readOnly) ? 'opacity-50 cursor-not-allowed' : ''}`} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="text-fp-muted text-xs mb-1 block">City</label><input type="text" value={form.bill_to_city} onChange={e => setForm(prev => ({ ...prev, bill_to_city: e.target.value }))} placeholder="Nashville" disabled={sameAsShipTo || readOnly} className={`${inputClass} ${(sameAsShipTo || readOnly) ? 'opacity-50 cursor-not-allowed' : ''}`} /></div>
                <div><label className="text-fp-muted text-xs mb-1 block">State</label><input type="text" value={form.bill_to_state} onChange={e => setForm(prev => ({ ...prev, bill_to_state: e.target.value }))} placeholder="TN" disabled={sameAsShipTo || readOnly} className={`${inputClass} ${(sameAsShipTo || readOnly) ? 'opacity-50 cursor-not-allowed' : ''}`} /></div>
                <div><label className="text-fp-muted text-xs mb-1 block">ZIP</label><input type="text" value={form.bill_to_zip} onChange={e => setForm(prev => ({ ...prev, bill_to_zip: e.target.value }))} placeholder="37201" disabled={sameAsShipTo || readOnly} className={`${inputClass} ${(sameAsShipTo || readOnly) ? 'opacity-50 cursor-not-allowed' : ''}`} /></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="bg-fp-brand text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-colors disabled:opacity-50">
        {saving ? 'Saving...' : 'Save Settings'}
      </button>

      {/* Account actions */}
      <div className="bg-fp-card rounded-xl p-6">
        <h3 className="text-fp-text font-bold mb-4">Account</h3>
        <div className="space-y-3">
          <button onClick={handleSignOut} className="w-full text-left px-4 py-3 rounded-lg border border-fp-border text-fp-text hover:bg-fp-inset transition-colors text-sm font-medium">
            Sign Out
          </button>
          {!showDeleteConfirm ? (
            <button onClick={() => setShowDeleteConfirm(true)} className="w-full text-left px-4 py-3 rounded-lg border border-red-900/40 text-red-400 hover:bg-red-900/10 transition-colors text-sm font-medium">
              Delete Account
            </button>
          ) : (
            <div className="border border-red-900/40 rounded-lg p-4 space-y-3">
              <p className="text-red-400 text-sm font-semibold">This will permanently delete your account and cannot be undone.</p>
              <p className="text-fp-muted text-xs">Type <span className="text-fp-text font-mono font-bold">DELETE</span> to confirm.</p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE"
                className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400"
              />
              <div className="flex gap-2">
                <button onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText('') }} className="flex-1 px-4 py-2 rounded-lg border border-fp-border text-fp-muted hover:text-fp-text text-sm transition-colors">
                  Cancel
                </button>
                <button onClick={handleDeleteAccount} disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-40">
                  {deletingAccount ? 'Deleting...' : 'Delete My Account'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
