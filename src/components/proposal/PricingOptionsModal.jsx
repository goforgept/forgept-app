export default function PricingOptionsModal({ proposal, onToggleHideMaterialPrices, onToggleLaborBreakdown, onToggleShowMsrp, featureMsrp, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-fp-card rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-fp-text font-bold text-lg mb-1">⚙ Pricing Options</h3>
        <p className="text-fp-muted text-sm mb-5">Controls what clients see on PDF, DOCX, and the signing page. Internal view always shows full detail.</p>
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-fp-inset rounded-xl px-4 py-3">
            <div>
              <p className="text-fp-text text-sm font-semibold">Hide Material Unit Prices</p>
              <p className="text-fp-muted text-xs mt-0.5">Show item names and qty only — no unit price or line total</p>
            </div>
            <button onClick={onToggleHideMaterialPrices}
              className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${proposal?.hide_material_prices ? 'bg-[#C8622A]' : 'bg-fp-inset'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${proposal?.hide_material_prices ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between bg-fp-inset rounded-xl px-4 py-3">
            <div>
              <p className="text-fp-text text-sm font-semibold">Hide Labor Breakdown</p>
              <p className="text-fp-muted text-xs mt-0.5">Show Role, Qty, Total only — no hourly rate</p>
            </div>
            <button onClick={onToggleLaborBreakdown}
              className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${proposal?.hide_labor_breakdown ? 'bg-[#C8622A]' : 'bg-fp-inset'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${proposal?.hide_labor_breakdown ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
          {featureMsrp && (
            <div className="flex items-center justify-between bg-fp-inset rounded-xl px-4 py-3">
              <div>
                <p className="text-fp-text text-sm font-semibold">Show MSRP</p>
                <p className="text-fp-muted text-xs mt-0.5">Show MSRP column in BOM and on PDF</p>
              </div>
              <button onClick={onToggleShowMsrp}
                className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${proposal?.show_msrp ? 'bg-[#C8622A]' : 'bg-fp-inset'}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${proposal?.show_msrp ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          )}
        </div>
        <button onClick={onClose} className="mt-5 w-full py-2 bg-fp-brand text-white rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">Done</button>
      </div>
    </div>
  )
}
