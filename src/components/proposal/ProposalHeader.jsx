export default function ProposalHeader({
  proposal, profile, features, isAdmin,
  editingProposalName, proposalNameDraft, setProposalNameDraft, setEditingProposalName, saveProposalName,
  openEditClientModal, clientAddress, locationName, collaborators, orgProfiles,
  updateStatus, onUpdateRep,
  editingQuoteNumber, quoteNumberDraft, setQuoteNumberDraft, quoteNumberError, setQuoteNumberError,
  saveQuoteNumber, setEditingQuoteNumber,
  updateCloseDate, updateTaxExempt, updateTaxRate,
  setShowDealSummaryModal, setDealSummary,
  setShowShareModal, setDeleteConfirmText, setShowDeleteModal,
  onArchive, onRestore, onCreateRevision,
  canEdit = true,
}) {
  return (
    <div className="bg-[#1a2d45] rounded-xl p-6">
      <div className="flex justify-between items-start">
        <div>
          {canEdit && editingProposalName ? (
            <div className="flex items-center gap-2">
              <input autoFocus type="text" value={proposalNameDraft}
                onChange={e => setProposalNameDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveProposalName(); if (e.key === 'Escape') setEditingProposalName(false) }}
                className="bg-[#0F1C2E] text-white text-2xl font-bold border-b-2 border-[#C8622A] focus:outline-none px-1 w-96" />
              <button onClick={saveProposalName} className="text-[#C8622A] text-sm font-semibold hover:text-white transition-colors">Save</button>
              <button onClick={() => setEditingProposalName(false)} className="text-[#8A9AB0] text-sm hover:text-white transition-colors">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h2 className="text-white text-2xl font-bold">{proposal?.proposal_name}</h2>
              {(proposal?.revision_number > 1 || proposal?.original_proposal_id) && (
                <span className="text-blue-400 text-xs bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded font-semibold">
                  Rev {proposal.revision_number}
                </span>
              )}
              {canEdit && (
                <button onClick={() => { setProposalNameDraft(proposal?.proposal_name || ''); setEditingProposalName(true) }}
                  className="opacity-0 group-hover:opacity-100 text-[#8A9AB0] hover:text-white text-xs transition-all">✏️</button>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1">
            <p className="text-[#8A9AB0]">{proposal?.company} · {proposal?.client_name}</p>
            {canEdit && (
              <button onClick={openEditClientModal} className="text-[#8A9AB0] hover:text-[#C8622A] text-xs transition-colors" title="Edit client info">✏️</button>
            )}
          </div>
          <p className="text-[#8A9AB0] text-sm">{proposal?.client_email}</p>
          {clientAddress && <p className="text-[#8A9AB0] text-sm">{clientAddress}</p>}
          {locationName && <span className="inline-flex items-center gap-1 bg-[#2a3d55] text-[#8A9AB0] text-xs px-2 py-0.5 rounded-full mt-1">📍 {locationName}</span>}
          {proposal?.signature_name && (
            <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 text-xs px-3 py-1 rounded-full mt-1">
              <span>✍️</span>
              <span>Signed by {proposal.signature_name} · {proposal.signature_at ? new Date(proposal.signature_at).toLocaleDateString() : ''}</span>
            </div>
          )}
          {collaborators.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[#8A9AB0] text-xs">Shared with:</span>
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
              className="bg-purple-600 text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-purple-700 transition-colors">🧠 Deal Summary</button>
          )}
          <button onClick={() => setShowShareModal(true)}
            className="bg-[#2a3d55] text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-[#3a4d65] transition-colors flex items-center gap-1">
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
                className="bg-[#2a3d55] text-[#8A9AB0] px-3 py-2 rounded-lg text-xs font-semibold hover:text-white transition-colors">Archive</button>
            )
          )}
          {isAdmin && canEdit && proposal?.status !== 'Won' && !proposal?.archived_at && (
            <button onClick={() => { setDeleteConfirmText(''); setShowDeleteModal(true) }}
              className="bg-red-900/30 text-red-400 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-red-900/50 transition-colors">Delete</button>
          )}
          {canEdit ? (
            <select value={proposal?.status} onChange={e => updateStatus(e.target.value)}
              className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
              {['Draft', 'Sent', 'Won', 'Lost'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <span className="bg-[#0F1C2E] text-[#8A9AB0] border border-[#2a3d55] rounded-lg px-3 py-2 text-sm">{proposal?.status}</span>
          )}
        </div>
      </div>

      {(profile?.bill_to_address || profile?.license_number) && (
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#2a3d55]/50 flex-wrap">
          {profile?.bill_to_address && (
            <span className="text-[#8A9AB0] text-xs">
              {profile.bill_to_address}{profile.bill_to_city ? `, ${profile.bill_to_city}` : ''}{profile.bill_to_state ? `, ${profile.bill_to_state}` : ''}{profile.bill_to_zip ? ` ${profile.bill_to_zip}` : ''}
            </span>
          )}
          {profile?.license_number && (
            <span className="text-[#8A9AB0] text-xs">License #: {profile.license_number}</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-6 gap-4 mt-6">
        <div>
          <p className="text-[#8A9AB0] text-xs mb-1">Rep</p>
          {isAdmin && onUpdateRep && orgProfiles?.length > 0 ? (
            <select
              value={proposal?.user_id || ''}
              onChange={e => {
                const p = orgProfiles.find(o => o.id === e.target.value)
                if (p) onUpdateRep(p)
              }}
              className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-0.5 text-sm focus:outline-none focus:border-[#C8622A] cursor-pointer hover:border-[#C8622A]/50 transition-colors">
              {orgProfiles.map(p => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          ) : (
            <p className="text-white text-sm font-medium">{proposal?.rep_name}</p>
          )}
          {proposal?.rep_title && <p className="text-[#8A9AB0] text-xs mt-0.5">{proposal.rep_title}</p>}
          {proposal?.rep_email && <p className="text-[#8A9AB0] text-xs">{proposal.rep_email}</p>}
          {proposal?.rep_phone && <p className="text-[#8A9AB0] text-xs">{proposal.rep_phone}</p>}
        </div>
        <div>
          <p className="text-[#8A9AB0] text-xs mb-1">Quote #</p>
          {canEdit && editingQuoteNumber ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <input type="text" value={quoteNumberDraft}
                  onChange={e => { setQuoteNumberDraft(e.target.value); setQuoteNumberError('') }}
                  onKeyDown={e => { if (e.key === 'Enter') saveQuoteNumber(); if (e.key === 'Escape') { setEditingQuoteNumber(false); setQuoteNumberError('') } }}
                  className="w-24 bg-[#0F1C2E] text-white border border-[#C8622A]/50 rounded px-2 py-0.5 text-sm focus:outline-none focus:border-[#C8622A]" autoFocus />
                <button onClick={saveQuoteNumber} className="text-green-400 hover:text-green-300 text-xs">✓</button>
                <button onClick={() => { setEditingQuoteNumber(false); setQuoteNumberError('') }} className="text-[#8A9AB0] hover:text-white text-xs">✕</button>
              </div>
              {quoteNumberError && <p className="text-red-400 text-xs">{quoteNumberError}</p>}
            </div>
          ) : canEdit ? (
            <button onClick={() => { setQuoteNumberDraft(proposal?.quote_number || ''); setEditingQuoteNumber(true) }}
              className="text-white text-sm font-medium hover:text-[#C8622A] transition-colors group flex items-center gap-1" title="Click to edit quote number">
              {proposal?.quote_number || <span className="text-[#8A9AB0] italic">Add #</span>}
              <span className="text-[#2a3d55] group-hover:text-[#C8622A] text-xs transition-colors">✏️</span>
            </button>
          ) : (
            <p className="text-white text-sm font-medium">{proposal?.quote_number || <span className="text-[#8A9AB0] italic">—</span>}</p>
          )}
        </div>
        <div>
          <p className="text-[#8A9AB0] text-xs">Close Date</p>
          {canEdit ? (
            <input type="date" value={proposal?.close_date || ''} onChange={e => updateCloseDate(e.target.value)}
              className="bg-transparent text-white text-sm font-medium focus:outline-none focus:border-b focus:border-[#C8622A] cursor-pointer" />
          ) : (
            <p className="text-white text-sm font-medium">{proposal?.close_date || '—'}</p>
          )}
        </div>
        <div><p className="text-[#8A9AB0] text-xs">Industry</p><p className="text-white text-sm font-medium">{proposal?.industry}</p></div>
        <div><p className="text-[#8A9AB0] text-xs">Margin</p><p className="text-[#C8622A] text-sm font-medium">{proposal?.total_gross_margin_percent ? `${proposal.total_gross_margin_percent.toFixed(1)}%` : '—'}</p></div>
        <div>
          <p className="text-[#8A9AB0] text-xs mb-1">Tax Exempt</p>
          {canEdit ? (
            <button onClick={() => updateTaxExempt(!proposal?.tax_exempt)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${proposal?.tax_exempt ? 'bg-green-600/20 text-green-400 border border-green-600/30' : 'bg-[#0F1C2E] text-[#8A9AB0] border border-[#2a3d55] hover:text-white'}`}>
              {proposal?.tax_exempt ? 'Exempt' : 'Taxable'}
            </button>
          ) : (
            <p className="text-sm font-medium">{proposal?.tax_exempt ? <span className="text-green-400">Exempt</span> : <span className="text-[#8A9AB0]">Taxable</span>}</p>
          )}
        </div>
        <div>
          <p className="text-[#8A9AB0] text-xs mb-1">Tax Rate %</p>
          {proposal?.tax_exempt ? (
            <p className="text-[#8A9AB0] text-sm">—</p>
          ) : canEdit ? (
            <input type="number" step="0.01" placeholder="e.g. 8.5" value={proposal?.tax_rate ?? ''}
              onChange={e => updateTaxRate(e.target.value)}
              className="w-full bg-transparent text-white text-sm font-medium border-b border-[#2a3d55] focus:outline-none focus:border-[#C8622A]" />
          ) : (
            <p className="text-white text-sm font-medium">{proposal?.tax_rate ?? '—'}</p>
          )}
        </div>
      </div>
    </div>
  )
}
