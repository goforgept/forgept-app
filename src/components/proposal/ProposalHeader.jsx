import { useState, useEffect, useRef } from 'react'

const STATUS_FALLBACK = { Won: 'Won', Lost: 'Lost', Sent: 'Proposal Sent', Draft: 'Lead' }

function Cell({ label, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-0.5 bg-fp-inset border border-fp-border rounded-lg px-3 py-2 focus-within:border-fp-brand/40 hover:border-fp-border/80 transition-colors ${className}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-fp-muted/70 select-none">{label}</span>
      {children}
    </div>
  )
}

export default function ProposalHeader({
  proposal, profile, features, isAdmin,
  editingProposalName, proposalNameDraft, setProposalNameDraft, setEditingProposalName, saveProposalName,
  openEditClientModal, clientAddress, locationName, collaborators, orgProfiles,
  updateStatus, updateStage, pipelineStages = [], onUpdateRep,
  quoteNumberError, setQuoteNumberError,
  saveQuoteNumber, setEditingQuoteNumber,
  saveContractNumber, setEditingContractNumber,
  updateCloseDate, updateTaxExempt, updateTaxRate, updateIndustry,
  onSaveDealAmount,
  setShowDealSummaryModal, setDealSummary,
  setShowShareModal, setDeleteConfirmText, setShowDeleteModal,
  onArchive, onRestore, onCreateRevision,
  canEdit = true,
}) {
  const [quoteDraft,      setQuoteDraft]      = useState(proposal?.quote_number    ?? '')
  const [contractDraft,   setContractDraft]   = useState(proposal?.contract_number ?? '')
  const [taxRateDraft,    setTaxRateDraft]    = useState(proposal?.tax_rate        ?? '')
  const [dealAmountDraft, setDealAmountDraft] = useState(proposal?.proposal_value != null ? String(proposal.proposal_value) : '')
  const [dealAmountDirty, setDealAmountDirty] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => { setQuoteDraft(proposal?.quote_number    ?? '') }, [proposal?.quote_number])
  useEffect(() => { setContractDraft(proposal?.contract_number ?? '') }, [proposal?.contract_number])
  useEffect(() => { setTaxRateDraft(proposal?.tax_rate        ?? '') }, [proposal?.tax_rate])
  useEffect(() => { setDealAmountDraft(proposal?.proposal_value != null ? String(proposal.proposal_value) : ''); setDealAmountDirty(false) }, [proposal?.proposal_value])

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  const inputCls = "bg-transparent text-fp-text text-sm font-medium focus:outline-none placeholder-fp-muted/30 w-full"

  // Stage
  const activeStageId = proposal?.pipeline_stage_id ||
    pipelineStages.find(s => s.name === STATUS_FALLBACK[proposal?.status])?.id ||
    pipelineStages[0]?.id
  const activeStage = pipelineStages.find(s => s.id === activeStageId)

  // Sent
  const isSent   = proposal?.status === 'Sent' || proposal?.status === 'Won' || proposal?.status === 'Lost'
  const isLocked = proposal?.status === 'Won' || proposal?.status === 'Lost' || !canEdit

  // Overflow menu items
  const menuItems = [
    features?.aiBom && {
      label: '🧠 Deal Summary', action: () => { setShowDealSummaryModal(true); setDealSummary(null) }
    },
    isAdmin && !proposal?.archived_at && onCreateRevision && {
      label: '+ New Revision', action: onCreateRevision
    },
    isAdmin && !proposal?.archived_at && {
      label: 'Archive', action: onArchive
    },
    isAdmin && proposal?.archived_at && {
      label: 'Restore', action: onRestore
    },
    isAdmin && canEdit && proposal?.status !== 'Won' && !proposal?.archived_at && {
      label: 'Delete', action: () => { setDeleteConfirmText(''); setShowDeleteModal(true) }, danger: true
    },
  ].filter(Boolean)

  return (
    <div className="bg-fp-card rounded-xl p-5">
      {/* Top row: title + actions */}
      <div className="flex justify-between items-start gap-4">

        {/* Left: name + client */}
        <div className="min-w-0 flex-1">
          {canEdit && editingProposalName ? (
            <div className="flex items-center gap-2">
              <input autoFocus type="text" value={proposalNameDraft}
                onChange={e => setProposalNameDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveProposalName(); if (e.key === 'Escape') setEditingProposalName(false) }}
                className="bg-fp-inset text-fp-text text-xl font-bold border-b-2 border-fp-brand focus:outline-none px-1 w-80" />
              <button onClick={saveProposalName} className="text-fp-brand text-sm font-semibold">Save</button>
              <button onClick={() => setEditingProposalName(false)} className="text-fp-muted text-sm">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              {canEdit ? (
                <button onClick={() => { setProposalNameDraft(proposal?.proposal_name || ''); setEditingProposalName(true) }}
                  className="text-fp-text text-xl font-bold hover:text-fp-brand transition-colors text-left leading-tight">
                  {proposal?.proposal_name}
                </button>
              ) : (
                <h2 className="text-fp-text text-xl font-bold leading-tight">{proposal?.proposal_name}</h2>
              )}
              {(proposal?.revision_number > 1 || proposal?.original_proposal_id) && (
                <span className="text-blue-400 text-xs bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded font-semibold shrink-0">
                  Rev {proposal.revision_number}
                </span>
              )}
              {proposal?.signature_name && (
                <span className="inline-flex items-center gap-1 bg-green-500/10 border border-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full shrink-0">
                  ✍️ Signed · {proposal.signature_at ? new Date(proposal.signature_at).toLocaleDateString() : ''}
                </span>
              )}
            </div>
          )}

          {/* Client line */}
          <div className="mt-1">
            {canEdit ? (
              <button onClick={openEditClientModal}
                className="group flex items-center gap-1 text-left rounded px-1 py-0.5 -ml-1 hover:bg-fp-inset transition-colors">
                <span className="text-fp-muted text-sm group-hover:text-fp-text transition-colors">
                  {proposal?.company}{proposal?.client_name ? ` · ${proposal.client_name}` : ''}
                </span>
                <span className="opacity-0 group-hover:opacity-100 text-[#C8622A] text-xs font-semibold transition-all">✎</span>
              </button>
            ) : (
              <p className="text-fp-muted text-sm px-1">
                {proposal?.company}{proposal?.client_name ? ` · ${proposal.client_name}` : ''}
              </p>
            )}
            <div className="flex items-center gap-3 flex-wrap px-1 mt-0.5">
              {proposal?.client_email && <span className="text-fp-muted text-xs">{proposal.client_email}</span>}
              {clientAddress && <span className="text-fp-muted text-xs">{clientAddress}</span>}
              {locationName && <span className="text-fp-muted text-xs">📍 {locationName}</span>}
            </div>
          </div>

          {/* Collaborators */}
          {collaborators.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5 px-1">
              <span className="text-fp-muted text-xs">Shared:</span>
              {collaborators.map(cid => {
                const cp = orgProfiles.find(p => p.id === cid)
                return cp ? <span key={cid} className="bg-fp-brand/20 text-fp-brand text-xs px-1.5 py-0.5 rounded">{cp.full_name}</span> : null
              })}
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex flex-col items-end gap-2 shrink-0">

          {/* Top row: stage + share + overflow */}
          <div className="flex items-center gap-2">
            {pipelineStages.length > 0 ? (
              canEdit ? (
                <select value={activeStageId || ''} onChange={e => updateStage(e.target.value)}
                  style={{ borderColor: activeStage?.color }}
                  className="bg-fp-inset text-fp-text border-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none cursor-pointer">
                  {pipelineStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              ) : (
                <span style={{ borderColor: activeStage?.color }} className="bg-fp-inset text-fp-muted border-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold">
                  {activeStage?.name || proposal?.status}
                </span>
              )
            ) : canEdit ? (
              <select value={proposal?.status} onChange={e => updateStatus(e.target.value)}
                className="bg-fp-inset text-fp-text border border-fp-border rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none">
                {['Draft', 'Sent', 'Won', 'Lost'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <span className="bg-fp-inset text-fp-muted border border-fp-border rounded-lg px-2.5 py-1.5 text-xs font-semibold">{proposal?.status}</span>
            )}

            <button onClick={() => setShowShareModal(true)}
              className="bg-fp-inset text-fp-muted hover:text-fp-text px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-fp-border transition-colors flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
              </svg>
              Share{collaborators.length > 0 ? ` (${collaborators.length})` : ''}
            </button>

            {menuItems.length > 0 && (
              <div className="relative" ref={menuRef}>
                <button onClick={() => setShowMenu(v => !v)}
                  className="bg-fp-inset text-fp-muted hover:text-fp-text px-2 py-1.5 rounded-lg text-xs border border-fp-border transition-colors">
                  ⋯
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-fp-card border border-fp-border rounded-xl shadow-xl z-50 min-w-[160px] py-1 overflow-hidden">
                    {menuItems.map((item, i) => (
                      <button key={i} onClick={() => { item.action(); setShowMenu(false) }}
                        className={`w-full text-left px-4 py-2 text-xs font-semibold transition-colors hover:bg-fp-hover ${
                          item.danger ? 'text-red-400 hover:text-red-300' : 'text-fp-text'
                        }`}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Proposal Sent — sits below stage */}
          <button
            type="button"
            disabled={isLocked}
            onClick={() => !isLocked && updateStatus(isSent ? 'Draft' : 'Sent')}
            title={isLocked ? 'Status locked' : isSent ? 'Unmark as sent' : 'Mark as sent — arms follow-up emails'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              isSent ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' : 'bg-fp-inset border-fp-border text-fp-muted hover:text-fp-text'
            } ${isLocked ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}>
            <span className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 ${
              isSent ? 'bg-blue-500 border-blue-500' : 'border-current'
            }`}>
              {isSent && <svg viewBox="0 0 10 8" className="w-2 h-2 text-white" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4l3 3 5-6"/></svg>}
            </span>
            Proposal Sent
          </button>
        </div>
      </div>

      {/* License / billing address strip */}
      {(profile?.bill_to_address || profile?.license_number) && (
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-fp-border/40 flex-wrap">
          {profile?.bill_to_address && (
            <span className="text-fp-muted text-xs">
              {profile.bill_to_address}{profile.bill_to_city ? `, ${profile.bill_to_city}` : ''}{profile.bill_to_state ? `, ${profile.bill_to_state}` : ''}{profile.bill_to_zip ? ` ${profile.bill_to_zip}` : ''}
            </span>
          )}
          {profile?.license_number && <span className="text-fp-muted text-xs">License #: {profile.license_number}</span>}
        </div>
      )}

      {/* CRM cells */}
      <div className="flex flex-wrap gap-2 mt-4">

        <Cell label="Rep" className="min-w-[120px]">
          {isAdmin && onUpdateRep && orgProfiles?.length > 0 ? (
            <select value={proposal?.user_id || ''} onChange={e => { const p = orgProfiles.find(o => o.id === e.target.value); if (p) onUpdateRep(p) }}
              className="bg-transparent text-fp-text text-sm font-medium focus:outline-none cursor-pointer appearance-none w-full">
              {orgProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          ) : (
            <span className="text-fp-text text-sm font-medium">{proposal?.rep_name || '—'}</span>
          )}
          {proposal?.rep_title && <span className="text-[11px] text-fp-muted leading-none">{proposal.rep_title}</span>}
        </Cell>

        <Cell label="Quote #" className="min-w-[100px]">
          {canEdit ? (
            <input type="text" value={quoteDraft} placeholder="—"
              onChange={e => { setQuoteDraft(e.target.value); setQuoteNumberError('') }}
              onBlur={e => saveQuoteNumber(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setQuoteDraft(proposal?.quote_number ?? ''); setQuoteNumberError(''); e.currentTarget.blur() } }}
              className={inputCls} />
          ) : (
            <span className="text-fp-text text-sm font-medium">{proposal?.quote_number || '—'}</span>
          )}
          {quoteNumberError && <span className="text-red-400 text-[10px] leading-tight">{quoteNumberError}</span>}
        </Cell>

        <Cell label="Contract #" className="min-w-[100px]">
          {canEdit ? (
            <input type="text" value={contractDraft} placeholder="—"
              onChange={e => setContractDraft(e.target.value)}
              onBlur={e => saveContractNumber(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setContractDraft(proposal?.contract_number ?? ''); e.currentTarget.blur() } }}
              className={inputCls} />
          ) : (
            <span className="text-fp-text text-sm font-medium">{proposal?.contract_number || '—'}</span>
          )}
        </Cell>

        <Cell label="Close Date" className="min-w-[120px]">
          {canEdit ? (
            <input type="date" value={proposal?.close_date || ''} onChange={e => updateCloseDate(e.target.value)}
              className={`${inputCls} cursor-pointer`} />
          ) : (
            <span className="text-fp-text text-sm font-medium">{proposal?.close_date || '—'}</span>
          )}
        </Cell>

        <Cell label="Deal Amount" className="min-w-[120px]">
          {canEdit ? (
            <div className="flex items-center gap-0.5">
              <span className="text-fp-muted text-sm">$</span>
              <input type="number" min="0" step="0.01" value={dealAmountDraft} placeholder="0.00"
                onChange={e => { setDealAmountDraft(e.target.value); setDealAmountDirty(true) }}
                onBlur={e => { if (dealAmountDirty && e.target.value !== '') { onSaveDealAmount?.(parseFloat(e.target.value) || 0); setDealAmountDirty(false) } }}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDealAmountDraft(proposal?.proposal_value != null ? String(proposal.proposal_value) : ''); setDealAmountDirty(false); e.currentTarget.blur() } }}
                className={inputCls} />
            </div>
          ) : (
            <span className="text-fp-text text-sm font-bold text-[#C8622A]">
              {proposal?.proposal_value != null ? `$${Number(proposal.proposal_value).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
            </span>
          )}
        </Cell>

        <Cell label="Industry" className="min-w-[110px]">
          {canEdit && updateIndustry ? (
            <select value={proposal?.industry || ''} onChange={e => updateIndustry(e.target.value)}
              className="bg-transparent text-fp-text text-sm font-medium focus:outline-none w-full cursor-pointer">
              <option value="">—</option>
              {['Security','Audio/Visual','IT','Fire','Manufacturing Partner','Distributor','Sub-Contractor','Residential','Commercial','Other'].map(ind => (
                <option key={ind} value={ind}>{ind}</option>
              ))}
            </select>
          ) : (
            <span className="text-fp-text text-sm font-medium">{proposal?.industry || '—'}</span>
          )}
        </Cell>

        <Cell label="Margin" className="min-w-[75px]">
          <span className="text-sm font-semibold text-fp-brand">
            {proposal?.total_gross_margin_percent ? `${proposal.total_gross_margin_percent.toFixed(1)}%` : '—'}
          </span>
        </Cell>

        <Cell label="Tax" className="min-w-[85px]">
          {canEdit ? (
            <button onClick={() => updateTaxExempt(!proposal?.tax_exempt)}
              className={`text-sm font-semibold text-left transition-colors ${proposal?.tax_exempt ? 'text-green-500' : 'text-fp-text hover:text-fp-muted'}`}>
              {proposal?.tax_exempt ? 'Exempt' : 'Taxable'}
            </button>
          ) : (
            <span className={`text-sm font-semibold ${proposal?.tax_exempt ? 'text-green-500' : 'text-fp-muted'}`}>
              {proposal?.tax_exempt ? 'Exempt' : 'Taxable'}
            </span>
          )}
        </Cell>

        {!proposal?.tax_exempt && (
          <Cell label="Tax Rate" className="min-w-[80px]">
            {canEdit ? (
              <input type="number" step="0.01" placeholder="8.5" value={taxRateDraft}
                onChange={e => setTaxRateDraft(e.target.value)}
                onBlur={e => updateTaxRate(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                className={inputCls} />
            ) : (
              <span className="text-fp-text text-sm font-medium">{proposal?.tax_rate ? `${proposal.tax_rate}%` : '—'}</span>
            )}
          </Cell>
        )}

      </div>
    </div>
  )
}
