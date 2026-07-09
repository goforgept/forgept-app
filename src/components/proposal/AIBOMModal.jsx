export default function AIBOMModal({ aiBOMPrompt, setAIBOMPrompt, generatingBOM, aiBOMPreview, setAIBOMPreview, onGenerate, onApply, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-fp-card rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <h3 className="text-fp-text font-bold text-lg mb-1">✨ AI BOM Builder</h3>
        <p className="text-fp-muted text-sm mb-5">Describe the system or project and AI will generate a complete parts list. You'll review before adding.</p>
        <div className="space-y-4">
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Describe the system you need</label>
            <textarea value={aiBOMPrompt} onChange={e => setAIBOMPrompt(e.target.value)} rows={3}
              placeholder="e.g. 8 camera outdoor commercial security system with NVR, remote access, and PoE switch. No specific brands."
              className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none" />
          </div>
          <button onClick={onGenerate} disabled={generatingBOM || !aiBOMPrompt.trim()} className="bg-purple-600 text-fp-text px-5 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">
            {generatingBOM ? '✨ Building BOM...' : '✨ Generate BOM'}
          </button>
          {aiBOMPreview.length > 0 && (
            <div>
              <p className="text-fp-text text-sm font-semibold mb-2">{aiBOMPreview.length} items generated — review before adding</p>
              <div className="bg-fp-inset rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-fp-border"><th className="text-fp-muted text-left py-2 px-3 font-normal">Item</th><th className="text-fp-muted text-right py-2 px-3 font-normal">Qty</th><th className="text-fp-muted text-left py-2 px-3 font-normal">Unit</th><th className="text-fp-muted text-left py-2 px-3 font-normal">Category</th><th className="py-2 px-3"></th></tr></thead>
                  <tbody>
                    {aiBOMPreview.map((item, i) => (
                      <tr key={i} className="border-b border-fp-border/30">
                        <td className="text-fp-text py-2 px-3">{item.item_name}</td><td className="text-fp-muted py-2 px-3 text-right">{item.quantity}</td><td className="text-fp-muted py-2 px-3">{item.unit}</td><td className="text-fp-muted py-2 px-3">{item.category}</td>
                        <td className="py-2 px-3"><button onClick={() => setAIBOMPreview(prev => prev.filter((_, idx) => idx !== i))} className="text-fp-muted hover:text-red-400 transition-colors text-base leading-none">×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-fp-muted text-xs mt-2">Items will be added to your BOM in Edit mode. Add your costs and markup after.</p>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
            {aiBOMPreview.length > 0 && (
              <button onClick={onApply} className="flex-1 bg-fp-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">Add {aiBOMPreview.length} Items to BOM →</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
