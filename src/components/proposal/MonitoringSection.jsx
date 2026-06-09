export default function MonitoringSection({ orgSLASettings, monitoringContracts, profile, proposal, openMonitoringModal, removeMonitoringContract }) {
  if (!orgSLASettings?.feature_monitoring) return null

  return (
    <div className="bg-[#1a2d45] rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <span className="text-lg">📡</span>
          <h3 className="text-white font-bold text-lg">Monitoring Contracts</h3>
          {monitoringContracts.length > 0 && <span className="bg-green-500/20 text-green-400 text-xs font-semibold px-2 py-0.5 rounded-full">{monitoringContracts.length} attached</span>}
        </div>
        <button onClick={() => openMonitoringModal(null)} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
          + Add Monitoring Contract
        </button>
      </div>
      {monitoringContracts.length === 0 ? (
        <p className="text-[#8A9AB0] text-sm">No monitoring contracts attached. Click "Add Monitoring Contract" to add one.</p>
      ) : (
        <div className="space-y-4">
          {monitoringContracts.map((monC, idx) => (
            <div key={idx} className="bg-[#0F1C2E] rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-start">
                <p className="text-white font-semibold">{monC.name || 'Monitoring Contract'}</p>
                <div className="flex gap-2">
                  <button onClick={() => openMonitoringModal(idx)} className="text-[#8A9AB0] hover:text-white text-xs transition-colors">Edit</button>
                  <button onClick={() => removeMonitoringContract(idx)} className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors">Remove</button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div className="bg-[#1a2d45] rounded-lg p-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Monthly Fee</p><p className="text-white text-sm font-semibold">${monC.monthly_fee}/mo</p></div>
                <div className="bg-[#1a2d45] rounded-lg p-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Billing</p><p className="text-white text-sm font-semibold">{monC.billing_frequency}</p></div>
                <div className="bg-[#1a2d45] rounded-lg p-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Escalation Contacts</p><p className="text-white text-sm font-semibold">{monC.escalation_contacts}</p></div>
                {monC.monitored_systems && <div className="bg-[#1a2d45] rounded-lg p-2 col-span-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Monitored Systems</p><p className="text-white text-sm">{monC.monitored_systems}</p></div>}
                {monC.start_date && <div className="bg-[#1a2d45] rounded-lg p-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Term</p><p className="text-white text-sm font-semibold">{new Date(monC.start_date).toLocaleDateString()} – {monC.end_date ? new Date(monC.end_date).toLocaleDateString() : 'TBD'}</p></div>}
                {monC.auto_renew && <div className="bg-[#1a2d45] rounded-lg p-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Auto-Renew</p><p className="text-green-400 text-sm font-semibold">Yes</p></div>}
              </div>
              {monC.body && (
                <div className="border-t border-[#2a3d55] pt-3">
                  <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Contract Language</p>
                  <p className="text-[#D6E4F0] text-xs leading-relaxed whitespace-pre-wrap">{monC.body
                    .replace(/\{\{companyName\}\}/g, profile?.company_name || proposal?.company || '')
                    .replace(/\{\{clientName\}\}/g, proposal?.company || '')
                    .replace(/\{\{proposalName\}\}/g, proposal?.proposal_name || '')
                    .replace(/\{\{monthlyFee\}\}/g, `${monC.monthly_fee || 49}`)
                    .replace(/\{\{monitoredSystems\}\}/g, monC.monitored_systems || '')
                    .replace(/\{\{billingFrequency\}\}/g, monC.billing_frequency || 'Monthly')
                    .replace(/\{\{escalationContacts\}\}/g, `${monC.escalation_contacts || 2}`)
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
