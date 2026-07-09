export default function ServiceAgreementSection({ orgSLASettings, slaContracts, profile, proposal, openSLAModal, removeSLAContract }) {
  if (!orgSLASettings?.feature_sla) return null

  return (
    <div className="bg-fp-card rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <span className="text-lg">📋</span>
          <h3 className="text-fp-text font-bold text-lg">Service Agreements</h3>
          {slaContracts.length > 0 && <span className="bg-green-500/20 text-green-400 text-xs font-semibold px-2 py-0.5 rounded-full">{slaContracts.length} attached</span>}
        </div>
        <button onClick={() => openSLAModal(null)} className="bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
          + Add Service Agreement
        </button>
      </div>
      {slaContracts.length === 0 ? (
        <p className="text-fp-muted text-sm">No service agreements attached. Click "Add Service Agreement" to add one.</p>
      ) : (
        <div className="space-y-4">
          {slaContracts.map((slaC, idx) => (
            <div key={idx} className="bg-fp-inset rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-fp-text font-semibold">{slaC.name || 'Service Level Agreement'}</p>
                  {slaC.tier_name && <span className="inline-block bg-[#C8622A]/20 text-[#C8622A] text-xs font-semibold px-2 py-0.5 rounded-full mt-1">{slaC.tier_name}</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openSLAModal(idx)} className="text-fp-muted hover:text-fp-text text-xs transition-colors">Edit</button>
                  <button onClick={() => removeSLAContract(idx)} className="text-fp-muted hover:text-red-400 text-xs transition-colors">Remove</button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {slaC.response_time_hours && <div className="bg-fp-card rounded-lg p-2"><p className="text-fp-muted text-xs mb-0.5">Response Time</p><p className="text-fp-text text-sm font-semibold">{slaC.response_time_hours} hours</p></div>}
                <div className="bg-fp-card rounded-lg p-2"><p className="text-fp-muted text-xs mb-0.5">Billing</p><p className="text-fp-text text-sm font-semibold">{slaC.billing_frequency}</p></div>
                <div className="bg-fp-card rounded-lg p-2"><p className="text-fp-muted text-xs mb-0.5">Standard Rate</p><p className="text-fp-text text-sm font-semibold">${slaC.labor_rate}/hr</p></div>
                {slaC.emergency_rate && <div className="bg-fp-card rounded-lg p-2"><p className="text-fp-muted text-xs mb-0.5">Emergency Rate</p><p className="text-fp-text text-sm font-semibold">${slaC.emergency_rate}/hr</p></div>}
                {slaC.maintenance_calls_per_year > 0 && <div className="bg-fp-card rounded-lg p-2"><p className="text-fp-muted text-xs mb-0.5">Maintenance/Year</p><p className="text-fp-text text-sm font-semibold">{slaC.maintenance_calls_per_year}</p></div>}
                {slaC.recurring_fee > 0 && <div className="bg-fp-card rounded-lg p-2"><p className="text-fp-muted text-xs mb-0.5">Recurring Fee</p><p className="text-fp-text text-sm font-semibold">${slaC.recurring_fee}/{slaC.billing_frequency}</p></div>}
                {slaC.initial_fee > 0 && <div className="bg-fp-card rounded-lg p-2"><p className="text-fp-muted text-xs mb-0.5">Initial Fee</p><p className="text-fp-text text-sm font-semibold">${slaC.initial_fee} <span className="text-fp-muted font-normal text-xs">w/ job</span></p></div>}
                {slaC.start_date && <div className="bg-fp-card rounded-lg p-2"><p className="text-fp-muted text-xs mb-0.5">Term</p><p className="text-fp-text text-sm font-semibold">{new Date(slaC.start_date).toLocaleDateString()} – {slaC.end_date ? new Date(slaC.end_date).toLocaleDateString() : 'TBD'}</p></div>}
                {slaC.auto_renew && <div className="bg-fp-card rounded-lg p-2"><p className="text-fp-muted text-xs mb-0.5">Auto-Renew</p><p className="text-green-400 text-sm font-semibold">Yes</p></div>}
              </div>
              {slaC.body && (
                <div className="border-t border-fp-border pt-3">
                  <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-2">Contract Language</p>
                  <p className="text-fp-text text-xs leading-relaxed whitespace-pre-wrap">{slaC.body
                    .replace(/\{\{companyName\}\}/g, profile?.company_name || proposal?.company || '')
                    .replace(/\{\{clientName\}\}/g, proposal?.company || '')
                    .replace(/\{\{proposalName\}\}/g, proposal?.proposal_name || '')
                    .replace(/\{\{tierName\}\}/g, slaC.tier_name || slaC.name || '')
                    .replace(/\{\{responseTime\}\}/g, slaC.response_time_hours ? `${slaC.response_time_hours} hours` : 'as scheduled')
                    .replace(/\{\{billingFrequency\}\}/g, slaC.billing_frequency || 'Quarterly')
                    .replace(/\{\{laborRate\}\}/g, `${slaC.labor_rate || 100}`)
                    .replace(/\{\{emergencyRate\}\}/g, `${slaC.emergency_rate || 150}`)
                    .replace(/\{\{maintenanceCalls\}\}/g, `${slaC.maintenance_calls_per_year || 0}`)
                    .replace(/\{\{initialFee\}\}/g, `${slaC.initial_fee || 0}`)
                    .replace(/\{\{recurringFee\}\}/g, `${slaC.recurring_fee || 0}`)
                  }</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
