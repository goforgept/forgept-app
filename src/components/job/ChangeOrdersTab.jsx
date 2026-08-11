import { useState } from 'react'

const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const statusColors = {
  Approved: 'bg-green-500/20 text-green-400',
  Rejected: 'bg-red-500/20 text-red-400',
  Pending: 'bg-yellow-500/20 text-yellow-400',
}

export default function ChangeOrdersTab({ changeOrders, totalCOAmount, onOpenCOModal, onUpdateCOStatus, onEditCO, onGeneratePDF }) {
  const [expanded, setExpanded] = useState(null)

  return (
    <div className="bg-fp-card rounded-xl p-6">
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-fp-text font-bold text-lg">Change Orders</h3>
        <button onClick={onOpenCOModal}
          className="bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
          + New Change Order
        </button>
      </div>

      {changeOrders.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-fp-border rounded-xl">
          <p className="text-fp-muted">No change orders yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {changeOrders.map((co, idx) => {
            const isExpanded = expanded === co.id
            const matItems = co.line_items || []
            const labItems = co.labor_items || []
            const hasItems = matItems.length > 0 || labItems.length > 0

            return (
              <div key={co.id} className="bg-fp-inset rounded-xl border border-fp-border overflow-hidden">
                {/* Header row */}
                <div className="flex items-start gap-3 p-4">
                  {/* Expand toggle */}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : co.id)}
                    className="mt-0.5 text-fp-muted hover:text-fp-text transition-colors text-sm w-5 shrink-0"
                  >
                    {isExpanded ? '▾' : '▸'}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-fp-text font-semibold leading-tight">
                          CO-{String(idx + 1).padStart(3, '0')} · {co.name}
                        </p>
                        {co.description && (
                          <p className="text-fp-muted text-sm mt-0.5 line-clamp-2">{co.description}</p>
                        )}
                        <p className="text-[#C8622A] font-bold mt-1">${fmt(co.amount)}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs px-2 py-1 rounded font-semibold ${statusColors[co.status] || statusColors.Pending}`}>
                          {co.status}
                        </span>

                        {/* Edit button — always visible */}
                        <button
                          onClick={() => onEditCO(co)}
                          className="text-fp-muted hover:text-fp-text text-xs px-2 py-1 rounded border border-fp-border hover:border-fp-brand transition-colors"
                        >
                          Edit
                        </button>

                        {/* Generate PDF for approval */}
                        <button
                          onClick={() => onGeneratePDF(co, idx + 1)}
                          className="text-fp-muted hover:text-fp-text text-xs px-2 py-1 rounded border border-fp-border hover:border-fp-brand transition-colors"
                          title="Generate customer approval PDF"
                        >
                          PDF
                        </button>

                        {/* Approve / Reject (pending only) */}
                        {co.status === 'Pending' && (
                          <div className="flex gap-1">
                            <button onClick={() => onUpdateCOStatus(co.id, 'Approved')}
                              className="bg-green-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-green-700 transition-colors">
                              Approve
                            </button>
                            <button onClick={() => onUpdateCOStatus(co.id, 'Rejected')}
                              className="bg-red-600/30 text-red-400 px-3 py-1 rounded text-xs font-semibold hover:bg-red-600/50 transition-colors">
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-fp-border px-4 pb-4 pt-3 space-y-4">
                    {co.description && (
                      <div>
                        <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1">Description of Work</p>
                        <p className="text-fp-text text-sm leading-relaxed">{co.description}</p>
                      </div>
                    )}

                    {matItems.length > 0 && (
                      <div>
                        <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-2">Materials</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-fp-border">
                                {['Item', 'Qty', 'Unit', 'Unit Price', 'Total'].map(h => (
                                  <th key={h} className="text-fp-muted text-left py-1.5 pr-3 font-normal">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {matItems.map((line, i) => {
                                const lineTotal = (parseFloat(line.customer_price_unit) || 0) * (parseFloat(line.quantity) || 0)
                                return (
                                  <tr key={i} className="border-b border-fp-border/30">
                                    <td className="pr-3 py-1.5 text-fp-text">{line.item_name || '—'}</td>
                                    <td className="pr-3 py-1.5 text-fp-muted">{line.quantity}</td>
                                    <td className="pr-3 py-1.5 text-fp-muted">{line.unit}</td>
                                    <td className="pr-3 py-1.5 text-fp-muted">${fmt(parseFloat(line.customer_price_unit) || 0)}</td>
                                    <td className="py-1.5 text-fp-text font-medium">${fmt(lineTotal)}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td colSpan="4" className="text-fp-muted text-right pt-2 pr-3 font-semibold">Materials Total</td>
                                <td className="text-[#C8622A] font-bold pt-2">
                                  ${fmt(matItems.reduce((s, l) => s + (parseFloat(l.customer_price_unit)||0)*(parseFloat(l.quantity)||0), 0))}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}

                    {labItems.length > 0 && (
                      <div>
                        <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-2">Labor</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-fp-border">
                                {['Role', 'Qty', 'Unit', 'Total'].map(h => (
                                  <th key={h} className="text-fp-muted text-left py-1.5 pr-3 font-normal">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {labItems.map((labor, i) => (
                                <tr key={i} className="border-b border-fp-border/30">
                                  <td className="pr-3 py-1.5 text-fp-text">{labor.role || '—'}</td>
                                  <td className="pr-3 py-1.5 text-fp-muted">{labor.quantity}</td>
                                  <td className="pr-3 py-1.5 text-fp-muted">{labor.unit}</td>
                                  <td className="py-1.5 text-fp-text font-medium">${fmt(parseFloat(labor.customer_price) || 0)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td colSpan="3" className="text-fp-muted text-right pt-2 pr-3 font-semibold">Labor Total</td>
                                <td className="text-[#C8622A] font-bold pt-2">
                                  ${fmt(labItems.reduce((s, l) => s + (parseFloat(l.customer_price)||0), 0))}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}

                    {!hasItems && !co.description && (
                      <p className="text-fp-muted text-xs italic">No details recorded.</p>
                    )}

                    <div className="flex justify-end pt-1 border-t border-fp-border">
                      <div className="text-right text-xs space-y-0.5">
                        {(() => {
                          const mat = matItems.reduce((s,l) => s+(parseFloat(l.customer_price_unit)||0)*(parseFloat(l.quantity)||0), 0)
                          const lab = labItems.reduce((s,l) => s+(parseFloat(l.customer_price)||0), 0)
                          const sub = mat + lab
                          const tPct = parseFloat(co.tax_percent) || 0
                          const tAmt = sub * tPct / 100
                          return (
                            <>
                              {matItems.length > 0 && labItems.length > 0 && (
                                <p className="text-fp-muted">Subtotal: <span className="text-fp-text">${fmt(sub)}</span></p>
                              )}
                              {tPct > 0 && (
                                <p className="text-fp-muted">Tax ({tPct}%): <span className="text-fp-text">${fmt(tAmt)}</span></p>
                              )}
                              <p className="text-fp-muted">Change Order Total</p>
                              <p className="text-[#C8622A] font-bold text-lg">${fmt(co.amount)}</p>
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {totalCOAmount > 0 && (
            <div className="flex justify-between items-center pt-3 border-t border-fp-border">
              <span className="text-fp-muted font-semibold">Approved Change Orders Total</span>
              <span className="text-[#C8622A] font-bold text-lg">+${fmt(totalCOAmount)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
