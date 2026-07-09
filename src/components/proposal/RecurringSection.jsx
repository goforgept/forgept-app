export default function RecurringSection({ proposal, lineItems, renewalDates, saveRenewalDate }) {
  if (proposal?.status !== 'Won' || !lineItems.some(l => l.recurring)) return null

  return (
    <div className="bg-fp-card border border-[#C8622A]/30 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[#C8622A] text-lg">🔄</span>
        <h3 className="text-fp-text font-bold">Recurring Line Items</h3>
      </div>
      <div className="space-y-2">
        {lineItems.filter(l => l.recurring).map(item => (
          <div key={item.id} className="flex justify-between items-center bg-fp-inset rounded-lg px-4 py-3">
            <div>
              <p className="text-fp-text text-sm font-medium">{item.item_name}</p>
              <p className="text-fp-muted text-xs">${(item.customer_price_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} / renewal</p>
            </div>
            <div className="flex items-center gap-3">
              {item.renewal_date
                ? <span className="text-[#C8622A] text-xs font-semibold">Renews {new Date(item.renewal_date).toLocaleDateString()}</span>
                : <span className="text-yellow-400 text-xs">⚠ Set renewal date</span>}
              <input type="date" value={renewalDates[item.id] || item.renewal_date || ''} onChange={e => saveRenewalDate(item.id, e.target.value)}
                className="bg-fp-inset text-fp-text border border-fp-border rounded px-2 py-1 text-xs focus:outline-none focus:border-fp-brand" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
