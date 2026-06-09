const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ProposalTab({ job, proposal, navigate }) {
  return (
    <div className="bg-[#1a2d45] rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-white font-bold text-lg">Linked Proposal</h3>
        {job?.proposal_id && (
          <button onClick={() => navigate(`/proposal/${job.proposal_id}`)}
            className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">
            Open Proposal →
          </button>
        )}
      </div>
      {proposal ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#0F1C2E] rounded-lg p-3"><p className="text-[#8A9AB0] text-xs mb-1">Proposal Name</p><p className="text-white font-medium">{proposal.proposal_name}</p></div>
            <div className="bg-[#0F1C2E] rounded-lg p-3"><p className="text-[#8A9AB0] text-xs mb-1">Value</p><p className="text-white font-bold">${fmt(proposal.proposal_value)}</p></div>
            <div className="bg-[#0F1C2E] rounded-lg p-3"><p className="text-[#8A9AB0] text-xs mb-1">Margin</p><p className="text-[#C8622A] font-bold">{proposal.total_gross_margin_percent?.toFixed(1) || '—'}%</p></div>
          </div>
          {proposal.scope_of_work && (
            <div className="bg-[#0F1C2E] rounded-xl p-4">
              <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Scope of Work</p>
              <p className="text-[#D6E4F0] text-sm leading-relaxed whitespace-pre-wrap line-clamp-6">{proposal.scope_of_work}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[#8A9AB0]">No proposal linked to this job.</p>
      )}
    </div>
  )
}
