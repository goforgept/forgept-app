import { useState, useEffect } from 'react'

const STATUS_FALLBACK = { Won: 'Won', Lost: 'Lost', Sent: 'Proposal Sent', Draft: 'Lead' }

// Reusable CRM-style editable cell
function Cell({ label, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-0.5 bg-fp-inset border border-fp-border rounded-xl px-3 py-2.5 focus-within:border-fp-brand/40 hover:border-fp-border/80 transition-colors ${className}`}>
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
  updateCloseDate, updateTaxExempt, updateTaxRate,
  setShowDealSummaryModal, setDealSummary,
  setShowShareModal, setDeleteConfirmText, setShowDeleteModal,
  onArchive, onRestore, onCreateRevision,
  canEdit = true,
}) {
  // Local draft state — keeps inputs always controlled without depending on parent editing flags
  const [quoteDraft,    setQuoteDraft]    = useState(proposal?.quote_number    ?? '')
  const [contractDraft, setContractDraft] = useState(proposal?.contract_number ?? '')
  const [taxRateDraft,  setTaxRateDraft]  = useState(proposal?.tax_rate        ?? '')

  // Sync from parent when proposal data changes externally (e.g. after save)
  useEffect(() => { setQuoteDraft(proposal?.quote_number    ?? '') }, [proposal?.quote_number])
  useEffect(() => { setContractDraft(proposal?.contract_number ?? '') }, [proposal?.contract_number])
  useEffect(() => { setTaxRateDraft(proposal?.tax_rate        ?? '') }, [proposal?.tax_rate])

  const inputCls = "bg-transparent text-fp-text text-sm font-medium focus:outline-none placeholder-fp-muted/30 w-full"

  return (
    <div className="bg-fp-card rounded-xl p-6">
      <div className="flex justify-between items-start">
        <div>
          {canEdit && editingProposalName ? (
            <div className="flex items-center gap-2">
              <input autoFocus type="text" value={proposalNameDraft}
                onChange={e => setProposalNameDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveProposalName(); if (e.key === 'Escape') setEditingProposalName(false) }}
                className="bg-fp-inset text-fp-text text-2xl font-bold border-b-2 border-fp-brand focus:outline-none px-1 w-96" />
              <button onClick={saveProposalName} className="text-fp-brand text-sm font-semibold hover:text-fp-text transition-colors">Save</button>
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
              <button onClick={openEditClientModal} className="text-fp-muted hover:text-fp-brand text-xs transition-colors" title="Edit client info">✏️</button>
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
                return cp ? <span key={cid} className="bg-fp-brand/20 text-fp-brand text-xs px-2 py-0.5 rounded-full">{cp.full_name}</span> : null
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

      {/* ── CRM Field Cells ── */}
      <div className="flex flex-wrap gap-2 mt-5">

        {/* Rep */}
        <Cell label="Rep" className="min-w-[130px]">
          {isAdmin && onUpdateRep && orgProfiles?.length > 0 ? (
            <select
              value={proposal?.user_id || ''}
              onChange={e => { const p = orgProfiles.find(o => o.id === e.target.value); if (p) onUpdateRep(p) }}
              className="bg-transparent text-fp-text text-sm font-medium focus:outline-none cursor-pointer appearance-none w-full">
              {orgProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          ) : (
            <span className="text-fp-text text-sm font-medium">{proposal?.rep_name || '—'}</span>
          )}
          {proposal?.rep_title && <span className="text-[11px] text-fp-muted leading-none mt-0.5">{proposal.rep_title}</span>}
        </Cell>

        {/* Quote # */}
        <Cell label="Quote #" className="min-w-[110px]">
          {canEdit ? (
            <input
              type="text"
              value={quoteDraft}
              placeholder="—"
              onChange={e => { setQuoteDraft(e.target.value); setQuoteNumberError('') }}
              onBlur={e => saveQuoteNumber(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') { setQuoteDraft(proposal?.quote_number ?? ''); setQuoteNumberError(''); e.currentTarget.blur() }
              }}
              className={inputCls}
            />
          ) : (
            <span className="text-fp-text text-sm font-medium">{proposal?.quote_number || '—'}</span>
          )}
          {quoteNumberError && <span className="text-red-400 text-[10px] mt-0.5 leading-tight">{quoteNumberError}</span>}
        </Cell>

        {/* Contract # */}
        <Cell label="Contract #" className="min-w-[110px]">
          {canEdit ? (
            <input
              type="text"
              value={contractDraft}
              placeholder="—"
              onChange={e => setContractDraft(e.target.value)}
              onBlur={e => saveContractNumber(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') { setContractDraft(proposal?.contract_number ?? ''); e.currentTarget.blur() }
              }}
              className={inputCls}
            />
          ) : (
            <span className="text-fp-text text-sm font-medium">{proposal?.contract_number || '—'}</span>
          )}
        </Cell>

        {/* Close Date */}
        <Cell label="Close Date" className="min-w-[130px]">
          {canEdit ? (
            <input
              type="date"
              value={proposal?.close_date || ''}
              onChange={e => updateCloseDate(e.target.value)}
              className={`${inputCls} cursor-pointer`}
            />
          ) : (
            <span className="text-fp-text text-sm font-medium">{proposal?.close_date || '—'}</span>
          )}
        </Cell>

        {/* Industry */}
        <Cell label="Industry" className="min-w-[100px]">
          <span className="text-fp-text text-sm font-medium">{proposal?.industry || '—'}</span>
        </Cell>

        {/* Margin */}
        <Cell label="Margin" className="min-w-[80px]">
          <span className="text-sm font-semibold text-fp-brand">
            {proposal?.total_gross_margin_percent ? `${proposal.total_gross_margin_percent.toFixed(1)}%` : '—'}
          </span>
        </Cell>

        {/* Tax */}
        <Cell label="Tax" className="min-w-[90px]">
          {canEdit ? (
            <button
              onClick={() => updateTaxExempt(!proposal?.tax_exempt)}
              className={`text-sm font-semibold text-left transition-colors ${proposal?.tax_exempt ? 'text-green-500' : 'text-fp-text hover:text-fp-muted'}`}>
              {proposal?.tax_exempt ? 'Exempt' : 'Taxable'}
            </button>
          ) : (
            <span className={`text-sm font-semibold ${proposal?.tax_exempt ? 'text-green-500' : 'text-fp-muted'}`}>
              {proposal?.tax_exempt ? 'Exempt' : 'Taxable'}
            </span>
          )}
        </Cell>

        {/* Tax Rate — hidden when exempt */}
        {!proposal?.tax_exempt && (
          <Cell label="Tax Rate" className="min-w-[85px]">
            {canEdit ? (
              <input
                type="number"
                step="0.01"
                placeholder="8.5"
                value={taxRateDraft}
                onChange={e => setTaxRateDraft(e.target.value)}
                onBlur={e => updateTaxRate(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                className={inputCls}
              />
            ) : (
              <span className="text-fp-text text-sm font-medium">{proposal?.tax_rate ? `${proposal.tax_rate}%` : '—'}</span>
            )}
          </Cell>
        )}

      </div>
    </div>
  )
}
