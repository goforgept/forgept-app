export default function DealSummaryModal({ dealSummary, setDealSummary, generatingDealSummary, onGenerate, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <h3 className="text-white font-bold text-lg mb-1">🧠 Deal Summary</h3>
        <p className="text-[#8A9AB0] text-sm mb-5">AI analyzes your proposal and returns a plain English summary with risk flags and action items.</p>
        <div className="space-y-4">
          {!dealSummary && (
            <button onClick={onGenerate} disabled={generatingDealSummary}
              className="bg-purple-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">
              {generatingDealSummary ? '🧠 Analyzing Deal...' : '🧠 Analyze This Deal'}
            </button>
          )}
          {dealSummary && (
            <div className="space-y-4">
              <div className="bg-[#0F1C2E] rounded-xl p-4 border border-[#C8622A]/30">
                <p className="text-white font-semibold text-sm">{dealSummary.headline}</p>
              </div>
              <div className={`rounded-xl p-4 border ${
                dealSummary.readiness === 'ready' ? 'bg-green-500/10 border-green-500/20' :
                dealSummary.readiness === 'needs_work' ? 'bg-yellow-500/10 border-yellow-500/20' :
                'bg-red-500/10 border-red-500/20'
              }`}>
                <p className={`font-semibold text-sm mb-1 ${
                  dealSummary.readiness === 'ready' ? 'text-green-400' :
                  dealSummary.readiness === 'needs_work' ? 'text-yellow-400' :
                  'text-red-400'
                }`}>
                  {dealSummary.readiness === 'ready' ? '✓ Ready to Send' :
                   dealSummary.readiness === 'needs_work' ? '⚠ Needs Work' :
                   '✗ Incomplete'}
                </p>
                <p className="text-[#8A9AB0] text-xs">{dealSummary.readiness_note}</p>
              </div>
              {dealSummary.strength && (
                <div className="bg-[#0F1C2E] rounded-xl p-4">
                  <p className="text-green-400 font-semibold text-xs mb-1 uppercase tracking-wide">Strength</p>
                  <p className="text-white text-sm">{dealSummary.strength}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {dealSummary.margin_note && (
                  <div className="bg-[#0F1C2E] rounded-xl p-4">
                    <p className="text-[#C8622A] font-semibold text-xs mb-1 uppercase tracking-wide">Margin</p>
                    <p className="text-[#8A9AB0] text-xs">{dealSummary.margin_note}</p>
                  </div>
                )}
                {dealSummary.close_note && (
                  <div className="bg-[#0F1C2E] rounded-xl p-4">
                    <p className="text-[#C8622A] font-semibold text-xs mb-1 uppercase tracking-wide">Close Timeline</p>
                    <p className="text-[#8A9AB0] text-xs">{dealSummary.close_note}</p>
                  </div>
                )}
              </div>
              {dealSummary.risks?.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                  <p className="text-red-400 font-semibold text-xs mb-2 uppercase tracking-wide">Risks</p>
                  {dealSummary.risks.map((r, i) => (
                    <p key={i} className="text-red-300 text-xs mb-1">• {r}</p>
                  ))}
                </div>
              )}
              {dealSummary.actions?.length > 0 && (
                <div className="bg-[#0F1C2E] rounded-xl p-4">
                  <p className="text-white font-semibold text-xs mb-2 uppercase tracking-wide">Action Items</p>
                  {dealSummary.actions.map((a, i) => (
                    <p key={i} className="text-[#8A9AB0] text-xs mb-1">→ {a}</p>
                  ))}
                </div>
              )}
              <button onClick={() => setDealSummary(null)} className="text-[#8A9AB0] hover:text-white text-xs transition-colors">↺ Re-analyze</button>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}
