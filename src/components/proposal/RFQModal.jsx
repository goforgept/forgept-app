export default function RFQModal({ lineItems, rfqVendorData, setRfqVendorData, sendingRFQs, onSend, onClose }) {
  const byVendor = lineItems.reduce((acc, item) => {
    const vendor = item.vendor || 'Unknown Vendor'
    if (!acc[vendor]) acc[vendor] = []
    acc[vendor].push(item)
    return acc
  }, {})

  const addCompetingVendor = (vendorName) => {
    setRfqVendorData(prev => ({
      ...prev,
      [vendorName]: {
        ...prev[vendorName],
        competing: [...(prev[vendorName]?.competing || []), { name: '', email: '' }],
      }
    }))
  }

  const updateCompeting = (vendorName, idx, field, value) => {
    setRfqVendorData(prev => {
      const competing = [...(prev[vendorName]?.competing || [])]
      competing[idx] = { ...competing[idx], [field]: value }
      return { ...prev, [vendorName]: { ...prev[vendorName], competing } }
    })
  }

  const removeCompeting = (vendorName, idx) => {
    setRfqVendorData(prev => {
      const competing = (prev[vendorName]?.competing || []).filter((_, i) => i !== idx)
      return { ...prev, [vendorName]: { ...prev[vendorName], competing } }
    })
  }

  const totalSends = Object.entries(rfqVendorData).reduce((sum, [, v]) => {
    const primary = v.email ? 1 : 0
    const extra = (v.competing || []).filter(c => c.email).length
    return sum + primary + extra
  }, 0)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <h3 className="text-white font-bold text-lg mb-1">Send RFQs</h3>
        <p className="text-[#8A9AB0] text-sm mb-5">Verify vendor emails and add competing vendors to receive the same items.</p>
        <div className="space-y-4">
          {Object.entries(byVendor).map(([vendorName, items]) => (
            <div key={vendorName} className="bg-[#0F1C2E] rounded-xl p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-white font-semibold text-sm">{vendorName}</p>
                  <p className="text-[#8A9AB0] text-xs">{items.length} item{items.length !== 1 ? 's' : ''}</p>
                </div>
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

              {/* Primary vendor email */}
              <div className="mb-2">
                <label className="text-[#8A9AB0] text-xs mb-1 block">Vendor Email</label>
                <input type="email" value={rfqVendorData[vendorName]?.email || ''}
                  onChange={e => setRfqVendorData(prev => ({ ...prev, [vendorName]: { ...prev[vendorName], email: e.target.value } }))}
                  placeholder="vendor@company.com"
                  className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
              </div>

              {/* Competing vendors */}
              {(rfqVendorData[vendorName]?.competing || []).map((cv, idx) => (
                <div key={idx} className="mt-3 pl-3 border-l-2 border-[#C8622A]/30 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[#C8622A] text-xs font-semibold">Competing vendor {idx + 1}</span>
                    <button onClick={() => removeCompeting(vendorName, idx)} className="text-[#4a5d75] hover:text-red-400 text-xs transition-colors">✕ Remove</button>
                  </div>
                  <input type="text" value={cv.name} onChange={e => updateCompeting(vendorName, idx, 'name', e.target.value)}
                    placeholder="Vendor name"
                    className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#C8622A]" />
                  <input type="email" value={cv.email} onChange={e => updateCompeting(vendorName, idx, 'email', e.target.value)}
                    placeholder="competing@vendor.com"
                    className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
              ))}

              <div className="flex items-center justify-between mt-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={rfqVendorData[vendorName]?.attachExcel || false}
                    onChange={e => setRfqVendorData(prev => ({ ...prev, [vendorName]: { ...prev[vendorName], attachExcel: e.target.checked } }))}
                    className="accent-[#C8622A]" />
                  <span className="text-[#8A9AB0] text-xs">Attach Excel</span>
                </label>
                <button onClick={() => addCompetingVendor(vendorName)}
                  className="text-xs text-[#C8622A] hover:text-white transition-colors">
                  + Add competing vendor
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
          <button onClick={onSend} disabled={sendingRFQs || totalSends === 0}
            className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
            {sendingRFQs ? 'Sending...' : `Send ${totalSends} RFQ${totalSends !== 1 ? 's' : ''} →`}
          </button>
        </div>
      </div>
    </div>
  )
}
