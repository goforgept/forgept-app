export default function RenewalDateModal({ pendingRenewalItems, pendingRenewalDates, setPendingRenewalDates, savingRenewal, onSave, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
        <div className="w-12 h-12 rounded-full bg-[#C8622A]/20 flex items-center justify-center mx-auto mb-4"><span className="text-2xl">🔄</span></div>
        <h3 className="text-white font-bold text-lg mb-1 text-center">Set Renewal Dates</h3>
        <p className="text-[#8A9AB0] text-sm mb-5 text-center">This deal has recurring items. Set a renewal date for each so ForgePt. can notify you and auto-generate renewal proposals.</p>
        <div className="space-y-3 mb-5">
          {pendingRenewalItems.map(item => (
            <div key={item.id} className="bg-[#0F1C2E] rounded-lg px-4 py-3">
              <div className="flex justify-between items-center">
                <div><p className="text-white text-sm font-medium">{item.item_name}</p><p className="text-[#8A9AB0] text-xs">${(item.customer_price_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} / renewal</p></div>
                <input type="date" value={pendingRenewalDates[item.id] || ''} onChange={e => setPendingRenewalDates(prev => ({ ...prev, [item.id]: e.target.value }))}
                  className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#C8622A]" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Skip for now</button>
          <button onClick={onSave} disabled={savingRenewal} className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">{savingRenewal ? 'Saving...' : 'Save Renewal Dates'}</button>
        </div>
      </div>
    </div>
  )
}
