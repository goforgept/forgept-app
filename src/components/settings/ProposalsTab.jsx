export default function ProposalsTab({
  form, setForm, inputClass,
  logoUrl, uploadingLogo, handleLogoUpload,
  warrantyTemplates, setWarrantyTemplates,
  defaultHideMaterialPrices, setDefaultHideMaterialPrices,
  defaultHideLaborBreakdown, setDefaultHideLaborBreakdown,
  defaultLumpSumLabor, setDefaultLumpSumLabor,
  defaultTcFontSize = 9, setDefaultTcFontSize,
  isAdmin, msrpEnabled, onToggleMsrp,
  docFont, onChangeDocFont,
  pdfTableStyle, onChangePdfTableStyle,
  pdfHeaderStyle, onChangePdfHeaderStyle,
  pdfColorHeaders, onChangePdfColorHeaders,
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

      {/* Warranty Templates */}
      <div className="bg-fp-card rounded-xl p-6">
        <h3 className="text-fp-text font-bold mb-1">Warranty Templates</h3>
        <p className="text-fp-muted text-sm mb-4">Create reusable warranty statements. On each proposal you can select which one to use and edit it as needed.</p>
        <div className="space-y-4">
          {(warrantyTemplates || []).map((tmpl, i) => (
            <div key={tmpl.id} className="bg-fp-bg rounded-xl p-4 space-y-3 border border-fp-border">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={tmpl.name}
                  onChange={e => setWarrantyTemplates(prev => prev.map((t, j) => j === i ? { ...t, name: e.target.value } : t))}
                  placeholder="Template name (e.g. Standard, Extended)"
                  className="flex-1 bg-transparent text-fp-text text-sm font-semibold focus:outline-none border-b border-fp-border focus:border-fp-brand pb-1"
                />
                <button
                  onClick={() => setWarrantyTemplates(prev => prev.filter((_, j) => j !== i))}
                  className="text-fp-muted hover:text-red-400 text-xs transition-colors flex-shrink-0"
                >
                  Remove
                </button>
              </div>
              <textarea
                value={tmpl.text}
                onChange={e => setWarrantyTemplates(prev => prev.map((t, j) => j === i ? { ...t, text: e.target.value } : t))}
                placeholder="Warranty text..."
                rows={4}
                className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-y"
              />
            </div>
          ))}
          <button
            onClick={() => setWarrantyTemplates(prev => [...(prev || []), { id: crypto.randomUUID(), name: '', text: '' }])}
            className="text-fp-muted hover:text-fp-text text-sm transition-colors"
          >
            + Add Warranty Template
          </button>
        </div>
      </div>

      {/* Proposal Defaults */}
      {isAdmin && (
        <div className="bg-fp-card rounded-xl p-6">
          <h3 className="text-fp-text font-bold mb-1">Proposal Defaults</h3>
          <p className="text-fp-muted text-sm mb-4">Default values and features applied to all new proposals.</p>
          <div className="space-y-4">
            <div>
              <p className="text-fp-text text-sm font-semibold mb-1">Default Pricing Options</p>
              <p className="text-fp-muted text-xs mb-3">These settings will be pre-applied to every new proposal. Can still be changed per proposal.</p>
              <div className="space-y-2">
                {[
                  { label: 'Hide Material Unit Prices', desc: 'Show item names and qty only — no unit price or line total', val: defaultHideMaterialPrices, set: setDefaultHideMaterialPrices },
                  { label: 'Hide Labor Breakdown', desc: 'Show Role, Qty, Total only — no hourly rate', val: defaultHideLaborBreakdown, set: setDefaultHideLaborBreakdown },
                  { label: 'Lump Sum Labor', desc: 'Collapse all labor into a single line with the combined total', val: defaultLumpSumLabor, set: setDefaultLumpSumLabor },
                ].map(opt => (
                  <div key={opt.label} className="flex items-center justify-between bg-fp-bg rounded-xl px-4 py-3">
                    <div>
                      <p className="text-fp-text text-sm font-semibold">{opt.label}</p>
                      <p className="text-fp-muted text-xs mt-0.5">{opt.desc}</p>
                    </div>
                    <button onClick={() => opt.set(v => !v)}
                      className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${opt.val ? 'bg-fp-brand' : 'bg-fp-border'}`}>
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${opt.val ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between bg-fp-bg rounded-xl px-4 py-3">
              <div>
                <p className="text-fp-text text-sm font-semibold">Default T&C / Warranty Font Size</p>
                <p className="text-fp-muted text-xs mt-0.5">Body text size for T&C and Warranty pages in PDF and DOCX exports.</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setDefaultTcFontSize(s => Math.max(7, s - 1))}
                  className="w-7 h-7 flex items-center justify-center rounded bg-fp-inset hover:bg-fp-hover text-fp-muted hover:text-fp-text text-sm transition-colors"
                >−</button>
                <span className="text-fp-text text-sm font-semibold w-12 text-center">{defaultTcFontSize}pt</span>
                <button
                  onClick={() => setDefaultTcFontSize(s => Math.min(14, s + 1))}
                  className="w-7 h-7 flex items-center justify-center rounded bg-fp-inset hover:bg-fp-hover text-fp-muted hover:text-fp-text text-sm transition-colors"
                >+</button>
              </div>
            </div>
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
            <div className="flex items-center justify-between bg-fp-bg rounded-xl px-4 py-3">
              <div>
                <p className="text-fp-text text-sm font-semibold">Colored Table Headers</p>
                <p className="text-fp-muted text-xs mt-0.5">Use your brand color for table header rows and section bars. Turn off for a clean grey look.</p>
              </div>
              <button onClick={onChangePdfColorHeaders}
                className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${pdfColorHeaders ? 'bg-fp-brand' : 'bg-fp-border'}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${pdfColorHeaders ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
            <div>
              <p className="text-fp-text text-sm font-semibold mb-1">PDF Logo Size</p>
              <p className="text-fp-muted text-xs mb-3">Controls how much space your logo gets in PDF document headers.</p>
              <div className="flex gap-2">
                {[
                  { value: 'compact', label: 'Compact', desc: 'Small logo, slim header' },
                  { value: 'large', label: 'Large', desc: 'Bigger logo, taller header' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => onChangePdfHeaderStyle?.(opt.value)}
                    className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border text-left ${pdfHeaderStyle === opt.value ? 'bg-fp-brand text-white border-fp-brand' : 'bg-fp-bg text-fp-muted hover:text-fp-text border-fp-border'}`}>
                    <span className="block font-semibold">{opt.label}</span>
                    <span className={`block text-xs mt-0.5 ${pdfHeaderStyle === opt.value ? 'text-white/70' : 'text-fp-muted'}`}>{opt.desc}</span>
                  </button>
                ))}
              </div>
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
