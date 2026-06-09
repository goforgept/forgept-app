const AUTO_CHECK_TYPES = [
  { type: 'proposal_signed', label: 'Proposal signed', icon: '✍️' },
  { type: 'po_generated', label: 'Materials ordered (PO generated)', icon: '📦' },
  { type: 'parts_received', label: 'Materials received', icon: '✅' },
  { type: 'invoice_sent', label: 'Invoice sent', icon: '🧾' },
  { type: 'payment_received', label: 'Payment received', icon: '💰' },
  { type: 'email_sent', label: 'Client notified', icon: '✉️' },
  { type: 'scheduled', label: 'Job scheduled', icon: '📅' },
  { type: 'photos_uploaded', label: 'Site photos uploaded', icon: '📷' },
]

export default function ChecklistTab({ checklist, lineItems, newCheckItem, setNewCheckItem, savingCheck, onToggleItem, onAddItem, onDeleteItem }) {
  return (
    <div className="bg-[#1a2d45] rounded-xl p-6">
      <h3 className="text-white font-bold text-lg mb-5">Job Checklist</h3>
      <div className="space-y-2 mb-6">
        {checklist.map(item => {
          const autoType = AUTO_CHECK_TYPES.find(a => a.type === item.auto_check_type)
          const isPartiallyOrdered = item.auto_check_type === 'po_generated' && !item.completed &&
            lineItems.some(l => l.po_status === 'PO Sent' || l.po_status === 'Received') &&
            !lineItems.every(l => l.po_status === 'PO Sent' || l.po_status === 'Received')
          return (
            <div key={item.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${item.completed ? 'bg-green-500/5 border-green-500/20' : isPartiallyOrdered ? 'bg-yellow-500/5 border-yellow-500/20' : 'bg-[#0F1C2E] border-[#2a3d55]'}`}>
              <button onClick={() => onToggleItem(item)} disabled={item.is_auto}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${item.completed ? 'bg-green-500 border-green-500' : isPartiallyOrdered ? 'border-yellow-500' : 'border-[#2a3d55] hover:border-[#C8622A]'} ${item.is_auto ? 'cursor-default' : 'cursor-pointer'}`}>
                {item.completed && <span className="text-white text-xs">✓</span>}
                {isPartiallyOrdered && <span className="text-yellow-400 text-xs">–</span>}
              </button>
              <div className="flex-1">
                <p className={`text-sm font-medium ${item.completed ? 'text-green-400 line-through' : isPartiallyOrdered ? 'text-yellow-400' : 'text-white'}`}>
                  {autoType ? `${autoType.icon} ` : ''}{item.label}
                </p>
                {item.completed && item.completed_at && (
                  <p className="text-[#8A9AB0] text-xs mt-0.5">Completed {new Date(item.completed_at).toLocaleDateString()}</p>
                )}
                {isPartiallyOrdered && (
                  <p className="text-yellow-500/70 text-xs mt-0.5">
                    {lineItems.filter(l => l.po_status === 'PO Sent' || l.po_status === 'Received').length} of {lineItems.length} lines ordered
                  </p>
                )}
              </div>
              {item.is_auto && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${isPartiallyOrdered ? 'text-yellow-400 bg-yellow-500/10' : 'text-[#8A9AB0] bg-[#2a3d55]'}`}>
                  {isPartiallyOrdered ? 'Partially Ordered' : 'Auto'}
                </span>
              )}
              {!item.is_auto && (
                <button onClick={() => onDeleteItem(item.id)} className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors">✕</button>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex gap-2 border-t border-[#2a3d55] pt-4">
        <input type="text" value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onAddItem()}
          placeholder="Add a custom checklist item..."
          className="flex-1 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]" />
        <button onClick={onAddItem} disabled={savingCheck || !newCheckItem.trim()}
          className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">Add</button>
      </div>
    </div>
  )
}
