export default function DeleteProposalModal({ proposal, deleteConfirmText, setDeleteConfirmText, deletingProposal, onDelete, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
        <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4"><span className="text-red-400 text-xl">⚠</span></div>
        <h3 className="text-white font-bold text-lg mb-1 text-center">Delete Proposal</h3>
        <p className="text-[#8A9AB0] text-sm mb-4 text-center">This will permanently delete this proposal and all associated data including BOM, photos, and activity. This cannot be undone.</p>
        <div className="mb-4">
          <label className="text-[#8A9AB0] text-xs mb-1 block">Type <span className="text-white font-mono">{proposal?.proposal_name}</span> to confirm</label>
          <input type="text" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder={proposal?.proposal_name}
            className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500" />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
          <button onClick={onDelete} disabled={deletingProposal || deleteConfirmText !== proposal?.proposal_name}
            className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50">
            {deletingProposal ? 'Deleting...' : 'Delete Proposal'}
          </button>
        </div>
      </div>
    </div>
  )
}
