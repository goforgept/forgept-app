import { SLA_INDUSTRIES, MONITORING_INDUSTRIES, _STD_BODY } from './slaConstants'

export default function SlaTab({
  slaEnabled, setSlaEnabled, slaAutoAttach, setSlaAutoAttach,
  monitoringEnabled, setMonitoringEnabled, monitoringAutoAttach, setMonitoringAutoAttach,
  slaTemplates, setSlaTemplates, monitoringTemplates, setMonitoringTemplates,
  expandedSLAIndustry, setExpandedSLAIndustry,
  expandedSLATier, setExpandedSLATier,
  expandedMonIndustry, setExpandedMonIndustry,
  handleSaveSLA, savingSLA, inputClass,
}) {
  const addSLATier = (ind) => {
    const newTier = { id: crypto.randomUUID(), name: 'New Tier', response_time_hours: 8, labor_rate: 100, emergency_rate: 150, billing_frequency: 'Quarterly', maintenance_calls_per_year: 0, initial_fee: 0, recurring_fee: 0, body: _STD_BODY }
    setSlaTemplates(p => ({ ...p, [ind]: { ...p[ind], tiers: [...(p[ind]?.tiers || []), newTier] } }))
    setExpandedSLATier(p => ({ ...p, [ind]: newTier.id }))
  }

  const removeSLATier = (ind, tierId) => {
    if (!window.confirm('Remove this tier?')) return
    setSlaTemplates(p => ({ ...p, [ind]: { ...p[ind], tiers: (p[ind]?.tiers || []).filter(t => t.id !== tierId) } }))
    setExpandedSLATier(p => ({ ...p, [ind]: null }))
  }

  const updateSLATier = (ind, tierId, field, value) => {
    setSlaTemplates(p => ({ ...p, [ind]: { ...p[ind], tiers: (p[ind]?.tiers || []).map(t => t.id === tierId ? { ...t, [field]: value } : t) } }))
  }

  const Toggle = ({ value, onChange }) => (
    <button onClick={onChange}
      className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${value ? 'bg-fp-brand' : 'bg-fp-inset'}`}>
      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${value ? 'left-7' : 'left-1'}`} />
    </button>
  )

  return (
    <div className="space-y-6">
      {/* Feature Toggles */}
      <div className="bg-fp-card rounded-xl p-6 space-y-5">
        <h3 className="text-fp-text font-bold">Feature Settings</h3>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-fp-text text-sm font-semibold">Enable SLA Contracts</p>
            <p className="text-fp-muted text-xs mt-0.5">Show a Service Level Agreement section on proposals and allow templates per industry.</p>
          </div>
          <Toggle value={slaEnabled} onChange={() => setSlaEnabled(p => !p)} />
        </div>
        {slaEnabled && (
          <div className="flex items-start justify-between pl-4 border-l-2 border-fp-brand/30">
            <div>
              <p className="text-fp-text text-sm font-semibold">Auto-attach SLA to New Proposals</p>
              <p className="text-fp-muted text-xs mt-0.5">Automatically attach the matching industry SLA template when a proposal is opened.</p>
            </div>
            <Toggle value={slaAutoAttach} onChange={() => setSlaAutoAttach(p => !p)} />
          </div>
        )}
        <div className="border-t border-fp-border pt-5 flex items-start justify-between">
          <div>
            <p className="text-fp-text text-sm font-semibold">Enable Monitoring Contracts</p>
            <p className="text-fp-muted text-xs mt-0.5">Show a Monitoring Contract section on proposals.</p>
          </div>
          <Toggle value={monitoringEnabled} onChange={() => setMonitoringEnabled(p => !p)} />
        </div>
        {monitoringEnabled && (
          <div className="flex items-start justify-between pl-4 border-l-2 border-fp-brand/30">
            <div>
              <p className="text-fp-text text-sm font-semibold">Auto-attach Monitoring to New Proposals</p>
              <p className="text-fp-muted text-xs mt-0.5">Automatically attach the matching monitoring contract template when a proposal is opened.</p>
            </div>
            <Toggle value={monitoringAutoAttach} onChange={() => setMonitoringAutoAttach(p => !p)} />
          </div>
        )}
      </div>

      {/* SLA Templates */}
      {slaEnabled && (
        <div>
          <div className="mb-3">
            <h3 className="text-fp-text font-bold">SLA Tiers by Industry</h3>
            <p className="text-fp-muted text-sm mt-1">Variables: <span className="font-mono text-fp-brand text-xs">{'{{clientName}} {{companyName}} {{proposalName}} {{responseTime}} {{tierName}} {{billingFrequency}} {{laborRate}} {{emergencyRate}} {{maintenanceCalls}} {{initialFee}} {{recurringFee}}'}</span></p>
          </div>
          <div className="space-y-2">
            {SLA_INDUSTRIES.map(ind => {
              const t = slaTemplates[ind] || { enabled: false, tiers: [] }
              const tiers = t.tiers || []
              const isOpen = expandedSLAIndustry === ind
              return (
                <div key={ind} className="bg-fp-card rounded-xl overflow-hidden border border-fp-border">
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-fp-hover transition-colors"
                    onClick={() => setExpandedSLAIndustry(isOpen ? null : ind)}>
                    <div className="flex items-center gap-3">
                      <button onClick={e => { e.stopPropagation(); setSlaTemplates(prev => ({ ...prev, [ind]: { ...prev[ind], enabled: !prev[ind]?.enabled } })) }}
                        className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${t.enabled ? 'bg-fp-brand' : 'bg-fp-inset'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${t.enabled ? 'left-5' : 'left-0.5'}`} />
                      </button>
                      <div>
                        <p className="text-fp-text text-sm font-semibold">{ind}</p>
                        <p className="text-fp-muted text-xs">{tiers.length} tier{tiers.length !== 1 ? 's' : ''}{tiers.length > 0 ? ` · ${tiers.map(t => t.name).join(', ')}` : ''}</p>
                      </div>
                    </div>
                    <span className="text-fp-muted text-xs">{isOpen ? '▲' : '▼'}</span>
                  </div>
                  {isOpen && (
                    <div className="border-t border-fp-border p-4 space-y-2">
                      {tiers.map(tier => {
                        const isTierOpen = expandedSLATier[ind] === tier.id
                        return (
                          <div key={tier.id} className="bg-fp-inset rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-fp-inset transition-colors"
                              onClick={() => setExpandedSLATier(p => ({ ...p, [ind]: isTierOpen ? null : tier.id }))}>
                              <div className="flex items-center gap-3">
                                <span className="bg-fp-brand/20 text-fp-brand text-xs font-semibold px-2 py-0.5 rounded">{tier.name || 'Untitled'}</span>
                                <span className="text-fp-muted text-xs">
                                  {tier.response_time_hours ? `${tier.response_time_hours}hr response` : 'Maintenance'}
                                  {tier.recurring_fee > 0 ? ` · $${tier.recurring_fee}/${tier.billing_frequency}` : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <button onClick={e => { e.stopPropagation(); removeSLATier(ind, tier.id) }} className="text-fp-muted hover:text-red-400 text-xs transition-colors">Remove</button>
                                <span className="text-fp-muted text-xs">{isTierOpen ? '▲' : '▼'}</span>
                              </div>
                            </div>
                            {isTierOpen && (
                              <div className="border-t border-fp-border px-4 py-4 space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="col-span-2">
                                    <label className="text-fp-muted text-xs mb-1 block">Tier Name</label>
                                    <input type="text" value={tier.name || ''} onChange={e => updateSLATier(ind, tier.id, 'name', e.target.value)} className={inputClass} />
                                  </div>
                                  <div>
                                    <label className="text-fp-muted text-xs mb-1 block">Response Time (hrs)</label>
                                    <input type="number" value={tier.response_time_hours || ''} placeholder="N/A" onChange={e => updateSLATier(ind, tier.id, 'response_time_hours', e.target.value ? Number(e.target.value) : null)} className={inputClass} />
                                  </div>
                                  <div>
                                    <label className="text-fp-muted text-xs mb-1 block">Billing Frequency</label>
                                    <select value={tier.billing_frequency || 'Quarterly'} onChange={e => updateSLATier(ind, tier.id, 'billing_frequency', e.target.value)} className={inputClass}>
                                      <option>Monthly</option><option>Quarterly</option><option>Annually</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-fp-muted text-xs mb-1 block">Labor Rate ($/hr)</label>
                                    <input type="number" value={tier.labor_rate || ''} onChange={e => updateSLATier(ind, tier.id, 'labor_rate', Number(e.target.value))} className={inputClass} />
                                  </div>
                                  <div>
                                    <label className="text-fp-muted text-xs mb-1 block">Emergency Rate ($/hr)</label>
                                    <input type="number" value={tier.emergency_rate || ''} placeholder="N/A" onChange={e => updateSLATier(ind, tier.id, 'emergency_rate', e.target.value ? Number(e.target.value) : null)} className={inputClass} />
                                  </div>
                                  <div>
                                    <label className="text-fp-muted text-xs mb-1 block">Maintenance Visits/Year</label>
                                    <input type="number" min="0" value={tier.maintenance_calls_per_year ?? 0} onChange={e => updateSLATier(ind, tier.id, 'maintenance_calls_per_year', Number(e.target.value))} className={inputClass} />
                                  </div>
                                  <div>
                                    <label className="text-fp-muted text-xs mb-1 block">Initial Fee ($)</label>
                                    <input type="number" min="0" value={tier.initial_fee ?? 0} onChange={e => updateSLATier(ind, tier.id, 'initial_fee', Number(e.target.value))} className={inputClass} />
                                  </div>
                                  <div>
                                    <label className="text-fp-muted text-xs mb-1 block">Recurring Fee ($)</label>
                                    <input type="number" min="0" value={tier.recurring_fee ?? 0} onChange={e => updateSLATier(ind, tier.id, 'recurring_fee', Number(e.target.value))} className={inputClass} />
                                  </div>
                                </div>
                                <div>
                                  <label className="text-fp-muted text-xs mb-1 block">Contract Language</label>
                                  <textarea rows={8} value={tier.body || ''} onChange={e => updateSLATier(ind, tier.id, 'body', e.target.value)}
                                    className="w-full bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-fp-brand resize-none font-mono" />
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                      <button onClick={() => addSLATier(ind)}
                        className="w-full py-2 border border-dashed border-fp-border text-fp-muted hover:text-fp-text hover:border-fp-brand rounded-lg text-sm transition-colors">
                        + Add Tier
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Monitoring Templates */}
      {monitoringEnabled && (
        <div>
          <div className="mb-3">
            <h3 className="text-fp-text font-bold">Monitoring Contract Templates by Industry</h3>
            <p className="text-fp-muted text-sm mt-1">Variables: <span className="font-mono text-fp-brand text-xs">{'{{clientName}} {{companyName}} {{proposalName}} {{monitoredSystems}} {{monthlyFee}} {{billingFrequency}} {{escalationContacts}}'}</span></p>
          </div>
          <div className="space-y-2">
            {MONITORING_INDUSTRIES.map(ind => {
              const t = monitoringTemplates[ind] || {}
              const isOpen = expandedMonIndustry === ind
              return (
                <div key={ind} className="bg-fp-card rounded-xl overflow-hidden border border-fp-border">
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-fp-hover transition-colors"
                    onClick={() => setExpandedMonIndustry(isOpen ? null : ind)}>
                    <div className="flex items-center gap-3">
                      <button onClick={e => { e.stopPropagation(); setMonitoringTemplates(prev => ({ ...prev, [ind]: { ...prev[ind], enabled: !prev[ind]?.enabled } })) }}
                        className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${t.enabled ? 'bg-fp-brand' : 'bg-fp-inset'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${t.enabled ? 'left-5' : 'left-0.5'}`} />
                      </button>
                      <div>
                        <p className="text-fp-text text-sm font-semibold">{ind}</p>
                        {t.name && <p className="text-fp-muted text-xs">{t.name}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-fp-muted">
                      {t.monthly_fee && <span>${t.monthly_fee}/mo</span>}
                      {t.billing_frequency && <span>{t.billing_frequency}</span>}
                      <span>{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t border-fp-border p-5 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-fp-muted text-xs mb-1 block">Template Name</label>
                          <input type="text" value={t.name || ''} onChange={e => setMonitoringTemplates(p => ({ ...p, [ind]: { ...p[ind], name: e.target.value } }))} className={inputClass} />
                        </div>
                        <div>
                          <label className="text-fp-muted text-xs mb-1 block">Billing Frequency</label>
                          <select value={t.billing_frequency || 'Monthly'} onChange={e => setMonitoringTemplates(p => ({ ...p, [ind]: { ...p[ind], billing_frequency: e.target.value } }))} className={inputClass}>
                            <option>Monthly</option><option>Quarterly</option><option>Annual</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-fp-muted text-xs mb-1 block">Monthly Fee ($)</label>
                          <input type="number" value={t.monthly_fee || ''} onChange={e => setMonitoringTemplates(p => ({ ...p, [ind]: { ...p[ind], monthly_fee: e.target.value } }))} className={inputClass} />
                        </div>
                        <div>
                          <label className="text-fp-muted text-xs mb-1 block">Escalation Contacts</label>
                          <input type="number" min="1" value={t.escalation_contacts || ''} onChange={e => setMonitoringTemplates(p => ({ ...p, [ind]: { ...p[ind], escalation_contacts: e.target.value } }))} className={inputClass} />
                        </div>
                      </div>
                      <div>
                        <label className="text-fp-muted text-xs mb-1 block">Monitored Systems</label>
                        <input type="text" value={t.monitored_systems || ''} onChange={e => setMonitoringTemplates(p => ({ ...p, [ind]: { ...p[ind], monitored_systems: e.target.value } }))} placeholder="e.g. Cameras, Access Control, Alarm" className={inputClass} />
                      </div>
                      <div>
                        <label className="text-fp-muted text-xs mb-1 block">Contract Language</label>
                        <textarea rows={10} value={t.body || ''} onChange={e => setMonitoringTemplates(p => ({ ...p, [ind]: { ...p[ind], body: e.target.value } }))}
                          className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none font-mono" />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <button onClick={handleSaveSLA} disabled={savingSLA}
        className="bg-fp-brand text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
        {savingSLA ? 'Saving...' : 'Save SLA & Monitoring Settings'}
      </button>
    </div>
  )
}
