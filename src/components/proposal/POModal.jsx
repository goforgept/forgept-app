export default function POModal({ lineItems, selectedForPO, poVendorEmail, setPOVendorEmail, poAutoNumber, setPOAutoNumber, poNumber, setPONumber, generatingPO, onGenerate, onClose }) {
  const selectedItems = lineItems.filter(l => selectedForPO.has(l.id))
  const vendorNames = [...new Set(selectedItems.map(i => i.vendor).filter(Boolean))]
  const poTotal = selectedItems.reduce((sum, i) => sum + ((i.your_cost_unit || 0) * (i.quantity || 0)), 0)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-white font-bold text-lg mb-4">Generate Purchase Order</h3>
        <div className="space-y-4">
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Vendor Email <span className="font-normal text-[#8A9AB0]">(optional — for your records)</span></label>
            {vendorNames.length > 0 && <p className="text-[#8A9AB0] text-xs mb-1">Vendors: {vendorNames.join(', ')}</p>}
            <input type="email" value={poVendorEmail} onChange={e => setPOVendorEmail(e.target.value)} placeholder="vendor@company.com"
              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
          </div>
          <div>
            <label className="text-[#8A9AB0] text-xs mb-2 block">PO Number</label>
            <div className="flex gap-2 mb-2">
              <button onClick={() => setPOAutoNumber(true)} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${poAutoNumber ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'}`}>Auto-Generate</button>
              <button onClick={() => setPOAutoNumber(false)} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${!poAutoNumber ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'}`}>Enter Manually</button>
            </div>
            {!poAutoNumber && <input type="text" value={poNumber} onChange={e => setPONumber(e.target.value)} placeholder="e.g. PO-2026-001"
              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />}
          </div>
          <div className="bg-[#0F1C2E] rounded-lg p-3">
            <p className="text-[#8A9AB0] text-xs mb-2">{selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} · Your cost: ${poTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {selectedItems.map(item => (
                <div key={item.id} className="flex justify-between text-xs py-0.5">
                  <span className="text-white">{item.item_name}</span>
                  <span className="text-[#8A9AB0]">{item.vendor ? `${item.vendor} · ` : ''}Qty: {item.quantity} {item.unit}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
            <button onClick={onGenerate} disabled={generatingPO || selectedItems.length === 0 || (!poAutoNumber && !poNumber)}
              className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {generatingPO ? 'Generating...' : `Generate PO (${selectedItems.length} items)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
