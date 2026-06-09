export default function RFQModal({ lineItems, rfqVendorData, setRfqVendorData, sendingRFQs, onSend, onClose }) {
  const needsPricing = lineItems.filter(l => l.pricing_status === 'Needs Pricing' && l.vendor)
  const byVendor = needsPricing.reduce((acc, item) => {
    const vendor = item.vendor || 'Unknown Vendor'
    if (!acc[vendor]) acc[vendor] = []
    acc[vendor].push(item)
    return acc
  }, {})

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <h3 className="text-white font-bold text-lg mb-1">Send RFQs</h3>
        <p className="text-[#8A9AB0] text-sm mb-5">Verify vendor emails and choose delivery options for each vendor.</p>
        <div className="space-y-4">
          {Object.entries(byVendor).map(([vendorName, items]) => (
            <div key={vendorName} className="bg-[#0F1C2E] rounded-xl p-4">
              <div className="flex justify-between items-start mb-3">
                <div><p className="text-white font-semibold text-sm">{vendorName}</p><p className="text-[#8A9AB0] text-xs">{items.length} item{items.length !== 1 ? 's' : ''}</p></div>
              </div>
              <div className="mb-3 space-y-1">
                {items.map(item => (
                  <div key={item.id} className="flex justify-between text-xs py-0.5">
                    <span className="text-[#8A9AB0]">{item.item_name}</span>
                    <div className="flex gap-3 text-[#8A9AB0]">
                      {item.manufacturer && <span className="text-[#C8622A]">{item.manufacturer}</span>}
                      <span>Qty: {item.quantity}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mb-2">
                <label className="text-[#8A9AB0] text-xs mb-1 block">Vendor Email</label>
                <input type="email" value={rfqVendorData[vendorName]?.email || ''} onChange={e => setRfqVendorData(prev => ({ ...prev, [vendorName]: { ...prev[vendorName], email: e.target.value } }))} placeholder="vendor@company.com" className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={rfqVendorData[vendorName]?.attachExcel || false} onChange={e => setRfqVendorData(prev => ({ ...prev, [vendorName]: { ...prev[vendorName], attachExcel: e.target.checked } }))} className="accent-[#C8622A]" />
                <span className="text-[#8A9AB0] text-xs">Attach Excel spreadsheet for pricing</span>
              </label>
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
          <button onClick={onSend} disabled={sendingRFQs || !Object.values(rfqVendorData).some(v => v.email)}
            className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
            {sendingRFQs ? 'Sending...' : `Send ${Object.values(rfqVendorData).filter(v => v.email).length} RFQ${Object.values(rfqVendorData).filter(v => v.email).length !== 1 ? 's' : ''} →`}
          </button>
        </div>
      </div>
    </div>
  )
}
