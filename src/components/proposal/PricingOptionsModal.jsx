export default function PricingOptionsModal({ proposal, onToggleHideMaterialPrices, onToggleLaborBreakdown, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-white font-bold text-lg mb-1">⚙ Pricing Options</h3>
        <p className="text-[#8A9AB0] text-sm mb-5">Controls what clients see on PDF, DOCX, and the signing page. Internal view always shows full detail.</p>
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-[#0F1C2E] rounded-xl px-4 py-3">
            <div>
              <p className="text-white text-sm font-semibold">Hide Material Unit Prices</p>
              <p className="text-[#8A9AB0] text-xs mt-0.5">Show item names and qty only — no unit price or line total</p>
            </div>
            <button onClick={onToggleHideMaterialPrices}
              className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${proposal?.hide_material_prices ? 'bg-[#C8622A]' : 'bg-[#2a3d55]'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${proposal?.hide_material_prices ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between bg-[#0F1C2E] rounded-xl px-4 py-3">
            <div>
              <p className="text-white text-sm font-semibold">Hide Labor Breakdown</p>
              <p className="text-[#8A9AB0] text-xs mt-0.5">Show Role, Qty, Total only — no hourly rate</p>
            </div>
            <button onClick={onToggleLaborBreakdown}
              className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${proposal?.hide_labor_breakdown ? 'bg-[#C8622A]' : 'bg-[#2a3d55]'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${proposal?.hide_labor_breakdown ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
        </div>
        <button onClick={onClose} className="mt-5 w-full py-2 bg-[#C8622A] text-white rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">Done</button>
      </div>
    </div>
  )
}
