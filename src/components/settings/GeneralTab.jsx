export default function GeneralTab({
  form, setForm, inputClass,
  orgTimezone, setOrgTimezone,
  passwordForm, setPasswordForm, passwordError, passwordSuccess, savingPassword, handleChangePassword,
  supportPin, pinInput, setPinInput, savingPin, pinSaved, savePin, regeneratePin,
  sameAsShipTo, handleSameAsShipTo, profile, saving, handleSave,
  currentTheme = 'dark', applyTheme,
}) {
  return (
    <div className="space-y-6">
      {/* Appearance */}
      <div className="bg-fp-card rounded-xl p-6">
        <h3 className="text-fp-text font-bold mb-1">Appearance</h3>
        <p className="text-fp-muted text-sm mb-5">Choose how ForgePt looks for you. Light mode is rolling out gradually across the app.</p>
        <div className="flex gap-3">
          {[
            { value: 'dark',  label: 'Dark',  icon: '🌙', desc: 'Default dark theme' },
            { value: 'light', label: 'Light', icon: '☀️', desc: 'Light theme (beta)' },
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
        <div className="grid grid-cols-2 gap-4">
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
        <div className="grid grid-cols-2 gap-4 mb-4">
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

      {/* Support PIN */}
      <div className="bg-fp-card rounded-xl p-6">
        <h3 className="text-fp-text font-bold mb-1">Support PIN</h3>
        <p className="text-fp-muted text-sm mb-5">Share this 6-digit PIN with ForgePt support when you need help.</p>
        <div className="flex items-center gap-3 mb-4">
          {supportPin.split('').map((digit, i) => (
            <div key={i} className="w-10 h-12 bg-fp-bg border border-fp-border rounded-lg flex items-center justify-center text-fp-text text-2xl font-mono font-bold select-all">
              {digit}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <input type="text" inputMode="numeric" maxLength={6} value={pinInput}
            onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-32 bg-fp-bg text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:border-fp-brand"
            placeholder="000000" />
          <button onClick={savePin} disabled={savingPin || pinInput.length !== 6 || pinInput === supportPin}
            className="bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-colors disabled:opacity-40">
            {savingPin ? 'Saving...' : 'Save PIN'}
          </button>
          <button onClick={regeneratePin} disabled={savingPin} className="text-fp-muted hover:text-fp-text text-sm transition-colors disabled:opacity-40">
            ↺ Regenerate
          </button>
          {pinSaved && <span className="text-green-400 text-sm">Saved!</span>}
        </div>
      </div>

      {/* Bill To / Ship To */}
      <div className="bg-fp-card rounded-xl p-6">
        <h3 className="text-fp-text font-bold mb-1">Bill To / Ship To</h3>
        <p className="text-fp-muted text-sm mb-5">Your company's addresses printed on every purchase order.</p>
        <div className="space-y-5">
          <div>
            <h4 className="text-fp-text text-sm font-semibold mb-3">Ship To</h4>
            <div className="space-y-3">
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Street Address</label>
                <input type="text" value={form.ship_to_address} onChange={e => setForm(prev => ({ ...prev, ship_to_address: e.target.value }))} placeholder="123 Main St" className={inputClass} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-fp-muted text-xs mb-1 block">City</label><input type="text" value={form.ship_to_city} onChange={e => setForm(prev => ({ ...prev, ship_to_city: e.target.value }))} placeholder="Nashville" className={inputClass} /></div>
                <div><label className="text-fp-muted text-xs mb-1 block">State</label><input type="text" value={form.ship_to_state} onChange={e => setForm(prev => ({ ...prev, ship_to_state: e.target.value }))} placeholder="TN" className={inputClass} /></div>
                <div><label className="text-fp-muted text-xs mb-1 block">ZIP</label><input type="text" value={form.ship_to_zip} onChange={e => setForm(prev => ({ ...prev, ship_to_zip: e.target.value }))} placeholder="37201" className={inputClass} /></div>
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-fp-text text-sm font-semibold">Bill To</h4>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={sameAsShipTo} onChange={e => handleSameAsShipTo(e.target.checked)} className="accent-fp-brand" />
                <span className="text-fp-muted text-xs">Same as Ship To</span>
              </label>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Street Address</label>
                <input type="text" value={form.bill_to_address} onChange={e => setForm(prev => ({ ...prev, bill_to_address: e.target.value }))} placeholder="123 Main St" disabled={sameAsShipTo} className={`${inputClass} ${sameAsShipTo ? 'opacity-50 cursor-not-allowed' : ''}`} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-fp-muted text-xs mb-1 block">City</label><input type="text" value={form.bill_to_city} onChange={e => setForm(prev => ({ ...prev, bill_to_city: e.target.value }))} placeholder="Nashville" disabled={sameAsShipTo} className={`${inputClass} ${sameAsShipTo ? 'opacity-50 cursor-not-allowed' : ''}`} /></div>
                <div><label className="text-fp-muted text-xs mb-1 block">State</label><input type="text" value={form.bill_to_state} onChange={e => setForm(prev => ({ ...prev, bill_to_state: e.target.value }))} placeholder="TN" disabled={sameAsShipTo} className={`${inputClass} ${sameAsShipTo ? 'opacity-50 cursor-not-allowed' : ''}`} /></div>
                <div><label className="text-fp-muted text-xs mb-1 block">ZIP</label><input type="text" value={form.bill_to_zip} onChange={e => setForm(prev => ({ ...prev, bill_to_zip: e.target.value }))} placeholder="37201" disabled={sameAsShipTo} className={`${inputClass} ${sameAsShipTo ? 'opacity-50 cursor-not-allowed' : ''}`} /></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="bg-fp-brand text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-colors disabled:opacity-50">
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  )
}
