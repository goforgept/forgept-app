export default function ConvertToOrderModal({ lineItems, orderAutoNumber, setOrderAutoNumber, orderNumber, setOrderNumber, orderExpectedShip, setOrderExpectedShip, clientAddress, creatingOrder, onCreate, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-fp-card rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-fp-text font-bold text-lg mb-1">Convert to Manufacturer Order</h3>
        <p className="text-fp-muted text-sm mb-5">Create an order from this proposal's BOM to track fulfillment.</p>
        <div className="space-y-4">
          <div className="bg-fp-inset rounded-lg p-3 max-h-48 overflow-y-auto">
            <p className="text-fp-muted text-xs mb-2">{lineItems.length} item{lineItems.length !== 1 ? 's' : ''} to fulfill</p>
            {lineItems.map(item => <div key={item.id} className="flex justify-between text-xs py-1 border-b border-fp-border/30"><span className="text-fp-text">{item.item_name}</span><span className="text-fp-muted">Qty: {item.quantity}</span></div>)}
            <div className="flex justify-between text-xs pt-2 font-semibold"><span className="text-fp-muted">Order Value</span><span className="text-[#C8622A]">${lineItems.reduce((sum, l) => sum + (l.customer_price_total || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
          </div>
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Order Number</label>
            <div className="flex gap-2 mb-2">
              <button onClick={() => setOrderAutoNumber(true)} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${orderAutoNumber ? 'bg-fp-brand text-white' : 'bg-fp-inset text-fp-muted hover:text-fp-text'}`}>Auto-Generate</button>
              <button onClick={() => setOrderAutoNumber(false)} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${!orderAutoNumber ? 'bg-fp-brand text-white' : 'bg-fp-inset text-fp-muted hover:text-fp-text'}`}>Enter Manually</button>
            </div>
            {!orderAutoNumber && <input type="text" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="e.g. ORD-2026-001" className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />}
          </div>
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Expected Ship Date (optional)</label>
            <input type="date" value={orderExpectedShip} onChange={e => setOrderExpectedShip(e.target.value)} className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
          </div>
          {clientAddress && <div className="bg-fp-inset rounded-lg px-4 py-3 text-xs text-fp-muted"><p className="text-fp-text font-medium mb-0.5">Ship to:</p><p>{clientAddress}</p></div>}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
            <button onClick={onCreate} disabled={creatingOrder || (!orderAutoNumber && !orderNumber)} className="flex-1 bg-fp-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">{creatingOrder ? 'Creating...' : 'Create Order'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
