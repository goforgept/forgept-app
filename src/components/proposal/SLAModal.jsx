export default function SLAModal({ editSLAForm, setEditSLAForm, editingAgreementIdx, orgSLASettings, savingContract, onSave, onClose }) {
  const allSLATiers = () => {
    const tiers = []
    Object.entries(orgSLASettings?.sla_templates || {}).forEach(([industry, tmpl]) => {
      if (tmpl?.tiers) tmpl.tiers.forEach(t => tiers.push({ ...t, _industry: industry }))
    })
    return tiers
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-fp-card rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-fp-text font-bold text-lg">📋 {editingAgreementIdx !== null ? 'Edit' : 'Add'} Service Agreement</h3>
          <button onClick={onClose} className="text-fp-muted hover:text-fp-text text-2xl leading-none">×</button>
        </div>
        <div className="space-y-4">
          {allSLATiers().length > 0 && (
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Start from a template</label>
              <select value={editSLAForm.tier_id || ''} onChange={e => {
                const tier = allSLATiers().find(t => t.id === e.target.value)
                if (tier) setEditSLAForm(p => ({ ...p, tier_id: tier.id, tier_name: tier.name, name: tier.name, response_time_hours: tier.response_time_hours ?? '', labor_rate: tier.labor_rate || 100, emergency_rate: tier.emergency_rate ?? '', billing_frequency: tier.billing_frequency || 'Quarterly', maintenance_calls_per_year: tier.maintenance_calls_per_year || 0, initial_fee: tier.initial_fee || 0, recurring_fee: tier.recurring_fee || 0, body: tier.body || '' }))
              }} className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand">
                <option value="">— Pick a template to pre-fill —</option>
                {allSLATiers().map(t => (
                  <option key={t.id} value={t.id}>{t.name} {t._industry ? `(${t._industry})` : ''}</option>
                ))}
              </select>
              <p className="text-fp-muted text-xs mt-1">All fields below remain editable after selecting a template.</p>
            </div>
          )}
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Agreement Name</label>
            <input type="text" value={editSLAForm.name || ''} onChange={e => setEditSLAForm(p => ({ ...p, name: e.target.value }))}
              className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Response Time (hours) <span className="text-fp-muted font-normal">— blank = N/A</span></label>
              <input type="number" value={editSLAForm.response_time_hours ?? ''} placeholder="N/A" onChange={e => setEditSLAForm(p => ({ ...p, response_time_hours: e.target.value }))}
                className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
            </div>
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Billing Frequency</label>
              <select value={editSLAForm.billing_frequency || 'Quarterly'} onChange={e => setEditSLAForm(p => ({ ...p, billing_frequency: e.target.value }))}
                className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand">
                <option>Monthly</option><option>Quarterly</option><option>Annually</option>
              </select>
            </div>
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Labor Rate ($/hr)</label>
              <input type="number" value={editSLAForm.labor_rate || ''} onChange={e => setEditSLAForm(p => ({ ...p, labor_rate: e.target.value }))}
                className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
            </div>
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Emergency Rate ($/hr) <span className="text-fp-muted font-normal">— blank = N/A</span></label>
              <input type="number" value={editSLAForm.emergency_rate ?? ''} placeholder="N/A" onChange={e => setEditSLAForm(p => ({ ...p, emergency_rate: e.target.value }))}
                className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
            </div>
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Maintenance Visits/Year</label>
              <input type="number" min="0" value={editSLAForm.maintenance_calls_per_year ?? 0} onChange={e => setEditSLAForm(p => ({ ...p, maintenance_calls_per_year: Number(e.target.value) }))}
                className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
            </div>
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Initial Fee ($) <span className="text-fp-muted font-normal">billed with job</span></label>
              <input type="number" min="0" value={editSLAForm.initial_fee ?? 0} onChange={e => setEditSLAForm(p => ({ ...p, initial_fee: Number(e.target.value) }))}
                className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
            </div>
            <div className="col-span-2">
              <label className="text-fp-muted text-xs mb-1 block">Recurring Fee ($) <span className="text-fp-muted font-normal">per billing cycle</span></label>
              <input type="number" min="0" value={editSLAForm.recurring_fee ?? 0} onChange={e => setEditSLAForm(p => ({ ...p, recurring_fee: Number(e.target.value) }))}
                className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
            </div>
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Start Date</label>
              <input type="date" value={editSLAForm.start_date || ''} onChange={e => setEditSLAForm(p => ({ ...p, start_date: e.target.value }))}
                className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
            </div>
            <div>
              <label className="text-fp-muted text-xs mb-1 block">End Date</label>
              <input type="date" value={editSLAForm.end_date || ''} onChange={e => setEditSLAForm(p => ({ ...p, end_date: e.target.value }))}
                className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
            </div>
            <div className="col-span-2 flex items-center gap-3">
              <input type="checkbox" id="sla-autorenew" checked={!!editSLAForm.auto_renew} onChange={e => setEditSLAForm(p => ({ ...p, auto_renew: e.target.checked }))} className="w-4 h-4 accent-fp-brand" />
              <label htmlFor="sla-autorenew" className="text-fp-muted text-sm">Auto-renew when term ends</label>
            </div>
          </div>
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Contract Language</label>
            <textarea rows={10} value={editSLAForm.body || ''} onChange={e => setEditSLAForm(p => ({ ...p, body: e.target.value }))}
              className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none font-mono" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 bg-fp-inset text-fp-text px-4 py-2 rounded-lg text-sm font-semibold hover:bg-fp-hover transition-colors">Cancel</button>
            <button onClick={onSave} disabled={savingContract} className="flex-1 bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {savingContract ? 'Saving...' : editingAgreementIdx !== null ? 'Save Changes' : 'Add Agreement'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
