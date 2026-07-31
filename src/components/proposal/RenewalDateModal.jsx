import { useState } from 'react'

const FREQUENCIES = ['Monthly', 'Quarterly', 'Annual']

export default function RenewalDateModal({ pendingRenewalItems, pendingRenewalDates, setPendingRenewalDates, savingRenewal, onSave, onClose }) {
  const [frequencies, setFrequencies] = useState(() =>
    Object.fromEntries(pendingRenewalItems.map(i => [i.id, i.billing_frequency || 'Annual']))
  )
  const [autoInvoice, setAutoInvoice] = useState(() =>
    Object.fromEntries(pendingRenewalItems.map(i => [i.id, i.auto_invoice || false]))
  )

  const handleSave = () => {
    onSave({ frequencies, autoInvoice })
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-fp-card rounded-2xl p-6 w-full max-w-lg">
        <div className="w-12 h-12 rounded-full bg-[#C8622A]/20 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">🔄</span>
        </div>
        <h3 className="text-fp-text font-bold text-lg mb-1 text-center">Set Up Recurring Items</h3>
        <p className="text-fp-muted text-sm mb-5 text-center">
          Set the renewal date and billing frequency for each recurring item. Enable auto invoice to have ForgePt send invoices automatically.
        </p>
        <div className="space-y-3 mb-5">
          {pendingRenewalItems.map(item => (
            <div key={item.id} className="bg-fp-inset rounded-lg px-4 py-3 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-fp-text text-sm font-medium">{item.item_name}</p>
                  <p className="text-fp-muted text-xs">${(item.customer_price_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} / renewal</p>
                </div>
                <input
                  type="date"
                  value={pendingRenewalDates[item.id] || ''}
                  onChange={e => setPendingRenewalDates(prev => ({ ...prev, [item.id]: e.target.value }))}
                  className="bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-fp-brand"
                />
              </div>
              <div className="flex items-center gap-3 pt-1 border-t border-fp-border/50">
                <div className="flex items-center gap-2 flex-1">
                  <label className="text-fp-muted text-xs whitespace-nowrap">Billing Frequency</label>
                  <select
                    value={frequencies[item.id] || 'Annual'}
                    onChange={e => setFrequencies(prev => ({ ...prev, [item.id]: e.target.value }))}
                    className="flex-1 bg-fp-card text-fp-text border border-fp-border rounded px-2 py-1 text-xs focus:outline-none focus:border-fp-brand"
                  >
                    {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => setAutoInvoice(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoInvoice[item.id] ? 'bg-green-500' : 'bg-fp-border'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${autoInvoice[item.id] ? 'translate-x-4' : 'translate-x-1'}`} />
                  </button>
                  <span className="text-fp-muted text-xs whitespace-nowrap">Auto Invoice</span>
                </label>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">
            Skip for now
          </button>
          <button
            onClick={handleSave}
            disabled={savingRenewal}
            className="flex-1 bg-fp-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
          >
            {savingRenewal ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
