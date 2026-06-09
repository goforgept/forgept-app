export default function DrawingReaderModal({ drawingFile, setDrawingFile, drawingInstructions, setDrawingInstructions, drawingPreview, setDrawingPreview, analyzingDrawing, onAnalyze, onApply, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <h3 className="text-white font-bold text-lg mb-1">📐 Drawing Reader</h3>
        <p className="text-[#8A9AB0] text-sm mb-5">Upload a floor plan or technical drawing and AI will count devices and build a BOM. You'll review before adding.</p>
        <div className="space-y-4">
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Upload Drawing (PDF or Image)</label>
            <input type="file" accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={e => setDrawingFile(e.target.files[0] || null)}
              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            {drawingFile && <p className="text-[#8A9AB0] text-xs mt-1">{drawingFile.name} — {(drawingFile.size / 1024 / 1024).toFixed(2)} MB</p>}
          </div>
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Instructions — what to look for</label>
            <textarea value={drawingInstructions} onChange={e => setDrawingInstructions(e.target.value)} rows={3}
              placeholder="e.g. Only count cameras and access control readers. Ignore data drops and AV equipment."
              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" />
          </div>
          <button onClick={onAnalyze} disabled={analyzingDrawing || !drawingFile}
            className="bg-purple-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">
            {analyzingDrawing ? '📐 Analyzing Drawing...' : '📐 Analyze Drawing'}
          </button>
          {drawingPreview.length > 0 && (
            <div>
              <p className="text-white text-sm font-semibold mb-2">{drawingPreview.length} items found — review before adding</p>
              <div className="bg-[#0F1C2E] rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#2a3d55]">
                      <th className="text-[#8A9AB0] text-left py-2 px-3 font-normal">Item</th>
                      <th className="text-[#8A9AB0] text-right py-2 px-3 font-normal">Qty</th>
                      <th className="text-[#8A9AB0] text-left py-2 px-3 font-normal">Category</th>
                      <th className="text-[#8A9AB0] text-left py-2 px-3 font-normal">Notes</th>
                      <th className="py-2 px-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {drawingPreview.map((item, i) => (
                      <tr key={i} className="border-b border-[#2a3d55]/30">
                        <td className="text-white py-2 px-3">{item.item_name}</td>
                        <td className="text-[#8A9AB0] py-2 px-3 text-right">{item.quantity}</td>
                        <td className="text-[#8A9AB0] py-2 px-3">{item.category}</td>
                        <td className="text-[#8A9AB0] py-2 px-3 text-xs italic">{item.notes}</td>
                        <td className="py-2 px-3"><button onClick={() => setDrawingPreview(prev => prev.filter((_, idx) => idx !== i))} className="text-[#8A9AB0] hover:text-red-400 transition-colors text-base leading-none">×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[#8A9AB0] text-xs mt-2">Review quantities carefully — AI counts may need adjustment. Items added to BOM in Edit mode.</p>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
            {drawingPreview.length > 0 && (
              <button onClick={onApply} className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
                Add {drawingPreview.length} Items to BOM →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
