export default function ContractStartDateModal({ pendingContractItems, pendingContractDates, setPendingContractDates, savingContractDates, onSave, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
        <div className="w-12 h-12 rounded-full bg-[#C8622A]/20 flex items-center justify-center mx-auto mb-4"><span className="text-2xl">📋</span></div>
        <h3 className="text-white font-bold text-lg mb-1 text-center">Set Contract Start Dates</h3>
        <p className="text-[#8A9AB0] text-sm mb-5 text-center">Set a start date for each agreement. End date will be auto-set to 1 year later.</p>
        <div className="space-y-3 mb-5">
          {pendingContractItems.map(item => (
            <div key={`${item._type}_${item._idx}`} className="bg-[#0F1C2E] rounded-lg px-4 py-3">
              <div className="flex justify-between items-center gap-3">
                <div>
                  <p className="text-white text-sm font-medium">{item.name || (item._type === 'sla' ? 'Service Agreement' : 'Monitoring Contract')}</p>
                  <p className="text-[#8A9AB0] text-xs capitalize">{item._type}</p>
                </div>
                <input type="date" value={pendingContractDates[`${item._type}_${item._idx}`] || ''}
                  onChange={e => setPendingContractDates(prev => ({ ...prev, [`${item._type}_${item._idx}`]: e.target.value }))}
                  className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#C8622A]" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Skip for now</button>
          <button onClick={onSave} disabled={savingContractDates} className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
            {savingContractDates ? 'Saving...' : 'Save Start Dates'}
          </button>
        </div>
      </div>
    </div>
  )
}
