export default function BomSection({
  proposalId,
  proposal,
  orgType,
  features,
  lineItems,
  sections,
  rfqRequests,
  renewalDates,
  categories,
  vendors,
  saving,
  editingBOM,
  editLines, setEditLines,
  editSections, setEditSections,
  laborItems, setLaborItems,
  bulkSelectedLines, setBulkSelectedLines,
  bulkField, setBulkField,
  bulkValue, setBulkValue,
  librarySearch, setLibrarySearch,
  showLibrarySearch, setShowLibrarySearch,
  libraryLoading,
  libraryResults, setLibraryResults,
  librarySelectedVendor, setLibrarySelectedVendor,
  librarySelectedItems, setLibrarySelectedItems,
  selectedForPO, setSelectedForPO,
  onStartEditing,
  onCancelEditing,
  onSaveBOM,
  onAddLibraryItems,
  onSearchLibrary,
  onToggleRecurring,
  onSaveRenewalDate,
  onOpenRFQModal,
  onAddSection,
  onUpdateSection,
  onDeleteSection,
  onUpdateEditLine,
  onApplyBulkEdit,
  onUpdateLabor,
  onUpdateSectionLabor,
  onAddSectionLaborLine,
  onRemoveSectionLaborLine,
  onExcelUpload,
  onOpenCatalogSearch,
  onOpenOrderModal,
  onOpenPOModal,
  onOpenAIBOMModal,
  onOpenDrawingModal,
  onOpenSpecModal,
  onOpenSaveTemplateModal,
  onLoadTemplate,
  onMoveLineToSection,
  onDeleteRFQ,
  fmt,
  featureMsrp = false,
  canEdit = true,
  laborRates = [],
  defaultMarkup = 35,
}) {
  return (
    <div className="bg-[#1a2d45] rounded-xl p-6">
      {canEdit && <div className="mb-4 relative">
        <input
          type="text"
          placeholder="🔍 Search product library..."
          value={librarySearch}
          onChange={e => { setShowLibrarySearch(true); onSearchLibrary(e.target.value) }}
          onFocus={() => setShowLibrarySearch(true)}
          className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]"
        />
        {librarySearch && (
          <button onClick={() => { setLibrarySearch(''); setLibraryResults([]); setShowLibrarySearch(false) }}
            className="absolute right-3 top-2.5 text-[#8A9AB0] hover:text-white text-lg leading-none">×</button>
        )}
        {showLibrarySearch && (libraryLoading || libraryResults.length > 0) && (
          <div className="absolute top-full left-0 right-0 z-40 bg-[#1a2d45] border border-[#2a3d55] rounded-xl mt-1 max-h-96 overflow-y-auto shadow-2xl">
            {libraryLoading ? (
              <p className="text-[#8A9AB0] text-sm p-4">Searching...</p>
            ) : (
              <>
                <div className="p-3 space-y-1">
                  {libraryResults.map(prod => {
                    const prices = (prod.product_library_pricing || []).sort((a, b) => a.your_cost - b.your_cost)
                    const selected = librarySelectedVendor[prod.id] || prices[0]
                    const isChecked = librarySelectedItems.has(prod.id)
                    return (
                      <div key={prod.id}
                        className={`rounded-lg p-3 border transition-colors cursor-pointer ${isChecked ? 'border-[#C8622A] bg-[#C8622A]/5' : 'border-[#2a3d55] hover:border-[#3a4d65]'}`}
                        onClick={() => setLibrarySelectedItems(prev => { const next = new Set(prev); next.has(prod.id) ? next.delete(prod.id) : next.add(prod.id); return next })}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <input type="checkbox" checked={isChecked} readOnly className="accent-[#C8622A] mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-white text-sm font-semibold truncate">{prod.item_name}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {prod.manufacturer && <span className="text-[#8A9AB0] text-xs">{prod.manufacturer}</span>}
                                {prod.part_number && <span className="text-[#8A9AB0] text-xs font-mono bg-[#0F1C2E] px-1.5 py-0.5 rounded">{prod.part_number}</span>}
                                {prod.category && <span className="text-[#8A9AB0] text-xs">{prod.category}</span>}
                                {prod._fromCatalog && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">{prod._catalogLabel}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 text-right" onClick={e => e.stopPropagation()}>
                            {prod._fromCatalog ? (
                              <div>
                                {prod.msrp && <p className="text-[#8A9AB0] text-xs">MSRP ${Number(prod.msrp).toFixed(2)}</p>}
                                <span className="text-xs text-yellow-400">Add pricing in library</span>
                              </div>
                            ) : prices.length === 0 ? (
                              <span className="text-[#2a3d55] text-xs">No pricing</span>
                            ) : prices.length === 1 ? (
                              <div>
                                <p className="text-[#C8622A] text-sm font-semibold">${Number(prices[0].your_cost).toFixed(2)}</p>
                                <p className="text-[#8A9AB0] text-xs">{prices[0].vendor}</p>
                                {(() => { const days = prices[0].pricing_date ? Math.floor((new Date() - new Date(prices[0].pricing_date)) / (1000 * 60 * 60 * 24)) : null; if (days > 120) return <span className="text-xs text-red-400">⚠ Stale — will RFQ</span>; if (days > 30) return <span className="text-xs text-yellow-400">{days}d old</span>; return <span className="text-xs text-green-400">Current</span> })()}
                              </div>
                            ) : (
                              <div>
                                <select
                                  value={selected?.id || ''}
                                  onChange={e => { const picked = prices.find(p => p.id === e.target.value); setLibrarySelectedVendor(prev => ({ ...prev, [prod.id]: picked })) }}
                                  className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A] mb-1"
                                >
                                  {prices.map(p => <option key={p.id} value={p.id}>{p.vendor} — ${Number(p.your_cost).toFixed(2)}</option>)}
                                </select>
                                {(() => {
                                  if (!selected || prices.length < 2) return null
                                  const best = prices[0]
                                  if (best.id === selected.id) return null
                                  const pct = ((selected.your_cost - best.your_cost) / best.your_cost * 100)
                                  if (pct > 5) return null
                                  return <p className="text-blue-400 text-xs">💡 {best.vendor} is {pct.toFixed(1)}% less (${Number(best.your_cost).toFixed(2)})</p>
                                })()}
                                {(() => { const days = selected?.pricing_date ? Math.floor((new Date() - new Date(selected.pricing_date)) / (1000 * 60 * 60 * 24)) : null; if (days > 120) return <span className="text-xs text-red-400 block">⚠ Stale — will RFQ</span>; if (days > 30) return <span className="text-xs text-yellow-400 block">{days}d old</span>; return <span className="text-xs text-green-400 block">Current</span> })()}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {librarySelectedItems.size > 0 && (
                  <div className="border-t border-[#2a3d55] px-4 py-3 flex items-center justify-between sticky bottom-0 bg-[#1a2d45]">
                    <p className="text-[#8A9AB0] text-xs">{librarySelectedItems.size} item{librarySelectedItems.size !== 1 ? 's' : ''} selected</p>
                    <button onClick={onAddLibraryItems} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">Add to BOM →</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>}

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-white font-bold text-lg">BOM Line Items ({lineItems.length})</h3>
        {canEdit && (!editingBOM ? (
          <div className="flex gap-2 flex-wrap">
            {proposal?.status === 'Won' && lineItems.length > 0 && orgType === 'manufacturer' && (
              <button onClick={onOpenOrderModal} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">🏭 Convert to Order</button>
            )}
            {orgType !== 'manufacturer' && (
              <button onClick={() => selectedForPO.size > 0 && onOpenPOModal()}
                disabled={selectedForPO.size === 0}
                title={selectedForPO.size === 0 ? 'Check items below to select for PO' : `Generate PO for ${selectedForPO.size} items`}
                className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {selectedForPO.size > 0 ? `Generate PO (${selectedForPO.size})` : 'Generate PO'}
              </button>
            )}
            {orgType !== 'manufacturer' && (
              <button onClick={onOpenRFQModal} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">Send RFQs</button>
            )}
            <button onClick={onLoadTemplate} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">Load Template</button>
            <button onClick={onOpenSaveTemplateModal} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">Save as Template</button>
            {features.aiBom && (
              <button onClick={onOpenAIBOMModal} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors">✨ AI Build BOM</button>
            )}
            {features.drawingReader && (
              <button onClick={onOpenDrawingModal} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors">📐 Read Drawing</button>
            )}
            {features.specReader && (
              <button onClick={onOpenSpecModal} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors">📋 Read Spec</button>
            )}
            {orgType === 'manufacturer' && (
              <button onClick={onOpenCatalogSearch} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">+ From Catalog</button>
            )}
            <button onClick={onStartEditing} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">Edit BOM</button>
            <label className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors cursor-pointer">
              Upload Excel
              <input type="file" accept=".xlsx,.xls,.csv" onChange={onExcelUpload} className="hidden" />
            </label>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={onCancelEditing} className="px-4 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
            <button onClick={onSaveBOM} disabled={saving} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">{saving ? 'Saving...' : 'Save BOM'}</button>
          </div>
        ))}
      </div>

      {/* RFQ Status */}
      {rfqRequests.length > 0 && (
        <div className="bg-[#1a2d45] rounded-xl p-5 mb-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-bold">RFQ Status</h3>
            <span className="text-[#8A9AB0] text-xs">{rfqRequests.filter(r => r.status === 'responded').length} of {rfqRequests.length} responded</span>
          </div>
          <div className="space-y-3">
            {rfqRequests.map(rfq => {
              const isResponded = rfq.status === 'responded'
              const isExpired = rfq.expires_at && new Date(rfq.expires_at) < new Date() && !isResponded
              const itemCount = rfq.line_item_ids?.length || 0
              return (
                <div key={rfq.id} className={`rounded-xl p-4 border ${
                  isResponded ? 'bg-green-500/10 border-green-500/20' :
                  isExpired ? 'bg-red-500/10 border-red-500/20' :
                  'bg-[#0F1C2E] border-[#2a3d55]'
                }`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-white font-semibold text-sm">{rfq.vendor_name}</p>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          isResponded ? 'bg-green-500/20 text-green-400' :
                          isExpired ? 'bg-red-500/20 text-red-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {isResponded ? '✓ Responded' : isExpired ? '⚠ Expired' : 'Pending'}
                        </span>
                      </div>
                      <p className="text-[#8A9AB0] text-xs">{itemCount} item{itemCount !== 1 ? 's' : ''} · Sent {new Date(rfq.sent_at || rfq.created_at).toLocaleDateString()}</p>
                      {isResponded && rfq.vendor_quote_number && (
                        <p className="text-[#C8622A] text-xs mt-1 font-semibold">Quote # {rfq.vendor_quote_number}</p>
                      )}
                      {isResponded && rfq.vendor_quote_expiry && (
                        <p className="text-[#8A9AB0] text-xs">Expires {new Date(rfq.vendor_quote_expiry).toLocaleDateString()}</p>
                      )}
                      {isResponded && rfq.vendor_notes && (
                        <p className="text-[#8A9AB0] text-xs mt-1 italic">"{rfq.vendor_notes}"</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {!isResponded && rfq.expires_at && (
                        <p className={`text-xs ${isExpired ? 'text-red-400' : 'text-[#8A9AB0]'}`}>
                          {isExpired ? 'Expired' : `Due ${new Date(rfq.expires_at).toLocaleDateString()}`}
                        </p>
                      )}
                      {isResponded && rfq.vendor_response_pdf_url && (
                        <a href={rfq.vendor_response_pdf_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-[#C8622A] hover:text-white transition-colors">
                          View Quote PDF →
                        </a>
                      )}
                      {rfq.token && (
                        <button
                          onClick={() => navigator.clipboard.writeText(`https://app.goforgept.com/rfq-response/${rfq.token}`)}
                          className="text-xs text-[#8A9AB0] hover:text-white transition-colors">
                          Copy Link
                        </button>
                      )}
                      {onDeleteRFQ && (
                        <button
                          onClick={() => onDeleteRFQ(rfq)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors">
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* BOM View Mode */}
      {!editingBOM ? (
        lineItems.length === 0 ? (
          <p className="text-[#8A9AB0]">No line items yet. Click Edit BOM to add items.</p>
        ) : (
          <div className="space-y-6">
            {(() => {
              const ViewTable = ({ items }) => (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#2a3d55]">
                        <th className="py-2 pr-2 w-8">
                          <input type="checkbox" className="accent-[#C8622A]"
                            checked={items.filter(l => !l.po_status || l.po_status === 'Confirmed' || l.po_status === 'Needs Pricing').every(l => selectedForPO.has(l.id)) && items.some(l => !l.po_status || l.po_status === 'Confirmed' || l.po_status === 'Needs Pricing')}
                            onChange={() => {
                              const orderable = items.filter(l => !l.po_status || l.po_status === 'Confirmed' || l.po_status === 'Needs Pricing')
                              const allSelected = orderable.every(l => selectedForPO.has(l.id))
                              setSelectedForPO(prev => {
                                const next = new Set(prev)
                                orderable.forEach(l => allSelected ? next.delete(l.id) : next.add(l.id))
                                return next
                              })
                            }} />
                        </th>
                        <th className="text-[#8A9AB0] text-left py-2 pr-4">Item</th>
                        <th className="text-[#8A9AB0] text-left py-2 pr-4">Mfr</th>
                        <th className="text-[#8A9AB0] text-left py-2 pr-4">Part #</th>
                        <th className="text-[#8A9AB0] text-left py-2 pr-4">Category</th>
                        <th className="text-[#8A9AB0] text-left py-2 pr-4">Vendor</th>
                        <th className="text-[#8A9AB0] text-right py-2 pr-4">Qty</th>
                        <th className="text-[#8A9AB0] text-right py-2 pr-4">Unit Price</th>
                        {featureMsrp && <th className="text-[#8A9AB0] text-right py-2 pr-4">MSRP</th>}
                        <th className="text-[#8A9AB0] text-right py-2 pr-4">Total</th>
                        <th className="text-[#8A9AB0] text-left py-2">Status</th>
                        <th className="text-[#8A9AB0] text-center py-2 pr-2">🔄</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const isOrdered = item.po_status === 'PO Sent' || item.po_status === 'Received'
                        return (
                          <tr key={item.id} className={`border-b border-[#2a3d55]/50 ${selectedForPO.has(item.id) ? 'bg-[#C8622A]/5' : ''}`}>
                            <td className="pr-2 py-3">
                              {!isOrdered && (
                                <input type="checkbox" className="accent-[#C8622A] cursor-pointer"
                                  checked={selectedForPO.has(item.id)}
                                  onChange={() => setSelectedForPO(prev => {
                                    const next = new Set(prev)
                                    next.has(item.id) ? next.delete(item.id) : next.add(item.id)
                                    return next
                                  })} />
                              )}
                            </td>
                            <td className="text-white py-3 pr-4">{item.item_name}</td>
                            <td className="text-[#8A9AB0] py-3 pr-4">{item.manufacturer || '—'}</td>
                            <td className="text-[#8A9AB0] py-3 pr-4">{item.part_number_sku || '—'}</td>
                            <td className="text-[#8A9AB0] py-3 pr-4">{item.category}</td>
                            <td className="text-[#8A9AB0] py-3 pr-4">{item.vendor}</td>
                            <td className="text-white py-3 pr-4 text-right">{item.quantity}</td>
                            <td className="text-white py-3 pr-4 text-right">${fmt(item.customer_price_unit)}</td>
                            {featureMsrp && <td className="text-[#8A9AB0] py-3 pr-4 text-right">{item.msrp_unit ? `$${fmt(item.msrp_unit)}` : '—'}</td>}
                            <td className="text-white py-3 pr-4 text-right">${fmt(item.customer_price_total)}</td>
                            <td className="py-3">
                              <div className="flex flex-col gap-1">
                                <span className={`text-xs font-semibold px-2 py-1 rounded ${item.po_status === 'PO Sent' ? 'bg-blue-500/20 text-blue-400' : item.pricing_status === 'RFQ Sent' ? 'bg-yellow-500/20 text-yellow-400' : item.pricing_status === 'Confirmed' ? 'bg-green-500/20 text-green-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
                                  {item.po_status || item.pricing_status}
                                </span>
                                {item.rfq_expires_at && item.pricing_status === 'RFQ Sent' && (() => {
                                  const expired = new Date(item.rfq_expires_at) < new Date()
                                  return expired ? <span className="text-xs font-semibold px-2 py-1 rounded bg-red-500/20 text-red-400">⚠ Pricing Expired</span> : <span className="text-xs px-2 py-0.5 rounded bg-[#2a3d55] text-[#8A9AB0]">Exp {new Date(item.rfq_expires_at).toLocaleDateString()}</span>
                                })()}
                              </div>
                            </td>
                            <td className="py-3 pr-2 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <input type="checkbox" checked={!!item.recurring} onChange={() => onToggleRecurring(item.id, !!item.recurring)} className="accent-[#C8622A] cursor-pointer" title="Mark as recurring" />
                                {item.recurring && proposal?.status === 'Won' && (
                                  <input type="date" value={renewalDates[item.id] || item.renewal_date || ''} onChange={e => onSaveRenewalDate(item.id, e.target.value)}
                                    className="bg-[#0F1C2E] text-[#C8622A] border border-[#C8622A]/40 rounded px-1 py-0.5 text-xs focus:outline-none focus:border-[#C8622A] w-28" />
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )

              const unsectioned = lineItems.filter(l => !l.section_id)
              const materialsTotal = lineItems.reduce((sum, item) => sum + (item.customer_price_total || 0), 0)
              const laborTotal = proposal?.labor_items?.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0) || 0
              const taxRate = (!proposal?.tax_exempt && proposal?.tax_rate) ? parseFloat(proposal.tax_rate) : 0
              const taxAmount = materialsTotal * (taxRate / 100)

              return (
                <>
                  {unsectioned.length > 0 && (
                    <div>
                      {sections.length > 0 && (
                        <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">General</p>
                      )}
                      <ViewTable items={unsectioned} />
                    </div>
                  )}

                  {sections.map(section => {
                    const secItems = lineItems.filter(l => l.section_id === section.id)
                    if (secItems.length === 0 && (!section.labor_items || section.labor_items.length === 0)) return null
                    const secMat = secItems.reduce((s, l) => s + (l.customer_price_total || 0), 0)
                    const secLab = section.include_labor ? (section.labor_items || []).reduce((s, l) => s + (parseFloat(l.customer_price) || 0), 0) : 0
                    const secTotal = secMat + secLab
                    return (
                      <div key={section.id} className="border border-[#2a3d55] rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 bg-[#0F1C2E] border-b border-[#2a3d55]">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-5 rounded-full bg-[#C8622A]" />
                            <span className="text-white font-semibold text-sm">{section.name || 'Untitled Section'}</span>
                          </div>
                          <span className="text-[#8A9AB0] text-xs">Section Total: <span className="text-white font-bold">${secTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></span>
                        </div>
                        <div className="p-4">
                          {secItems.length > 0 && <ViewTable items={secItems} />}
                          {section.include_labor && (section.labor_items || []).filter(l => l.role).length > 0 && (
                            <div className="mt-4 pt-4 border-t border-[#2a3d55]">
                              <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Section Labor</p>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-[#2a3d55]">
                                    {['Role', 'Qty', 'Unit', 'Total'].map(h => <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs">{h}</th>)}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(section.labor_items || []).filter(l => l.role).map((l, i) => (
                                    <tr key={i} className="border-b border-[#2a3d55]/30">
                                      <td className="text-white py-2 pr-4">{l.role}</td>
                                      <td className="text-[#8A9AB0] py-2 pr-4">{l.quantity}</td>
                                      <td className="text-[#8A9AB0] py-2 pr-4">{l.unit || 'hr'}</td>
                                      <td className="text-white py-2 pr-4">${fmt(parseFloat(l.customer_price) || 0)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {proposal?.labor_items?.filter(l => l.role).length > 0 && (
                    <div className="border border-[#2a3d55] rounded-xl overflow-hidden">
                      <div className="px-4 py-3 bg-[#0F1C2E] border-b border-[#2a3d55]">
                        <span className="text-white font-semibold text-sm">Labor</span>
                      </div>
                      <div className="p-4">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[#2a3d55]">
                              {['Role','Qty','Unit','Total'].map(h => <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs">{h}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {proposal.labor_items.filter(l => l.role).map((l, i) => (
                              <tr key={i} className="border-b border-[#2a3d55]/30">
                                <td className="text-white py-2 pr-4">{l.role}</td>
                                <td className="text-[#8A9AB0] py-2 pr-4">{l.quantity}</td>
                                <td className="text-[#8A9AB0] py-2 pr-4">{l.unit || 'hr'}</td>
                                <td className="text-white py-2 pr-4">${fmt(parseFloat(l.customer_price) || 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {(() => {
                    const sectionLaborTotal = sections.reduce((sum, s) => sum + (s.include_labor ? (s.labor_items || []).reduce((ss, l) => ss + (parseFloat(l.customer_price) || 0), 0) : 0), 0)
                    const adjustedGrandTotal = materialsTotal + laborTotal + sectionLaborTotal + taxAmount
                    return (
                      <table className="w-full text-sm">
                        <tfoot>
                          <tr><td colSpan="6" className="text-[#8A9AB0] pt-4 text-right font-semibold">Materials Total</td><td className="text-white pt-4 text-right font-bold pr-4">${materialsTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td></td></tr>
                          {laborTotal > 0 && <tr><td colSpan="6" className="text-[#8A9AB0] pt-1 text-right font-semibold">General Labor</td><td className="text-white pt-1 text-right font-bold pr-4">${laborTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td></td></tr>}
                          {sectionLaborTotal > 0 && <tr><td colSpan="6" className="text-[#8A9AB0] pt-1 text-right font-semibold">Section Labor</td><td className="text-white pt-1 text-right font-bold pr-4">${sectionLaborTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td></td></tr>}
                          {taxRate > 0 && <tr><td colSpan="6" className="text-[#8A9AB0] pt-1 text-right font-semibold">Tax ({taxRate}% on materials)</td><td className="text-white pt-1 text-right font-bold pr-4">${taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td></td></tr>}
                          <tr className="border-t border-[#2a3d55]"><td colSpan="6" className="text-[#8A9AB0] pt-3 text-right font-semibold">Grand Total</td><td className="text-[#C8622A] pt-3 text-right font-bold text-lg pr-4">${adjustedGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td></td></tr>
                        </tfoot>
                      </table>
                    )
                  })()}
                </>
              )
            })()}
          </div>
        )
      ) : (
        /* BOM Edit Mode */
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[#8A9AB0] text-xs">
              {editSections.length > 0 ? `${editSections.length} section${editSections.length !== 1 ? 's' : ''} — items without a section appear in General` : 'No sections — add a section to group items by area or system'}
            </p>
            {canEdit && (
              <button onClick={onAddSection} className="bg-[#2a3d55] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#3a4d65] transition-colors">
                + Add Section
              </button>
            )}
          </div>

          {/* Bulk Edit Bar */}
          <div className="flex items-center gap-2 mb-4 p-3 bg-[#0F1C2E] rounded-lg border border-[#2a3d55] flex-wrap">
            <span className="text-[#8A9AB0] text-xs font-semibold whitespace-nowrap">
              Bulk Edit {bulkSelectedLines.size > 0 ? <span className="text-[#C8622A]">({bulkSelectedLines.size} selected)</span> : <span className="text-[#2a3d55]">(check rows below)</span>}
            </span>
            <select value={bulkField} onChange={e => { setBulkField(e.target.value); setBulkValue('') }}
              className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]">
              <option value="">— Field —</option>
              <option value="manufacturer">Manufacturer</option>
              <option value="category">Category</option>
              <option value="vendor">Vendor</option>
              <option value="markup_percent">Markup %</option>
              {editSections.length > 0 && <option value="section">Move to Section</option>}
            </select>
            {bulkField === 'category' ? (
              <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]">
                <option value="">— Category —</option>
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
            ) : bulkField === 'vendor' ? (
              <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]">
                <option value="">— Vendor —</option>
                {vendors.map(v => <option key={v.id} value={v.vendor_name}>{v.vendor_name}</option>)}
              </select>
            ) : bulkField === 'section' ? (
              <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]">
                <option value="">— Section —</option>
                <option value="general">General (no section)</option>
                {editSections.map(s => <option key={s.id} value={s.id}>{s.name || 'Untitled Section'}</option>)}
              </select>
            ) : (
              <input type={bulkField === 'markup_percent' ? 'number' : 'text'} placeholder={bulkField ? `Enter ${bulkField}` : ''} value={bulkValue} onChange={e => setBulkValue(e.target.value)} disabled={!bulkField}
                className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A] disabled:opacity-40" />
            )}
            <button onClick={onApplyBulkEdit} disabled={!bulkField || !bulkValue || bulkSelectedLines.size === 0}
              className="bg-[#C8622A] text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-40 whitespace-nowrap">
              Apply to Selected
            </button>
            {bulkSelectedLines.size > 0 && (
              <button onClick={() => setBulkSelectedLines(new Set())} className="text-[#8A9AB0] hover:text-white text-xs transition-colors">Clear</button>
            )}
          </div>

          {/* BOM Table */}
          {(() => {
            const BOMTable = ({ sectionId, sectionLabel }) => {
              const sectionLines = editLines
                .map((l, i) => ({ ...l, _idx: i }))
                .filter(l => sectionId === 'general' ? !l.section_id : l.section_id === sectionId)
              return (
                <div className="overflow-x-auto mb-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#2a3d55]">
                        <th className="py-2 pr-2 w-8">
                          <input type="checkbox" className="accent-[#C8622A]"
                            checked={sectionLines.length > 0 && sectionLines.every(l => bulkSelectedLines.has(l.id || l.item_name + l.quantity))}
                            onChange={() => {
                              const keys = sectionLines.map(l => l.id || l.item_name + l.quantity)
                              const allSel = keys.every(k => bulkSelectedLines.has(k))
                              setBulkSelectedLines(prev => {
                                const next = new Set(prev)
                                keys.forEach(k => allSel ? next.delete(k) : next.add(k))
                                return next
                              })
                            }} />
                        </th>
                        {['Item Name', 'Manufacturer', 'Part #', 'Qty', 'Unit', 'Category', 'Vendor', 'Your Cost', 'Markup %', 'Customer Price', ...(featureMsrp ? ['MSRP'] : []), '🔄', ''].map(h => (
                          <th key={h} className="text-[#8A9AB0] text-left py-2 pr-2 font-normal text-xs">{h}</th>
                        ))}
                        {editSections.length > 0 && <th className="text-[#8A9AB0] text-left py-2 pr-2 font-normal text-xs">Move</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {sectionLines.map(line => {
                        const i = line._idx
                        const rowKey = line.id || line.item_name + line.quantity
                        return (
                          <tr key={i} className={`border-b border-[#2a3d55]/30 ${bulkSelectedLines.has(rowKey) ? 'bg-[#C8622A]/5' : ''}`}>
                            <td className="pr-2 py-1">
                              <input type="checkbox" className="accent-[#C8622A] cursor-pointer"
                                checked={bulkSelectedLines.has(rowKey)}
                                onChange={() => setBulkSelectedLines(prev => {
                                  const next = new Set(prev)
                                  next.has(rowKey) ? next.delete(rowKey) : next.add(rowKey)
                                  return next
                                })} />
                            </td>
                            {[['item_name','text','Item name'],['manufacturer','text','Manufacturer'],['part_number_sku','text','Part #'],['quantity','number','Qty']].map(([field,type,placeholder]) => (
                              <td key={field} className="pr-2 py-1">
                                <input type={type} placeholder={placeholder} value={line[field] || ''} onChange={e => onUpdateEditLine(i, field, e.target.value)}
                                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                              </td>
                            ))}
                            <td className="pr-2 py-1">
                              <select value={line.unit || 'ea'} onChange={e => onUpdateEditLine(i, 'unit', e.target.value)} className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                                {['ea','ft','lot','hr','box','roll'].map(u => <option key={u}>{u}</option>)}
                              </select>
                            </td>
                            <td className="pr-2 py-1">
                              <select value={line.category || ''} onChange={e => onUpdateEditLine(i, 'category', e.target.value)} className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                                <option value="">Category</option>
                                {categories.map(c => <option key={c}>{c}</option>)}
                              </select>
                            </td>
                            <td className="pr-2 py-1 min-w-[120px]">
                              <select value={vendors.some(v => v.vendor_name === line.vendor) ? line.vendor : (line.vendor ? '__other__' : '')}
                                onChange={e => onUpdateEditLine(i, 'vendor', e.target.value === '__other__' ? '__custom__' : e.target.value)}
                                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                                <option value="">— Vendor —</option>
                                {vendors.map(v => <option key={v.id} value={v.vendor_name}>{v.vendor_name}</option>)}
                                <option value="__other__">Other...</option>
                              </select>
                              {line.vendor && !vendors.some(v => v.vendor_name === line.vendor) && (
                                <input type="text" placeholder="Vendor name" value={line.vendor === '__custom__' ? '' : line.vendor}
                                  onChange={e => onUpdateEditLine(i, 'vendor', e.target.value || '__custom__')}
                                  className="w-full mt-1 bg-[#0F1C2E] text-white border border-[#C8622A]/40 rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                              )}
                            </td>
                            <td className="pr-2 py-1">
                              <input type="number" placeholder="0.00" value={line.your_cost_unit || ''} onChange={e => onUpdateEditLine(i, 'your_cost_unit', e.target.value)}
                                className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                            </td>
                            <td className="pr-2 py-1">
                              <input type="number" placeholder="35" value={line.markup_percent || ''} onChange={e => onUpdateEditLine(i, 'markup_percent', e.target.value)}
                                className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                            </td>
                            <td className="pr-2 py-1">
                              <input type="number" placeholder="0.00" value={line.customer_price_unit || ''} onChange={e => onUpdateEditLine(i, 'customer_price_unit', e.target.value)}
                                className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                            </td>
                            {featureMsrp && (
                              <td className="pr-2 py-1">
                                <input type="number" placeholder="MSRP" value={line.msrp_unit || ''} onChange={e => onUpdateEditLine(i, 'msrp_unit', e.target.value)}
                                  className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                              </td>
                            )}
                            <td className="py-1 text-center">
                              <input type="checkbox" checked={!!line.recurring} onChange={e => onUpdateEditLine(i, 'recurring', e.target.checked)} className="accent-[#C8622A] cursor-pointer" title="Recurring" />
                            </td>
                            <td className="py-1">
                              <button onClick={() => setEditLines(prev => prev.filter((_, idx) => idx !== i))} className="text-[#8A9AB0] hover:text-red-400 text-xs">✕</button>
                            </td>
                            {editSections.length > 0 && (
                              <td className="py-1">
                                <button onClick={() => onMoveLineToSection(i)}
                                  className="bg-[#2a3d55] hover:bg-[#C8622A]/20 hover:text-[#C8622A] text-[#8A9AB0] text-xs px-2 py-1 rounded transition-colors whitespace-nowrap" title="Move to section">⇄ Move</button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <button onClick={() => setEditLines(prev => [...prev, {
                    proposal_id: proposalId, item_name: '', part_number_sku: '', quantity: '', unit: 'ea', category: '',
                    vendor: '', your_cost_unit: '', markup_percent: '35', customer_price_unit: '', customer_price_total: '', msrp_unit: '',
                    pricing_status: 'Needs Pricing', section_id: sectionId === 'general' ? null : sectionId
                  }])} className="mt-2 text-[#C8622A] hover:text-white text-xs transition-colors">
                    + Add Item{sectionLabel ? ` to ${sectionLabel}` : ''}
                  </button>
                </div>
              )
            }

            return (
              <div className="space-y-6">
                <div>
                  {editSections.length > 0 && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">General</span>
                      <span className="text-[#2a3d55] text-xs">— items not assigned to a section</span>
                    </div>
                  )}
                  {BOMTable({ sectionId: "general", sectionLabel: null })}
                </div>

                {editSections.map(section => (
                  <div key={section.id} className="border border-[#2a3d55] rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-[#0F1C2E] border-b border-[#2a3d55]">
                      <div className="w-1.5 h-6 rounded-full bg-[#C8622A] flex-shrink-0" />
                      <input type="text" value={section.name} onChange={e => onUpdateSection(section.id, 'name', e.target.value)}
                        placeholder="Section name (e.g. Floor 1, Server Room)"
                        className="flex-1 bg-transparent text-white font-semibold text-sm focus:outline-none placeholder-[#2a3d55]" />
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-[#8A9AB0] text-xs">Include Labor</span>
                        <button onClick={() => onUpdateSection(section.id, 'include_labor', !section.include_labor)}
                          className={`w-9 h-5 rounded-full transition-colors relative ${section.include_labor ? 'bg-[#C8622A]' : 'bg-[#2a3d55]'}`}>
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${section.include_labor ? 'left-4' : 'left-0.5'}`} />
                        </button>
                      </label>
                      <button onClick={() => onDeleteSection(section.id)} className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors ml-2">✕ Remove</button>
                    </div>
                    <div className="p-4">
                      {BOMTable({ sectionId: section.id, sectionLabel: section.name || 'this section' })}
                      {section.include_labor && (
                        <div className="mt-4 pt-4 border-t border-[#2a3d55]">
                          <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-3">Section Labor</p>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-[#2a3d55]">
                                {['Role','Qty','Unit','Your Cost/hr','Markup %','Total Labor',''].map(h => (
                                  <th key={h} className="text-[#8A9AB0] text-left py-2 pr-2 font-normal text-xs">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(section.labor_items || []).map((item, idx) => (
                                <tr key={idx} className="border-b border-[#2a3d55]/30">
                                  <td className="pr-2 py-1"><input type="text" placeholder="Role" list="labor-roles-list" value={item.role || ''} onChange={e => onUpdateSectionLabor(section.id, idx, 'role', e.target.value)} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                                  <td className="pr-2 py-1"><input type="number" placeholder="0" value={item.quantity || ''} onChange={e => onUpdateSectionLabor(section.id, idx, 'quantity', e.target.value)} className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                                  <td className="pr-2 py-1">
                                    <select value={item.unit || 'hr'} onChange={e => onUpdateSectionLabor(section.id, idx, 'unit', e.target.value)} className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                                      {['hr','day','lot'].map(u => <option key={u}>{u}</option>)}
                                    </select>
                                  </td>
                                  <td className="pr-2 py-1"><input type="number" placeholder="0.00" value={item.your_cost || ''} onChange={e => onUpdateSectionLabor(section.id, idx, 'your_cost', e.target.value)} className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                                  <td className="pr-2 py-1"><input type="number" placeholder="35" value={item.markup || ''} onChange={e => onUpdateSectionLabor(section.id, idx, 'markup', e.target.value)} className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                                  <td className="pr-2 py-1"><input type="number" placeholder="0.00" value={item.customer_price || ''} onChange={e => onUpdateSectionLabor(section.id, idx, 'customer_price', e.target.value)} className="w-20 bg-[#0F1C2E] text-[#C8622A] border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A] font-semibold" /></td>
                                  <td className="py-1"><button onClick={() => onRemoveSectionLaborLine(section.id, idx)} className="text-[#8A9AB0] hover:text-red-400 text-xs">✕</button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <button onClick={() => onAddSectionLaborLine(section.id)} className="mt-2 text-[#C8622A] hover:text-white text-xs transition-colors">+ Add Labor</button>
                        </div>
                      )}
                      {(() => {
                        const secLines = editLines.filter(l => l.section_id === section.id)
                        const secMat = secLines.reduce((s,l) => s+((parseFloat(l.customer_price_unit)||0)*(parseFloat(l.quantity)||0)),0)
                        const secLab = section.include_labor ? (section.labor_items||[]).reduce((s,l) => s+(parseFloat(l.customer_price)||0),0) : 0
                        const secCostMat = secLines.reduce((s,l) => s+((parseFloat(l.your_cost_unit)||0)*(parseFloat(l.quantity)||0)),0)
                        const secCostLab = section.include_labor ? (section.labor_items||[]).reduce((s,l) => s+((parseFloat(l.your_cost)||0)*(parseFloat(l.quantity)||0)),0) : 0
                        const secTotal = secMat + secLab
                        const secCost = secCostMat + secCostLab
                        const secMargin = secTotal > 0 ? ((secTotal-secCost)/secTotal*100).toFixed(1) : '0.0'
                        return (
                          <div className="flex justify-between items-center mt-3 pt-3 border-t border-[#2a3d55] text-xs">
                            <div className="flex gap-4">
                              <span className="text-[#8A9AB0]">Materials: <span className="text-white font-semibold">${secMat.toLocaleString('en-US',{minimumFractionDigits:2})}</span></span>
                              {section.include_labor && secLab > 0 && <span className="text-[#8A9AB0]">Labor: <span className="text-white font-semibold">${secLab.toLocaleString('en-US',{minimumFractionDigits:2})}</span></span>}
                              <span className="text-[#8A9AB0]">Margin: <span className="text-[#C8622A] font-semibold">{secMargin}%</span></span>
                            </div>
                            <span className="text-[#8A9AB0]">Section Total: <span className="text-white font-bold">${secTotal.toLocaleString('en-US',{minimumFractionDigits:2})}</span></span>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Labor Section */}
          <div className="mt-8">
            <h3 className="text-white font-bold text-base mb-3">Labor</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a3d55]">
                  {['Role', 'Qty (hrs)', 'Unit', 'Your Cost/hr', 'Markup %', 'Total Labor', ''].map(h => (
                    <th key={h} className="text-[#8A9AB0] text-left py-2 pr-2 font-normal text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {laborItems.map((item, index) => (
                  <tr key={index} className="border-b border-[#2a3d55]/30">
                    <td className="pr-2 py-1">
                      <input type="text" placeholder="e.g. Electrician" list="labor-roles-list" value={item.role} onChange={e => onUpdateLabor(index, 'role', e.target.value)} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                    </td>
                    <td className="pr-2 py-1"><input type="number" placeholder="0" value={item.quantity || ''} onChange={e => onUpdateLabor(index, 'quantity', e.target.value)} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                    <td className="pr-2 py-1">
                      <select value={item.unit || 'hr'} onChange={e => onUpdateLabor(index, 'unit', e.target.value)} className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                        {['hr', 'day', 'lot'].map(u => <option key={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="pr-2 py-1"><input type="number" placeholder="0.00" value={item.your_cost || ''} onChange={e => onUpdateLabor(index, 'your_cost', e.target.value)} className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                    <td className="pr-2 py-1"><input type="number" placeholder="35" value={item.markup || ''} onChange={e => onUpdateLabor(index, 'markup', e.target.value)} className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                    <td className="pr-2 py-1"><input type="number" placeholder="0.00" value={item.customer_price || ''} onChange={e => onUpdateLabor(index, 'customer_price', e.target.value)} className="w-20 bg-[#0F1C2E] text-[#C8622A] border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A] font-semibold" /></td>
                    <td className="py-1">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setLaborItems(prev => prev.filter((_, i) => i !== index))} className="text-[#8A9AB0] hover:text-red-400 text-xs">✕</button>
                        {editSections.length > 0 && (
                          <select
                            value=""
                            onChange={e => {
                              if (!e.target.value) return
                              const targetId = e.target.value
                              const laborLine = laborItems[index]
                              setEditSections(prev => prev.map(s => s.id === targetId
                                ? { ...s, include_labor: true, labor_items: [...(s.labor_items || []), { ...laborLine }] }
                                : s
                              ))
                              setLaborItems(prev => prev.filter((_, i) => i !== index))
                            }}
                            className="bg-[#1a2d45] text-[#8A9AB0] hover:text-white border border-[#2a3d55] rounded px-2 py-0.5 text-xs focus:outline-none focus:border-[#C8622A] cursor-pointer"
                          >
                            <option value="">→ Section</option>
                            {editSections.map(s => <option key={s.id} value={s.id}>{s.name || 'Untitled'}</option>)}
                          </select>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="5" className="text-[#8A9AB0] pt-3 text-right font-semibold text-xs">Total Labor</td>
                  <td className="text-[#C8622A] pt-3 font-bold pr-2">${laborItems.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
            <datalist id="labor-roles-list">
              {laborRates.map(r => <option key={r.role} value={r.role} />)}
            </datalist>
            <button onClick={() => setLaborItems(prev => [...prev, { role: '', quantity: '', unit: 'hr', your_cost: '', markup: defaultMarkup, customer_price: 0 }])} className="mt-4 text-[#C8622A] hover:text-white text-sm transition-colors">+ Add Labor</button>
          </div>

          {/* Live running total */}
          <div className="mt-6 border-t border-[#2a3d55] pt-4 space-y-2">
            {(() => {
              const liveBOMTotal = editLines.reduce((sum, l) => sum + ((parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
              const liveLaborTotal = laborItems.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
              const liveTaxRate = (!proposal?.tax_exempt && proposal?.tax_rate) ? parseFloat(proposal.tax_rate) : 0
              const liveTaxAmount = liveBOMTotal * (liveTaxRate / 100)
              const liveGrandTotal = liveBOMTotal + liveLaborTotal + liveTaxAmount
              const liveBOMCost = editLines.reduce((sum, l) => sum + ((parseFloat(l.your_cost_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
              const liveLaborCost = laborItems.reduce((sum, l) => sum + ((parseFloat(l.your_cost) || 0) * (parseFloat(l.quantity) || 0)), 0)
              const liveTotalCost = liveBOMCost + liveLaborCost
              const liveMargin = liveGrandTotal > 0 ? ((liveGrandTotal - liveTotalCost) / liveGrandTotal * 100).toFixed(1) : '0.0'
              return (
                <>
                  <div className="flex justify-between text-sm"><span className="text-[#8A9AB0]">Materials</span><span className="text-white">${liveBOMTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-[#8A9AB0]">Labor</span><span className="text-white">${liveLaborTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                  {liveTaxRate > 0 && <div className="flex justify-between text-sm"><span className="text-[#8A9AB0]">Tax ({liveTaxRate}% on materials)</span><span className="text-white">${liveTaxAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>}
                  <div className="flex justify-between text-base font-bold border-t border-[#2a3d55] pt-2"><span className="text-white">Grand Total</span><span className="text-[#C8622A]">${liveGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-[#8A9AB0]">Gross Margin</span><span className="text-[#C8622A] font-semibold">{liveMargin}%</span></div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
