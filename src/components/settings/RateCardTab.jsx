export default function RateCardTab({ laborRates, setLaborRates, form, setForm, orgServiceSettings, setOrgServiceSettings, orgTaxRate, setOrgTaxRate, savingRates, onSave }) {
  return (
    <div className="space-y-6">
      {/* Labor Rates */}
      <div className="bg-fp-card rounded-xl p-6">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="text-fp-text font-bold text-lg">Labor Rates</h3>
            <p className="text-fp-muted text-sm mt-0.5">Set your cost and bill rates per role. These auto-populate in proposals and service tickets.</p>
          </div>
          <button onClick={() => setLaborRates(prev => [...prev, { id: crypto.randomUUID(), role: '', cost_per_hour: '', bill_rate_per_hour: '', unit: 'hr' }])}
            className="text-fp-brand text-sm hover:text-fp-text transition-colors">+ Add Role</button>
        </div>
        {laborRates.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-fp-border rounded-xl">
            <p className="text-fp-muted">No labor rates set yet.</p>
            <p className="text-fp-muted text-sm mt-1">Add roles to auto-populate labor in proposals and service tickets.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-fp-border">
                  <th className="text-fp-muted text-left py-2 pr-4 font-normal">Role</th>
                  <th className="text-fp-muted text-left py-2 pr-4 font-normal">Unit</th>
                  <th className="text-fp-muted text-left py-2 pr-4 font-normal">Your Cost</th>
                  <th className="text-fp-muted text-left py-2 pr-4 font-normal">Bill Rate</th>
                  <th className="text-fp-muted text-left py-2 pr-4 font-normal">Margin %</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {laborRates.map((rate, i) => {
                  const cost = parseFloat(rate.cost_per_hour) || 0
                  const bill = parseFloat(rate.bill_rate_per_hour) || 0
                  const margin = bill > 0 ? (((bill - cost) / bill) * 100).toFixed(1) : '—'
                  return (
                    <tr key={rate.id || i} className="border-b border-fp-border/50">
                      <td className="py-2 pr-4">
                        <input type="text" value={rate.role} placeholder="e.g. Lead Tech"
                          onChange={e => setLaborRates(prev => prev.map((r, idx) => idx === i ? { ...r, role: e.target.value } : r))}
                          className="bg-fp-inset text-fp-text border border-fp-border rounded px-2 py-1 text-sm focus:outline-none focus:border-fp-brand w-44" />
                      </td>
                      <td className="py-2 pr-4">
                        <select value={rate.unit || 'hr'}
                          onChange={e => setLaborRates(prev => prev.map((r, idx) => idx === i ? { ...r, unit: e.target.value } : r))}
                          className="bg-fp-inset text-fp-text border border-fp-border rounded px-2 py-1 text-sm focus:outline-none focus:border-fp-brand">
                          {['hr', 'day', 'lot'].map(u => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1">
                          <span className="text-fp-muted text-sm">$</span>
                          <input type="number" min="0" step="0.01" value={rate.cost_per_hour} placeholder="0.00"
                            onChange={e => setLaborRates(prev => prev.map((r, idx) => idx === i ? { ...r, cost_per_hour: e.target.value } : r))}
                            className="bg-fp-inset text-fp-text border border-fp-border rounded px-2 py-1 text-sm focus:outline-none focus:border-fp-brand w-24" />
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1">
                          <span className="text-fp-muted text-sm">$</span>
                          <input type="number" min="0" step="0.01" value={rate.bill_rate_per_hour} placeholder="0.00"
                            onChange={e => setLaborRates(prev => prev.map((r, idx) => idx === i ? { ...r, bill_rate_per_hour: e.target.value } : r))}
                            className="bg-fp-inset text-fp-text border border-fp-border rounded px-2 py-1 text-sm focus:outline-none focus:border-fp-brand w-24" />
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`text-sm font-semibold ${parseFloat(margin) >= 30 ? 'text-green-400' : parseFloat(margin) >= 15 ? 'text-fp-brand' : bill > 0 ? 'text-red-400' : 'text-fp-muted'}`}>
                          {margin}{margin !== '—' ? '%' : ''}
                        </span>
                      </td>
                      <td className="py-2">
                        <button onClick={() => setLaborRates(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-fp-muted hover:text-red-400 text-sm transition-colors">✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pricing Defaults */}
      <div className="bg-fp-card rounded-xl p-6">
        <h3 className="text-fp-text font-bold text-lg mb-2">Pricing Defaults</h3>
        <p className="text-fp-muted text-sm mb-5">Applied as defaults to all new proposals. Both can be overridden per proposal.</p>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-fp-muted text-sm w-36">Default Markup</label>
            <input type="number" min="0" max="200" value={form.default_markup_percent}
              onChange={e => setForm(prev => ({ ...prev, default_markup_percent: e.target.value }))}
              className="bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand w-24" />
            <span className="text-fp-muted text-sm">%</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-fp-muted text-sm w-36">Default Tax Rate</label>
            <input type="number" min="0" max="100" step="0.01" placeholder="e.g. 8.5" value={orgTaxRate}
              onChange={e => setOrgTaxRate(e.target.value)}
              className="bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand w-24" />
            <span className="text-fp-muted text-sm">%</span>
          </div>
        </div>
      </div>

      {/* Service Billing */}
      <div className="bg-fp-card rounded-xl p-6">
        <h3 className="text-fp-text font-bold text-lg mb-2">Service Billing</h3>
        <p className="text-fp-muted text-sm mb-5">How do you bill for service calls? These defaults apply to all new service tickets.</p>
        <div className="space-y-5">
          <div>
            <label className="text-fp-muted text-xs mb-2 block">Billing Mode</label>
            <div className="flex gap-2 flex-wrap">
              {[{ value: 'trip_fee', label: 'Trip Fee' }, { value: 'drive_time', label: 'Drive Time' }, { value: 'both', label: 'Both' }, { value: 'none', label: 'Neither' }].map(opt => (
                <button key={opt.value}
                  onClick={() => setOrgServiceSettings(prev => ({ ...prev, service_billing_mode: opt.value }))}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${orgServiceSettings.service_billing_mode === opt.value ? 'bg-fp-brand text-white' : 'bg-fp-inset text-fp-muted hover:text-fp-text'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {(orgServiceSettings.service_billing_mode === 'trip_fee' || orgServiceSettings.service_billing_mode === 'both') && (
            <div className="flex items-center gap-3">
              <label className="text-fp-muted text-sm w-40">Default Trip Fee</label>
              <span className="text-fp-muted text-sm">$</span>
              <input type="number" min="0" step="0.01" value={orgServiceSettings.trip_fee_default} placeholder="0.00"
                onChange={e => setOrgServiceSettings(prev => ({ ...prev, trip_fee_default: e.target.value }))}
                className="bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand w-28" />
            </div>
          )}
          {(orgServiceSettings.service_billing_mode === 'drive_time' || orgServiceSettings.service_billing_mode === 'both') && (
            <div className="flex items-center gap-3">
              <label className="text-fp-muted text-sm w-40">Drive Time Rate</label>
              <span className="text-fp-muted text-sm">$</span>
              <input type="number" min="0" step="0.01" value={orgServiceSettings.drive_time_rate_default} placeholder="0.00"
                onChange={e => setOrgServiceSettings(prev => ({ ...prev, drive_time_rate_default: e.target.value }))}
                className="bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand w-28" />
              <span className="text-fp-muted text-sm">/ hr</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={onSave} disabled={savingRates}
          className="bg-fp-brand text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
          {savingRates ? 'Saving...' : 'Save Rate Card'}
        </button>
      </div>
    </div>
  )
}
