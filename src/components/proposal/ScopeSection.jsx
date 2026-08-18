import { useState, useRef, useEffect } from 'react'

export default function ScopeSection({
  proposal, features, photos,
  aiNotes, setAiNotes,
  editingSOW, sowDraft, setSowDraft, setEditingSOW, saveSOW,
  generatingSOW, generateSOW,
  sendForm, setSendForm, setShowSendModal,
  sendTemplateSubject, sendTemplateBody,
  requestingSignature, requestSignature,
  uploadingSignedPDF, uploadSignedPDF,
  qboConnected, qboInvoiceId, sendingToQBO, sendToQBO,
  setShowPricingModal, downloadPDF, downloadDOCX, downloadSignedCopy, downloadInstallerPDF, downloadInstallerDOCX,
  downloadBundle,
  onToggleCoverPage,
  setShowPhotosModal,
  canEdit = true,
}) {
  const [dlOpen, setDlOpen] = useState(false)
  const dlRef = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (dlRef.current && !dlRef.current.contains(e.target)) setDlOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const applyVars = (str) => (str || '')
    .replace(/\{\{clientName\}\}/g, proposal?.client_name || 'there')
    .replace(/\{\{proposalName\}\}/g, proposal?.proposal_name || '')
    .replace(/\{\{repName\}\}/g, proposal?.rep_name || '')
    .replace(/\{\{companyName\}\}/g, proposal?.company || '')
  return (
    <div className="bg-fp-card rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-fp-text font-bold text-lg">Scope of Work</h3>
        <div className="flex gap-2 flex-wrap">
          {canEdit && features.sendProposal && (
            <button onClick={() => {
              if (!proposal?.client_email) {
                alert('No client email on file. Edit the client info to add one.')
                return
              }
              setSendForm({
                subject: applyVars(sendTemplateSubject) || `Proposal: ${proposal.proposal_name}`,
                message: applyVars(sendTemplateBody) || `Hi ${proposal.client_name || 'there'},\n\nPlease find your proposal attached. Don't hesitate to reach out with any questions.\n\nLooking forward to working with you.`,
              })
              setShowSendModal(true)
            }}
              className="bg-green-600 text-fp-text px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors">
              ✉ Send Proposal
            </button>
          )}
          {canEdit && proposal?.client_email && !['Won', 'Lost'].includes(proposal?.status) && !proposal?.signature_name && (
            <button onClick={requestSignature} disabled={requestingSignature}
              className="bg-blue-600 text-fp-text px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
              {requestingSignature ? 'Sending...' : '✍️ Request Signature'}
            </button>
          )}
          {proposal?.signature_name && (
            <button onClick={async () => {
              if (proposal.signed_pdf_url) {
                const { getR2Url, BUCKETS } = await import('../../r2')
                const url = proposal.signed_pdf_url.startsWith('http')
                  ? proposal.signed_pdf_url
                  : await getR2Url(proposal.signed_pdf_url, 3600, BUCKETS.DOCUMENTS)
                if (url) { window.open(url, '_blank'); return }
              }
              // No stored R2 PDF — generate a fresh signed copy with the signature page
              if (downloadSignedCopy) downloadSignedCopy()
            }} className="bg-green-600/20 text-green-400 border border-green-600/30 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-600/30 transition-colors flex items-center gap-1">
              ⬇ Signed Copy
            </button>
          )}
          {canEdit && (
            <label className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer flex items-center gap-1 ${uploadingSignedPDF ? 'bg-fp-inset text-fp-muted opacity-50 cursor-not-allowed' : 'bg-fp-inset text-fp-muted hover:text-fp-text'}`}
              title="Upload a physically signed or externally signed agreement PDF">
              {uploadingSignedPDF ? 'Uploading...' : '📎 Upload Signed'}
              <input type="file" accept=".pdf" onChange={uploadSignedPDF} className="hidden" disabled={uploadingSignedPDF} />
            </label>
          )}
          {qboConnected && proposal?.status === 'Won' && (
            <button onClick={sendToQBO} disabled={sendingToQBO}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${qboInvoiceId ? 'bg-green-600/20 text-green-400 border border-green-600/30' : 'bg-[#2CA01C] text-fp-text hover:bg-[#259018]'}`}>
              {sendingToQBO ? 'Sending...' : qboInvoiceId ? '✓ In QuickBooks' : '🟢 Send to QuickBooks'}
            </button>
          )}
          <button onClick={() => setShowPricingModal(true)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${(proposal?.hide_material_prices || proposal?.hide_labor_breakdown || proposal?.show_cover_page) ? 'bg-fp-brand text-white' : 'bg-fp-inset text-fp-muted hover:text-fp-text'}`}>
            ⚙ Options
          </button>
          <div className="relative" ref={dlRef}>
            <button
              onClick={() => setDlOpen(o => !o)}
              className="bg-fp-inset text-fp-text px-4 py-2 rounded-lg text-sm font-semibold hover:bg-fp-hover transition-colors flex items-center gap-1.5">
              ↓ Download
              <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {dlOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-fp-card border border-fp-border rounded-xl shadow-2xl min-w-[220px] py-1 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-fp-border">
                  <span className="text-sm text-fp-text font-semibold">Cover Page</span>
                  <button onClick={onToggleCoverPage}
                    className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${proposal?.show_cover_page ? 'bg-fp-brand' : 'bg-fp-border'}`}>
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${proposal?.show_cover_page ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
                <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fp-muted/60">Standard</p>
                <button onClick={() => { setDlOpen(false); downloadPDF() }}
                  className="w-full text-left px-4 py-2.5 text-sm text-fp-text hover:bg-fp-inset transition-colors flex items-center gap-2">
                  <span className="text-fp-muted text-xs font-mono">PDF</span> Full Proposal
                </button>
                <button onClick={() => { setDlOpen(false); downloadDOCX() }}
                  className="w-full text-left px-4 py-2.5 text-sm text-fp-text hover:bg-fp-inset transition-colors flex items-center gap-2">
                  <span className="text-fp-muted text-xs font-mono">DOCX</span> Full Proposal
                </button>
                <div className="border-t border-fp-border my-1" />
                <p className="px-4 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fp-muted/60">Installer Copy <span className="normal-case font-normal">(no pricing)</span></p>
                {downloadInstallerPDF && (
                  <button onClick={() => { setDlOpen(false); downloadInstallerPDF() }}
                    className="w-full text-left px-4 py-2.5 text-sm text-fp-text hover:bg-fp-inset transition-colors flex items-center gap-2">
                    <span className="text-fp-muted text-xs font-mono">PDF</span> Installer Copy
                  </button>
                )}
                {downloadInstallerDOCX && (
                  <button onClick={() => { setDlOpen(false); downloadInstallerDOCX() }}
                    className="w-full text-left px-4 py-2.5 text-sm text-fp-text hover:bg-fp-inset transition-colors flex items-center gap-2">
                    <span className="text-fp-muted text-xs font-mono">DOCX</span> Installer Copy
                  </button>
                )}
                {downloadBundle && (
                  <>
                    <div className="border-t border-fp-border my-1" />
                    <p className="px-4 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fp-muted/60">Full Bundle</p>
                    <button onClick={() => { setDlOpen(false); downloadBundle() }}
                      className="w-full text-left px-4 py-2.5 text-sm text-fp-text hover:bg-fp-inset transition-colors flex items-center gap-2">
                      <span className="text-fp-muted text-xs font-mono">PDF</span> Proposal + Drawings
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {features.sitePhotos && (
            <button onClick={() => setShowPhotosModal(true)} className="bg-fp-inset text-fp-text px-4 py-2 rounded-lg text-sm font-semibold hover:bg-fp-hover transition-colors flex items-center gap-2">
              📷 Photos{photos.length > 0 ? ` (${photos.length})` : ''}
            </button>
          )}
          {canEdit && (
            <button onClick={generateSOW} disabled={generatingSOW}
              className="bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {generatingSOW ? 'Generating...' : proposal?.scope_of_work ? 'Regenerate SOW' : 'Generate SOW'}
            </button>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="mb-4">
          <label className="text-fp-text text-sm font-semibold block mb-1">AI Notes (Optional)</label>
          <p className="text-fp-muted text-xs mb-2">Describe what you want the Scope of Work to include, how it should sound, or anything important.</p>
          <textarea value={aiNotes} onChange={e => setAiNotes(e.target.value)}
            placeholder="Example: This is for a commercial install. Keep it professional, emphasize safety, and make it easy for a non-technical client to understand."
            className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand min-h-[100px]" />
        </div>
      )}

      {canEdit && editingSOW ? (
        <div className="space-y-3">
          <textarea value={sowDraft} onChange={e => setSowDraft(e.target.value)} rows={14}
            className="w-full bg-fp-inset text-fp-text border border-[#C8622A]/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-y leading-relaxed" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditingSOW(false)} className="px-4 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
            <button onClick={saveSOW} className="bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">Save SOW</button>
          </div>
        </div>
      ) : proposal?.scope_of_work ? (
        <div className="relative group">
          <p className="text-fp-text text-sm leading-relaxed whitespace-pre-wrap">{proposal.scope_of_work}</p>
          {canEdit && (
            <button onClick={() => { setSowDraft(proposal.scope_of_work); setEditingSOW(true) }}
              className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity bg-fp-inset text-fp-muted hover:text-fp-text px-2 py-1 rounded text-xs">
              ✏️ Edit
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <p className="text-fp-muted text-sm">No Scope of Work yet.</p>
          {canEdit && (
            <button onClick={() => { setSowDraft(''); setEditingSOW(true) }}
              className="text-[#C8622A] hover:text-fp-text text-sm font-medium transition-colors">
              ✏️ Write my SOW
            </button>
          )}
        </div>
      )}
    </div>
  )
}
