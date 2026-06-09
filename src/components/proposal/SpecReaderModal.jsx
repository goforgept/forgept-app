export default function SpecReaderModal({ specFile, setSpecFile, specPageFrom, setSpecPageFrom, specPageTo, setSpecPageTo, analyzingSpec, specSummary, onAnalyze, onClose }) {
  const fileSizeMB = specFile ? (specFile.size / 1024 / 1024).toFixed(1) : 0
  const isPDF = specFile?.type === 'application/pdf'
  const isLarge = specFile && specFile.size > 5 * 1024 * 1024

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <h3 className="text-white font-bold text-lg mb-1">📋 Spec Reader</h3>
        <p className="text-[#8A9AB0] text-sm mb-5">Upload the relevant section of a spec document and AI will extract manufacturers, compliance requirements, submittals, and scope notes.</p>
        <div className="space-y-4">
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Upload Spec Document (PDF or image)</label>
            <input type="file" accept=".pdf,image/jpeg,image/png"
              onChange={e => setSpecFile(e.target.files[0] || null)}
              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            {specFile && (
              <p className={`text-xs mt-1 ${isLarge ? 'text-yellow-400' : 'text-[#8A9AB0]'}`}>
                {specFile.name} — {fileSizeMB} MB
                {isLarge && ' · Large file — use the page range below to limit what gets sent'}
              </p>
            )}
          </div>

          {isPDF && (
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">
                Page range <span className="text-[#8A9AB0] font-normal">— optional, but strongly recommended for large specs</span>
              </label>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <input type="number" min="1" value={specPageFrom} onChange={e => setSpecPageFrom(e.target.value)}
                    placeholder="From page"
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
                <span className="text-[#8A9AB0] text-sm">to</span>
                <div className="flex-1">
                  <input type="number" min="1" value={specPageTo} onChange={e => setSpecPageTo(e.target.value)}
                    placeholder="To page"
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
              </div>
              <p className="text-[#8A9AB0] text-xs mt-1">Only the specified pages will be extracted and sent for analysis. Leave blank to send the full file.</p>
            </div>
          )}

          <button onClick={onAnalyze} disabled={analyzingSpec || !specFile}
            className="bg-purple-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">
            {analyzingSpec ? '📋 Reading Spec...' : '📋 Read Spec'}
          </button>

          {specSummary && (
            <div className="space-y-4">
              {specSummary.flags?.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                  <p className="text-red-400 font-semibold text-sm mb-2">⚠ Flags — Review Carefully</p>
                  {specSummary.flags.map((f, i) => <p key={i} className="text-red-300 text-xs mb-1">• {f}</p>)}
                </div>
              )}
              {specSummary.manufacturers?.length > 0 && (
                <div className="bg-[#0F1C2E] rounded-xl p-4">
                  <p className="text-white font-semibold text-sm mb-2">Approved Manufacturers</p>
                  {specSummary.manufacturers.map((m, i) => (
                    <div key={i} className="mb-2">
                      <p className="text-[#C8622A] text-xs font-semibold">{m.category}</p>
                      <p className="text-white text-xs">{m.approved?.join(', ')}</p>
                      {m.notes && <p className="text-[#8A9AB0] text-xs italic">{m.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
              {specSummary.compliance?.length > 0 && (
                <div className="bg-[#0F1C2E] rounded-xl p-4">
                  <p className="text-white font-semibold text-sm mb-2">Compliance & Codes</p>
                  {specSummary.compliance.map((c, i) => <p key={i} className="text-[#8A9AB0] text-xs mb-1">• {c}</p>)}
                </div>
              )}
              {specSummary.scope_notes?.length > 0 && (
                <div className="bg-[#0F1C2E] rounded-xl p-4">
                  <p className="text-white font-semibold text-sm mb-2">Scope Notes</p>
                  {specSummary.scope_notes.map((s, i) => <p key={i} className="text-[#8A9AB0] text-xs mb-1">• {s}</p>)}
                </div>
              )}
              {specSummary.submittals?.length > 0 && (
                <div className="bg-[#0F1C2E] rounded-xl p-4">
                  <p className="text-white font-semibold text-sm mb-2">Submittals Required</p>
                  {specSummary.submittals.map((s, i) => <p key={i} className="text-[#8A9AB0] text-xs mb-1">• {s}</p>)}
                </div>
              )}
              {specSummary.installation?.length > 0 && (
                <div className="bg-[#0F1C2E] rounded-xl p-4">
                  <p className="text-white font-semibold text-sm mb-2">Installation Standards</p>
                  {specSummary.installation.map((s, i) => <p key={i} className="text-[#8A9AB0] text-xs mb-1">• {s}</p>)}
                </div>
              )}
              {specSummary.testing?.length > 0 && (
                <div className="bg-[#0F1C2E] rounded-xl p-4">
                  <p className="text-white font-semibold text-sm mb-2">Testing & Commissioning</p>
                  {specSummary.testing.map((s, i) => <p key={i} className="text-[#8A9AB0] text-xs mb-1">• {s}</p>)}
                </div>
              )}
              {specSummary.warranty?.length > 0 && (
                <div className="bg-[#0F1C2E] rounded-xl p-4">
                  <p className="text-white font-semibold text-sm mb-2">Warranty Requirements</p>
                  {specSummary.warranty.map((s, i) => <p key={i} className="text-[#8A9AB0] text-xs mb-1">• {s}</p>)}
                </div>
              )}
              {specSummary.exclusions?.length > 0 && (
                <div className="bg-[#0F1C2E] rounded-xl p-4">
                  <p className="text-white font-semibold text-sm mb-2">Exclusions</p>
                  {specSummary.exclusions.map((s, i) => <p key={i} className="text-[#8A9AB0] text-xs mb-1">• {s}</p>)}
                </div>
              )}
              <p className="text-green-400 text-xs">✓ Spec summary saved to this proposal</p>
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
