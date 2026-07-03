export default function GeneralTab({
  form, setForm, inputClass, logoUrl, uploadingLogo, handleLogoUpload,
  orgTaxRate, setOrgTaxRate, orgTimezone, setOrgTimezone,
  passwordForm, setPasswordForm, passwordError, passwordSuccess, savingPassword, handleChangePassword,
  supportPin, pinInput, setPinInput, savingPin, pinSaved, savePin, regeneratePin,
  sameAsShipTo, handleSameAsShipTo, profile, saving, handleSave,
  isAdmin, msrpEnabled, onToggleMsrp,
}) {
  return (
    <div className="space-y-6">
      {/* Profile */}
      <div className="bg-[#1a2d45] rounded-xl p-6">
        <h3 className="text-white font-bold mb-4">Profile</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Full Name</label>
            <input type="text" value={form.full_name} onChange={e => setForm(prev => ({ ...prev, full_name: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Email</label>
            <input type="text" value={form.email} disabled className="w-full bg-[#0F1C2E] text-[#8A9AB0] border border-[#2a3d55] rounded-lg px-3 py-2 text-sm cursor-not-allowed" />
          </div>
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Role</label>
            <input type="text" value={profile?.role || ''} disabled className="w-full bg-[#0F1C2E] text-[#8A9AB0] border border-[#2a3d55] rounded-lg px-3 py-2 text-sm cursor-not-allowed" />
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-[#1a2d45] rounded-xl p-6">
        <h3 className="text-white font-bold mb-4">Change Password</h3>
        {passwordError && <p className="text-red-400 text-sm mb-4">{passwordError}</p>}
        {passwordSuccess && <p className="text-green-400 text-sm mb-4">{passwordSuccess}</p>}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="col-span-2">
            <label className="text-[#8A9AB0] text-xs mb-1 block">Current Password</label>
            <input type="password" value={passwordForm.current} onChange={e => setPasswordForm(prev => ({ ...prev, current: e.target.value }))} placeholder="••••••••" className={inputClass} />
          </div>
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">New Password</label>
            <input type="password" value={passwordForm.newPass} onChange={e => setPasswordForm(prev => ({ ...prev, newPass: e.target.value }))} placeholder="••••••••" className={inputClass} />
          </div>
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Confirm New Password</label>
            <input type="password" value={passwordForm.confirm} onChange={e => setPasswordForm(prev => ({ ...prev, confirm: e.target.value }))} placeholder="••••••••" className={inputClass} />
          </div>
        </div>
        <button onClick={handleChangePassword} disabled={savingPassword || !passwordForm.current || !passwordForm.newPass || !passwordForm.confirm}
          className="bg-[#C8622A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
          {savingPassword ? 'Updating...' : 'Update Password'}
        </button>
      </div>

      {/* Support PIN */}
      <div className="bg-[#1a2d45] rounded-xl p-6">
        <h3 className="text-white font-bold mb-1">Support PIN</h3>
        <p className="text-[#8A9AB0] text-sm mb-5">Share this 6-digit PIN with ForgePt support when you need help.</p>
        <div className="flex items-center gap-3 mb-4">
          {supportPin.split('').map((digit, i) => (
            <div key={i} className="w-10 h-12 bg-[#0F1C2E] border border-[#2a3d55] rounded-lg flex items-center justify-center text-white text-2xl font-mono font-bold select-all">
              {digit}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <input type="text" inputMode="numeric" maxLength={6} value={pinInput}
            onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-32 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:border-[#C8622A]"
            placeholder="000000" />
          <button onClick={savePin} disabled={savingPin || pinInput.length !== 6 || pinInput === supportPin}
            className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-40">
            {savingPin ? 'Saving...' : 'Save PIN'}
          </button>
          <button onClick={regeneratePin} disabled={savingPin} className="text-[#8A9AB0] hover:text-white text-sm transition-colors disabled:opacity-40">
            ↺ Regenerate
          </button>
          {pinSaved && <span className="text-green-400 text-sm">Saved!</span>}
        </div>
      </div>

      {/* Proposal Branding */}
      <div className="bg-[#1a2d45] rounded-xl p-6">
        <h3 className="text-white font-bold mb-1">Proposal Branding</h3>
        <p className="text-[#8A9AB0] text-sm mb-4">Appears on all PDF proposals and purchase orders.</p>
        <div className="space-y-4">
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Company Name</label>
            <input type="text" value={form.company_name} onChange={e => setForm(prev => ({ ...prev, company_name: e.target.value }))} placeholder="Your company name" className={inputClass} />
          </div>
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Company Logo</label>
            {logoUrl && <div className="mb-3"><img src={logoUrl} alt="Company logo" className="h-16 object-contain bg-white rounded-lg p-2" /></div>}
            <label className="cursor-pointer">
              <div className="bg-[#0F1C2E] border border-dashed border-[#2a3d55] rounded-lg px-4 py-3 text-sm text-[#8A9AB0] hover:border-[#C8622A] transition-colors inline-block">
                {uploadingLogo ? 'Uploading...' : logoUrl ? '↑ Replace Logo' : '↑ Upload Logo'}
              </div>
              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            </label>
            <p className="text-[#8A9AB0] text-xs mt-1">PNG or JPG recommended.</p>
          </div>
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Brand Color</label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.primary_color} onChange={e => setForm(prev => ({ ...prev, primary_color: e.target.value }))} className="w-12 h-10 rounded cursor-pointer border border-[#2a3d55] bg-transparent" />
              <input type="text" value={form.primary_color} onChange={e => setForm(prev => ({ ...prev, primary_color: e.target.value }))} className="w-32 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            </div>
            <p className="text-[#8A9AB0] text-xs mt-1">Used in PDF proposals and purchase orders.</p>
          </div>
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Timezone</label>
            <select value={orgTimezone} onChange={e => setOrgTimezone(e.target.value)} className={inputClass}>
              {['America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu'].map(tz => (
                <option key={tz} value={tz}>{tz.replace('America/', '').replace('Pacific/', '').replace(/_/g, ' ')}</option>
              ))}
            </select>
            <p className="text-[#8A9AB0] text-xs mt-1">Used for calendar event scheduling.</p>
          </div>
        </div>
      </div>

      {/* Proposal Defaults */}
      {isAdmin && (
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-1">Proposal Defaults</h3>
          <p className="text-[#8A9AB0] text-sm mb-4">Default values and features applied to all proposals.</p>
          <div className="space-y-4">
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Default Markup %</label>
              <input type="number" value={form.default_markup_percent} onChange={e => setForm(prev => ({ ...prev, default_markup_percent: e.target.value }))} className="w-40 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Default Tax Rate %</label>
              <input type="number" step="0.01" placeholder="e.g. 8.5" value={orgTaxRate} onChange={e => setOrgTaxRate(e.target.value)} className="w-40 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
              <p className="text-[#8A9AB0] text-xs mt-1">Applied as default to new proposals.</p>
            </div>
            <div className="flex items-center justify-between bg-[#0F1C2E] rounded-xl px-4 py-3">
              <div>
                <p className="text-white text-sm font-semibold">Enable MSRP</p>
                <p className="text-[#8A9AB0] text-xs mt-0.5">Adds an MSRP field to the product library and BOM. Control visibility per proposal in Pricing options.</p>
              </div>
              <button onClick={onToggleMsrp}
                className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${msrpEnabled ? 'bg-[#C8622A]' : 'bg-[#2a3d55]'}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${msrpEnabled ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bill To / Ship To */}
      <div className="bg-[#1a2d45] rounded-xl p-6">
        <h3 className="text-white font-bold mb-1">Bill To / Ship To</h3>
        <p className="text-[#8A9AB0] text-sm mb-5">Your company's addresses printed on every purchase order.</p>
        <div className="space-y-5">
          <div>
            <h4 className="text-white text-sm font-semibold mb-3">Ship To</h4>
            <div className="space-y-3">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Street Address</label>
                <input type="text" value={form.ship_to_address} onChange={e => setForm(prev => ({ ...prev, ship_to_address: e.target.value }))} placeholder="123 Main St" className={inputClass} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-[#8A9AB0] text-xs mb-1 block">City</label><input type="text" value={form.ship_to_city} onChange={e => setForm(prev => ({ ...prev, ship_to_city: e.target.value }))} placeholder="Nashville" className={inputClass} /></div>
                <div><label className="text-[#8A9AB0] text-xs mb-1 block">State</label><input type="text" value={form.ship_to_state} onChange={e => setForm(prev => ({ ...prev, ship_to_state: e.target.value }))} placeholder="TN" className={inputClass} /></div>
                <div><label className="text-[#8A9AB0] text-xs mb-1 block">ZIP</label><input type="text" value={form.ship_to_zip} onChange={e => setForm(prev => ({ ...prev, ship_to_zip: e.target.value }))} placeholder="37201" className={inputClass} /></div>
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-white text-sm font-semibold">Bill To</h4>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={sameAsShipTo} onChange={e => handleSameAsShipTo(e.target.checked)} className="accent-[#C8622A]" />
                <span className="text-[#8A9AB0] text-xs">Same as Ship To</span>
              </label>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Street Address</label>
                <input type="text" value={form.bill_to_address} onChange={e => setForm(prev => ({ ...prev, bill_to_address: e.target.value }))} placeholder="123 Main St" disabled={sameAsShipTo} className={`${inputClass} ${sameAsShipTo ? 'opacity-50 cursor-not-allowed' : ''}`} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-[#8A9AB0] text-xs mb-1 block">City</label><input type="text" value={form.bill_to_city} onChange={e => setForm(prev => ({ ...prev, bill_to_city: e.target.value }))} placeholder="Nashville" disabled={sameAsShipTo} className={`${inputClass} ${sameAsShipTo ? 'opacity-50 cursor-not-allowed' : ''}`} /></div>
                <div><label className="text-[#8A9AB0] text-xs mb-1 block">State</label><input type="text" value={form.bill_to_state} onChange={e => setForm(prev => ({ ...prev, bill_to_state: e.target.value }))} placeholder="TN" disabled={sameAsShipTo} className={`${inputClass} ${sameAsShipTo ? 'opacity-50 cursor-not-allowed' : ''}`} /></div>
                <div><label className="text-[#8A9AB0] text-xs mb-1 block">ZIP</label><input type="text" value={form.bill_to_zip} onChange={e => setForm(prev => ({ ...prev, bill_to_zip: e.target.value }))} placeholder="37201" disabled={sameAsShipTo} className={`${inputClass} ${sameAsShipTo ? 'opacity-50 cursor-not-allowed' : ''}`} /></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Terms and Conditions */}
      <div className="bg-[#1a2d45] rounded-xl p-6">
        <h3 className="text-white font-bold mb-1">Terms and Conditions</h3>
        <p className="text-[#8A9AB0] text-sm mb-4">Appears at the bottom of every PDF proposal.</p>
        <textarea value={form.terms_and_conditions} onChange={e => setForm(prev => ({ ...prev, terms_and_conditions: e.target.value }))} placeholder="Enter your standard terms and conditions here..." rows={8} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" />
      </div>

      <button onClick={handleSave} disabled={saving} className="bg-[#C8622A] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  )
}
