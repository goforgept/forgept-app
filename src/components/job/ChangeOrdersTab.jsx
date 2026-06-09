const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ChangeOrdersTab({ changeOrders, totalCOAmount, onOpenCOModal, onUpdateCOStatus }) {
  return (
    <div className="bg-[#1a2d45] rounded-xl p-6">
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-white font-bold text-lg">Change Orders</h3>
        <button onClick={onOpenCOModal}
          className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
          + New Change Order
        </button>
      </div>
      {changeOrders.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-[#2a3d55] rounded-xl">
          <p className="text-[#8A9AB0]">No change orders yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {changeOrders.map(co => (
            <div key={co.id} className="bg-[#0F1C2E] rounded-xl p-4 border border-[#2a3d55]">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-white font-semibold">{co.name}</p>
                  {co.description && <p className="text-[#8A9AB0] text-sm mt-0.5">{co.description}</p>}
                  <p className="text-[#C8622A] font-bold mt-1">${fmt(co.amount)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded font-semibold ${co.status === 'Approved' ? 'bg-green-500/20 text-green-400' : co.status === 'Rejected' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    {co.status}
                  </span>
                  {co.status === 'Pending' && (
                    <div className="flex gap-1">
                      <button onClick={() => onUpdateCOStatus(co.id, 'Approved')}
                        className="bg-green-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-green-700 transition-colors">Approve</button>
                      <button onClick={() => onUpdateCOStatus(co.id, 'Rejected')}
                        className="bg-red-600/30 text-red-400 px-3 py-1 rounded text-xs font-semibold hover:bg-red-600/50 transition-colors">Reject</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {totalCOAmount > 0 && (
            <div className="flex justify-between items-center pt-3 border-t border-[#2a3d55]">
              <span className="text-[#8A9AB0] font-semibold">Approved Change Orders Total</span>
              <span className="text-[#C8622A] font-bold text-lg">+${fmt(totalCOAmount)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
