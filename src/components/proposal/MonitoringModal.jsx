export default function MonitoringModal({ editMonitoringForm, setEditMonitoringForm, editingAgreementIdx, orgSLASettings, savingContract, onSave, onClose }) {
  const allMonitoringTemplates = () => {
    const templates = []
    Object.entries(orgSLASettings?.monitoring_templates || {}).forEach(([industry, tmpl]) => {
      if (tmpl?.enabled) templates.push({ ...tmpl, _industry: industry })
    })
    return templates
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-white font-bold text-lg">📡 {editingAgreementIdx !== null ? 'Edit' : 'Add'} Monitoring Contract</h3>
          <button onClick={onClose} className="text-[#8A9AB0] hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="space-y-4">
          {allMonitoringTemplates().length > 0 && (
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Start from a template</label>
              <select onChange={e => {
                const tmpl = allMonitoringTemplates().find(t => t._industry === e.target.value)
                if (tmpl) setEditMonitoringForm(p => ({ ...p, name: tmpl.name || 'Monitoring Contract', monthly_fee: tmpl.monthly_fee || 49, monitored_systems: tmpl.monitored_systems || '', billing_frequency: tmpl.billing_frequency || 'Monthly', escalation_contacts: tmpl.escalation_contacts || 2, body: tmpl.body || '' }))
              }} defaultValue="" className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                <option value="">— Pick a template to pre-fill —</option>
                {allMonitoringTemplates().map(t => (
                  <option key={t._industry} value={t._industry}>{t.name || 'Monitoring Contract'} ({t._industry})</option>
                ))}
              </select>
              <p className="text-[#8A9AB0] text-xs mt-1">All fields remain editable after selecting.</p>
            </div>
          )}
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Contract Name</label>
            <input type="text" value={editMonitoringForm.name || ''} onChange={e => setEditMonitoringForm(p => ({ ...p, name: e.target.value }))}
              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Monthly Fee ($)</label>
              <input type="number" value={editMonitoringForm.monthly_fee || ''} onChange={e => setEditMonitoringForm(p => ({ ...p, monthly_fee: e.target.value }))}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Escalation Contacts</label>
              <input type="number" min="1" value={editMonitoringForm.escalation_contacts || ''} onChange={e => setEditMonitoringForm(p => ({ ...p, escalation_contacts: e.target.value }))}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            </div>
            <div className="col-span-2">
              <label className="text-[#8A9AB0] text-xs mb-1 block">Billing Frequency</label>
              <select value={editMonitoringForm.billing_frequency || 'Monthly'} onChange={e => setEditMonitoringForm(p => ({ ...p, billing_frequency: e.target.value }))}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                <option>Monthly</option><option>Quarterly</option><option>Annual</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[#8A9AB0] text-xs mb-1 block">Monitored Systems</label>
              <input type="text" value={editMonitoringForm.monitored_systems || ''} onChange={e => setEditMonitoringForm(p => ({ ...p, monitored_systems: e.target.value }))}
                placeholder="e.g. Cameras, Access Control, Alarm" className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Start Date</label>
              <input type="date" value={editMonitoringForm.start_date || ''} onChange={e => setEditMonitoringForm(p => ({ ...p, start_date: e.target.value }))}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">End Date</label>
              <input type="date" value={editMonitoringForm.end_date || ''} onChange={e => setEditMonitoringForm(p => ({ ...p, end_date: e.target.value }))}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            </div>
            <div className="col-span-2 flex items-center gap-3">
              <input type="checkbox" id="mon-autorenew" checked={!!editMonitoringForm.auto_renew} onChange={e => setEditMonitoringForm(p => ({ ...p, auto_renew: e.target.checked }))} className="w-4 h-4 accent-[#C8622A]" />
              <label htmlFor="mon-autorenew" className="text-[#8A9AB0] text-sm">Auto-renew when term ends</label>
            </div>
          </div>
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Contract Language</label>
            <textarea rows={12} value={editMonitoringForm.body || ''} onChange={e => setEditMonitoringForm(p => ({ ...p, body: e.target.value }))}
              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none font-mono" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3a4d65] transition-colors">Cancel</button>
            <button onClick={onSave} disabled={savingContract} className="flex-1 bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {savingContract ? 'Saving...' : editingAgreementIdx !== null ? 'Save Changes' : 'Add Contract'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
