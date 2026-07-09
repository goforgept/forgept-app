export default function MoveLineModal({ editLines, moveLineIndex, editSections, onMove, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-fp-card rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-fp-text font-bold text-lg mb-1">Move Item</h3>
        <p className="text-fp-muted text-sm mb-4">{editLines[moveLineIndex]?.item_name}</p>
        <div className="space-y-2 mb-5">
          {[{ id: 'general', name: 'General (no section)' }, ...editSections].map(s => (
            <button key={s.id} onClick={() => onMove(moveLineIndex, s.id, 'move')}
              className="w-full text-left px-4 py-3 bg-fp-inset hover:bg-[#C8622A]/10 border border-fp-border hover:border-fp-brand/40 rounded-xl text-fp-text text-sm transition-colors">
              {s.name || 'Untitled Section'}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
          <button onClick={() => onMove(moveLineIndex, editLines[moveLineIndex]?.section_id || 'general', 'copy')}
            className="flex-1 bg-fp-inset text-fp-text py-2 rounded-lg text-sm font-semibold hover:bg-fp-hover transition-colors">
            Copy Instead
          </button>
        </div>
      </div>
    </div>
  )
}
