const STATUS_FALLBACK = { Won: 'Won', Lost: 'Lost', Sent: 'Proposal Sent', Draft: 'Lead' }

export default function ProposalHeader({
  proposal, profile, features, isAdmin,
  editingProposalName, proposalNameDraft, setProposalNameDraft, setEditingProposalName, saveProposalName,
  openEditClientModal, clientAddress, locationName, collaborators, orgProfiles,
  updateStatus, updateStage, pipelineStages = [], onUpdateRep,
  editingQuoteNumber, quoteNumberDraft, setQuoteNumberDraft, quoteNumberError, setQuoteNumberError,
  saveQuoteNumber, setEditingQuoteNumber,
  editingContractNumber, contractNumberDraft, setContractNumberDraft, saveContractNumber, setEditingContractNumber,
  updateCloseDate, updateTaxExempt, updateTaxRate,
  setShowDealSummaryModal, setDealSummary,
  setShowShareModal, setDeleteConfirmText, setShowDeleteModal,
  onArchive, onRestore, onCreateRevision,
  canEdit = true,
}) {
  return (
    <div className="bg-fp-card rounded-xl p-6">
      <div className="flex justify-between items-start">
        <div>
          {canEdit && editingProposalName ? (
            <div className="flex items-center gap-2">
              <input autoFocus type="text" value={proposalNameDraft}
                onChange={e => setProposalNameDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveProposalName(); if (e.key === 'Escape') setEditingProposalName(false) }}
                className="bg-fp-inset text-fp-text text-2xl font-bold border-b-2 border-[#C8622A] focus:outline-none px-1 w-96" />
              <button onClick={saveProposalName} className="text-[#C8622A] text-sm font-semibold hover:text-fp-text transition-colors">Save</button>
              <button onClick={() => setEditingProposalName(false)} className="text-fp-muted text-sm hover:text-fp-text transition-colors">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h2 className="text-fp-text text-2xl font-bold">{proposal?.proposal_name}</h2>
              {(proposal?.revision_number > 1 || proposal?.original_proposal_id) && (
                <span className="text-blue-400 text-xs bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded font-semibold">
                  Rev {proposal.revision_number}
                </span>
              )}
              {canEdit && (
                <button onClick={() => { setProposalNameDraft(proposal?.proposal_name || ''); setEditingProposalName(true) }}
                  className="opacity-0 group-hover:opacity-100 text-fp-muted hover:text-fp-text text-xs transition-all">✏️</button>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1">
            <p className="text-fp-muted">{proposal?.company} · {proposal?.client_name}</p>
            {canEdit && (
              <button onClick={openEditClientModal} className="text-fp-muted hover:text-[#C8622A] text-xs transition-colors" title="Edit client info">✏️</button>
            )}
          </div>
          <p className="text-fp-muted text-sm">{proposal?.client_email}</p>
          {clientAddress && <p className="text-fp-muted text-sm">{clientAddress}</p>}
          {locationName && <span className="inline-flex items-center gap-1 bg-fp-inset text-fp-muted text-xs px-2 py-0.5 rounded-full mt-1">📍 {locationName}</span>}
          {proposal?.signature_name && (
            <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 text-xs px-3 py-1 rounded-full mt-1">
              <span>✍️</span>
              <span>Signed by {proposal.signature_name} · {proposal.signature_at ? new Date(proposal.signature_at).toLocaleDateString() : ''}</span>
            </div>
          )}
          {collaborators.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-fp-muted text-xs">Shared with:</span>
              {collaborators.map(cid => {
                const cp = orgProfiles.find(p => p.id === cid)
                return cp ? <span key={cid} className="bg-[#C8622A]/20 text-[#C8622A] text-xs px-2 py-0.5 rounded-full">{cp.full_name}</span> : null
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {features.aiBom && (
            <button onClick={() => { setShowDealSummaryModal(true); setDealSummary(null) }}
              className="bg-purple-600 text-fp-text px-3 py-2 rounded-lg text-xs font-semibold hover:bg-purple-700 transition-colors">🧠 Deal Summary</button>
          )}
          <button onClick={() => setShowShareModal(true)}
            className="bg-fp-inset text-fp-text px-3 py-2 rounded-lg text-xs font-semibold hover:bg-fp-hover transition-colors flex items-center gap-1">
            👥 Share{collaborators.length > 0 ? ` (${collaborators.length})` : ''}
          </button>
          {isAdmin && !proposal?.archived_at && onCreateRevision && (
            <button onClick={onCreateRevision}
              className="bg-blue-900/30 text-blue-400 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-blue-900/50 transition-colors">
              + New Revision
            </button>
          )}
          {isAdmin && (
            proposal?.archived_at ? (
              <button onClick={onRestore}
                className="bg-green-900/30 text-green-400 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-green-900/50 transition-colors">Restore</button>
            ) : (
              <button onClick={onArchive}
                className="bg-fp-inset text-fp-muted px-3 py-2 rounded-lg text-xs font-semibold hover:text-fp-text transition-colors">Archive</button>
            )
          )}
          {isAdmin && canEdit && proposal?.status !== 'Won' && !proposal?.archived_at && (
            <button onClick={() => { setDeleteConfirmText(''); setShowDeleteModal(true) }}
              className="bg-red-900/30 text-red-400 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-red-900/50 transition-colors">Delete</button>
          )}
          {pipelineStages.length > 0 ? (() => {
            const activeStageId = proposal?.pipeline_stage_id ||
              pipelineStages.find(s => s.name === STATUS_FALLBACK[proposal?.status])?.id ||
              pipelineStages[0]?.id
            const activeStage = pipelineStages.find(s => s.id === activeStageId)
            return canEdit ? (
              <select value={activeStageId || ''} onChange={e => updateStage(e.target.value)}
                style={{ borderColor: activeStage?.color }}
                className="bg-fp-inset text-fp-text border-2 rounded-lg px-3 py-2 text-sm focus:outline-none">
                {pipelineStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : (
              <span style={{ borderColor: activeStage?.color }} className="bg-fp-inset text-fp-muted border-2 rounded-lg px-3 py-2 text-sm">{activeStage?.name || proposal?.status}</span>
            )
          })() : canEdit ? (
            <select value={proposal?.status} onChange={e => updateStatus(e.target.value)}
              className="bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand">
              {['Draft', 'Sent', 'Won', 'Lost'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <span className="bg-fp-inset text-fp-muted border border-fp-border rounded-lg px-3 py-2 text-sm">{proposal?.status}</span>
          )}
        </div>
      </div>

      {(profile?.bill_to_address || profile?.license_number) && (
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-fp-border/50 flex-wrap">
          {profile?.bill_to_address && (
            <span className="text-fp-muted text-xs">
              {profile.bill_to_address}{profile.bill_to_city ? `, ${profile.bill_to_city}` : ''}{profile.bill_to_state ? `, ${profile.bill_to_state}` : ''}{profile.bill_to_zip ? ` ${profile.bill_to_zip}` : ''}
            </span>
          )}
          {profile?.license_number && (
            <span className="text-fp-muted text-xs">License #: {profile.license_number}</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-7 gap-4 mt-6">
        <div>
          <p className="text-fp-muted text-xs mb-1">Rep</p>
          {isAdmin && onUpdateRep && orgProfiles?.length > 0 ? (
            <select
              value={proposal?.user_id || ''}
              onChange={e => {
                const p = orgProfiles.find(o => o.id === e.target.value)
                if (p) onUpdateRep(p)
              }}
              className="bg-fp-inset text-fp-text border border-fp-border rounded px-2 py-0.5 text-sm focus:outline-none focus:border-fp-brand cursor-pointer hover:border-fp-brand/50 transition-colors">
              {orgProfiles.map(p => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          ) : (
            <p className="text-fp-text text-sm font-medium">{proposal?.rep_name}</p>
          )}
          {proposal?.rep_title && <p className="text-fp-muted text-xs mt-0.5">{proposal.rep_title}</p>}
          {proposal?.rep_email && <p className="text-fp-muted text-xs">{proposal.rep_email}</p>}
          {proposal?.rep_phone && <p className="text-fp-muted text-xs">{proposal.rep_phone}</p>}
        </div>
        <div>
          <p className="text-fp-muted text-xs mb-1">Quote #</p>
          {canEdit && editingQuoteNumber ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <input type="text" value={quoteNumberDraft}
                  onChange={e => { setQuoteNumberDraft(e.target.value); setQuoteNumberError('') }}
                  onKeyDown={e => { if (e.key === 'Enter') saveQuoteNumber(); if (e.key === 'Escape') { setEditingQuoteNumber(false); setQuoteNumberError('') } }}
                  className="w-24 bg-fp-inset text-fp-text border border-[#C8622A]/50 rounded px-2 py-0.5 text-sm focus:outline-none focus:border-fp-brand" autoFocus />
                <button onClick={saveQuoteNumber} className="text-green-400 hover:text-green-300 text-xs">✓</button>
                <button onClick={() => { setEditingQuoteNumber(false); setQuoteNumberError('') }} className="text-fp-muted hover:text-fp-text text-xs">✕</button>
              </div>
              {quoteNumberError && <p className="text-red-400 text-xs">{quoteNumberError}</p>}
            </div>
          ) : canEdit ? (
            <button onClick={() => { setQuoteNumberDraft(proposal?.quote_number || ''); setEditingQuoteNumber(true) }}
              className="text-fp-text text-sm font-medium hover:text-[#C8622A] transition-colors group flex items-center gap-1" title="Click to edit quote number">
              {proposal?.quote_number || <span className="text-fp-muted italic">Add #</span>}
              <span className="text-fp-muted group-hover:text-[#C8622A] text-xs transition-colors">✏️</span>
            </button>
          ) : (
            <p className="text-fp-text text-sm font-medium">{proposal?.quote_number || <span className="text-fp-muted italic">—</span>}</p>
          )}
        </div>
        <div>
          <p className="text-fp-muted text-xs mb-1">Contract #</p>
          {canEdit && editingContractNumber ? (
            <div className="flex items-center gap-1">
              <input type="text" value={contractNumberDraft}
                onChange={e => setContractNumberDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveContractNumber(); if (e.key === 'Escape') setEditingContractNumber(false) }}
                className="w-24 bg-fp-inset text-fp-text border border-[#C8622A]/50 rounded px-2 py-0.5 text-sm focus:outline-none focus:border-fp-brand" autoFocus />
              <button onClick={saveContractNumber} className="text-green-400 hover:text-green-300 text-xs">✓</button>
              <button onClick={() => setEditingContractNumber(false)} className="text-fp-muted hover:text-fp-text text-xs">✕</button>
            </div>
          ) : canEdit ? (
            <button onClick={() => { setContractNumberDraft(proposal?.contract_number || ''); setEditingContractNumber(true) }}
              className="text-fp-text text-sm font-medium hover:text-[#C8622A] transition-colors group flex items-center gap-1" title="Click to edit contract number">
              {proposal?.contract_number || <span className="text-fp-muted italic">Add #</span>}
              <span className="text-fp-muted group-hover:text-[#C8622A] text-xs transition-colors">✏️</span>
            </button>
          ) : (
            <p className="text-fp-text text-sm font-medium">{proposal?.contract_number || <span className="text-fp-muted italic">—</span>}</p>
          )}
        </div>
        <div>
          <p className="text-fp-muted text-xs">Close Date</p>
          {canEdit ? (
            <input type="date" value={proposal?.close_date || ''} onChange={e => updateCloseDate(e.target.value)}
              className="bg-transparent text-fp-text text-sm font-medium focus:outline-none focus:border-b focus:border-fp-brand cursor-pointer" />
          ) : (
            <p className="text-fp-text text-sm font-medium">{proposal?.close_date || '—'}</p>
          )}
        </div>
        <div><p className="text-fp-muted text-xs">Industry</p><p className="text-fp-text text-sm font-medium">{proposal?.industry}</p></div>
        <div><p className="text-fp-muted text-xs">Margin</p><p className="text-[#C8622A] text-sm font-medium">{proposal?.total_gross_margin_percent ? `${proposal.total_gross_margin_percent.toFixed(1)}%` : '—'}</p></div>
        <div>
          <p className="text-fp-muted text-xs mb-1">Tax Exempt</p>
          {canEdit ? (
            <button onClick={() => updateTaxExempt(!proposal?.tax_exempt)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${proposal?.tax_exempt ? 'bg-green-600/20 text-green-400 border border-green-600/30' : 'bg-fp-inset text-fp-muted border border-fp-border hover:text-fp-text'}`}>
              {proposal?.tax_exempt ? 'Exempt' : 'Taxable'}
            </button>
          ) : (
            <p className="text-sm font-medium">{proposal?.tax_exempt ? <span className="text-green-400">Exempt</span> : <span className="text-fp-muted">Taxable</span>}</p>
          )}
        </div>
        <div>
          <p className="text-fp-muted text-xs mb-1">Tax Rate %</p>
          {proposal?.tax_exempt ? (
            <p className="text-fp-muted text-sm">—</p>
          ) : canEdit ? (
            <input type="number" step="0.01" placeholder="e.g. 8.5" value={proposal?.tax_rate ?? ''}
              onChange={e => updateTaxRate(e.target.value)}
              className="w-full bg-transparent text-fp-text text-sm font-medium border-b border-fp-border focus:outline-none focus:border-fp-brand" />
          ) : (
            <p className="text-fp-text text-sm font-medium">{proposal?.tax_rate ?? '—'}</p>
          )}
        </div>
      </div>
    </div>
  )
}
