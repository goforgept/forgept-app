export default function PricingOptionsModal({ proposal, onToggleHideMaterialPrices, onToggleLaborBreakdown, onToggleLumpSumLabor, onToggleShowMsrp, featureMsrp, onToggleShowCompliance, featureComplianceFields, onToggleShowWarranty, hasWarranty, onToggleShowTerms, hasTerms, onClose }) {
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
          <div className="flex items-center justify-between bg-fp-inset rounded-xl px-4 py-3">
            <div>
              <p className="text-fp-text text-sm font-semibold">Lump Sum Labor</p>
              <p className="text-fp-muted text-xs mt-0.5">Collapse all labor into a single line with the combined total</p>
            </div>
            <button onClick={onToggleLumpSumLabor}
              className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${proposal?.lump_sum_labor ? 'bg-[#C8622A]' : 'bg-fp-inset'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${proposal?.lump_sum_labor ? 'left-6' : 'left-1'}`} />
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
          {featureComplianceFields && (
            <div className="flex items-center justify-between bg-fp-inset rounded-xl px-4 py-3">
              <div>
                <p className="text-fp-text text-sm font-semibold">Show Compliance Columns</p>
                <p className="text-fp-muted text-xs mt-0.5">Show Lead Time, COO, and Berry Amendment in BOM and on PDF</p>
              </div>
              <button onClick={onToggleShowCompliance}
                className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${proposal?.show_compliance ? 'bg-[#C8622A]' : 'bg-fp-inset'}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${proposal?.show_compliance ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          )}
          {hasTerms && (
            <div className="flex items-center justify-between bg-fp-inset rounded-xl px-4 py-3">
              <div>
                <p className="text-fp-text text-sm font-semibold">Show Terms & Conditions</p>
                <p className="text-fp-muted text-xs mt-0.5">Include T&C page on PDF and DOCX</p>
              </div>
              <button onClick={onToggleShowTerms}
                className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${proposal?.show_terms !== false ? 'bg-[#C8622A]' : 'bg-fp-inset'}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${proposal?.show_terms !== false ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          )}
          {hasWarranty && (
            <div className="flex items-center justify-between bg-fp-inset rounded-xl px-4 py-3">
              <div>
                <p className="text-fp-text text-sm font-semibold">Show Warranty</p>
                <p className="text-fp-muted text-xs mt-0.5">Include warranty section on PDF, DOCX, and proposal view</p>
              </div>
              <button onClick={onToggleShowWarranty}
                className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${proposal?.show_warranty !== false ? 'bg-[#C8622A]' : 'bg-fp-inset'}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${proposal?.show_warranty !== false ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          )}
        </div>
        <button onClick={onClose} className="mt-5 w-full py-2 bg-fp-brand text-white rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">Done</button>
      </div>
    </div>
  )
}
