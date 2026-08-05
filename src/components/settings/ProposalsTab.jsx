export default function ProposalsTab({
  form, setForm, inputClass,
  logoUrl, uploadingLogo, handleLogoUpload,
  isAdmin, msrpEnabled, onToggleMsrp,
  docFont, onChangeDocFont,
  pdfTableStyle, onChangePdfTableStyle,
  saving, handleSave,
}) {
  return (
    <div className="space-y-6">
      {/* Proposal Branding */}
      <div className="bg-fp-card rounded-xl p-6">
        <h3 className="text-fp-text font-bold mb-1">Proposal Branding</h3>
        <p className="text-fp-muted text-sm mb-4">Appears on all PDF proposals and purchase orders.</p>
        <div className="space-y-4">
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Company Name</label>
            <input type="text" value={form.company_name} onChange={e => setForm(prev => ({ ...prev, company_name: e.target.value }))} placeholder="Your company name" className={inputClass} />
          </div>
          <div>
            <label className="text-fp-muted text-xs mb-1 block">License Number</label>
            <input type="text" value={form.license_number || ''} onChange={e => setForm(prev => ({ ...prev, license_number: e.target.value }))} placeholder="e.g. LIC-123456" className={inputClass} />
            <p className="text-fp-muted text-xs mt-1">If entered, printed on all PDF proposals. Required by some states.</p>
          </div>
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Company Logo</label>
            {logoUrl && <div className="mb-3"><img src={logoUrl} alt="Company logo" className="h-16 object-contain bg-white rounded-lg p-2" /></div>}
            <label className="cursor-pointer">
              <div className="bg-fp-bg border border-dashed border-fp-border rounded-lg px-4 py-3 text-sm text-fp-muted hover:border-fp-brand transition-colors inline-block">
                {uploadingLogo ? 'Uploading...' : logoUrl ? '↑ Replace Logo' : '↑ Upload Logo'}
              </div>
              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            </label>
            <p className="text-fp-muted text-xs mt-1">PNG or JPG recommended.</p>
          </div>
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Brand Color</label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.primary_color} onChange={e => setForm(prev => ({ ...prev, primary_color: e.target.value }))} className="w-12 h-10 rounded cursor-pointer border border-fp-border bg-transparent" />
              <input type="text" value={form.primary_color} onChange={e => setForm(prev => ({ ...prev, primary_color: e.target.value }))} className="w-32 bg-fp-bg text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
            </div>
            <p className="text-fp-muted text-xs mt-1">Used in PDF proposals and purchase orders.</p>
          </div>
        </div>
      </div>

      {/* About Us */}
      <div className="bg-fp-card rounded-xl p-6">
        <h3 className="text-fp-text font-bold mb-1">About Us</h3>
        <p className="text-fp-muted text-sm mb-4">Appears at the top of every proposal — before the scope of work. Use this to introduce your company, highlight certifications, years in business, service areas, or anything that builds confidence with the client.</p>
        <textarea
          value={form.about_us || ''}
          onChange={e => setForm(prev => ({ ...prev, about_us: e.target.value }))}
          placeholder="e.g. Founded in 2010, Acme AV has been designing and installing commercial AV systems across the Southeast for over 14 years. We hold certifications from Crestron, Extron, and QSC, and our team of 12 full-time technicians has completed over 500 installations in healthcare, education, and corporate environments..."
          rows={6}
          className="w-full bg-fp-bg text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-y"
        />
      </div>

      {/* Terms and Conditions */}
      <div className="bg-fp-card rounded-xl p-6">
        <h3 className="text-fp-text font-bold mb-1">Terms and Conditions</h3>
        <p className="text-fp-muted text-sm mb-4">Appears at the bottom of every PDF proposal.</p>
        <textarea
          value={form.terms_and_conditions || ''}
          onChange={e => setForm(prev => ({ ...prev, terms_and_conditions: e.target.value }))}
          placeholder="Enter your standard terms and conditions here..."
          rows={8}
          className="w-full bg-fp-bg text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none"
        />
      </div>

      {/* Proposal Defaults */}
      {isAdmin && (
        <div className="bg-fp-card rounded-xl p-6">
          <h3 className="text-fp-text font-bold mb-1">Proposal Defaults</h3>
          <p className="text-fp-muted text-sm mb-4">Default features applied to all proposals. Markup % and tax rate are set in the Rate Card tab.</p>
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-fp-bg rounded-xl px-4 py-3">
              <div>
                <p className="text-fp-text text-sm font-semibold">Enable MSRP</p>
                <p className="text-fp-muted text-xs mt-0.5">Adds an MSRP field to the product library and BOM. Control visibility per proposal in Pricing options.</p>
              </div>
              <button onClick={onToggleMsrp}
                className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${msrpEnabled ? 'bg-fp-brand' : 'bg-fp-border'}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${msrpEnabled ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
            <div>
              <p className="text-fp-text text-sm font-semibold mb-2">PDF Font</p>
              <div className="flex gap-2">
                {[
                  { value: 'helvetica', label: 'Sans-serif' },
                  { value: 'times', label: 'Serif' },
                  { value: 'courier', label: 'Monospace' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => onChangeDocFont?.(opt.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${docFont === opt.value ? 'bg-fp-brand text-white' : 'bg-fp-bg text-fp-muted hover:text-fp-text border border-fp-border'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between bg-fp-bg rounded-xl px-4 py-3">
              <div>
                <p className="text-fp-text text-sm font-semibold">Striped Table Rows</p>
                <p className="text-fp-muted text-xs mt-0.5">Alternates row shading in PDF tables. Turn off for a plain white table.</p>
              </div>
              <button onClick={onChangePdfTableStyle}
                className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${pdfTableStyle === 'striped' ? 'bg-fp-brand' : 'bg-fp-border'}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${pdfTableStyle === 'striped' ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </div>
      )}

      <button onClick={handleSave} disabled={saving} className="bg-fp-brand text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-colors disabled:opacity-50">
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  )
}
