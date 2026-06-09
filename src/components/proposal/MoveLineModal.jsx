export default function MoveLineModal({ editLines, moveLineIndex, editSections, onMove, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-white font-bold text-lg mb-1">Move Item</h3>
        <p className="text-[#8A9AB0] text-sm mb-4">{editLines[moveLineIndex]?.item_name}</p>
        <div className="space-y-2 mb-5">
          {[{ id: 'general', name: 'General (no section)' }, ...editSections].map(s => (
            <button key={s.id} onClick={() => onMove(moveLineIndex, s.id, 'move')}
              className="w-full text-left px-4 py-3 bg-[#0F1C2E] hover:bg-[#C8622A]/10 border border-[#2a3d55] hover:border-[#C8622A]/40 rounded-xl text-white text-sm transition-colors">
              {s.name || 'Untitled Section'}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
          <button onClick={() => onMove(moveLineIndex, editLines[moveLineIndex]?.section_id || 'general', 'copy')}
            className="flex-1 bg-[#2a3d55] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#3a4d65] transition-colors">
            Copy Instead
          </button>
        </div>
      </div>
    </div>
  )
}
