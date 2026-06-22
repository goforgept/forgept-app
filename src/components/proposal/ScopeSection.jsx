export default function ScopeSection({
  proposal, features, photos,
  aiNotes, setAiNotes,
  editingSOW, sowDraft, setSowDraft, setEditingSOW, saveSOW,
  generatingSOW, generateSOW,
  sendForm, setSendForm, setShowSendModal,
  requestingSignature, requestSignature,
  uploadingSignedPDF, uploadSignedPDF,
  qboConnected, qboInvoiceId, sendingToQBO, sendToQBO,
  setShowPricingModal, downloadPDF, downloadDOCX,
  setShowPhotosModal,
  canEdit = true,
}) {
  return (
    <div className="bg-[#1a2d45] rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-white font-bold text-lg">Scope of Work</h3>
        <div className="flex gap-2 flex-wrap">
          {canEdit && features.sendProposal && proposal?.client_email && (
            <button onClick={() => { setSendForm({ subject: `Proposal: ${proposal.proposal_name}`, message: `Hi ${proposal.client_name || 'there'},\n\nPlease find your proposal attached. Don't hesitate to reach out with any questions.\n\nLooking forward to working with you.` }); setShowSendModal(true) }}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors">
              ✉ Send Proposal
            </button>
          )}
          {canEdit && proposal?.client_email && proposal?.status === 'Sent' && !proposal?.signature_name && (
            <button onClick={requestSignature} disabled={requestingSignature}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
              {requestingSignature ? 'Sending...' : '✍️ Request Signature'}
            </button>
          )}
          {proposal?.signed_pdf_url && (
            <button onClick={async () => {
              const { getR2Url, BUCKETS } = await import('../../r2')
              const url = proposal.signed_pdf_url.startsWith('http')
                ? proposal.signed_pdf_url
                : await getR2Url(proposal.signed_pdf_url, 3600, BUCKETS.DOCUMENTS)
              if (url) window.open(url, '_blank')
            }} className="bg-green-600/20 text-green-400 border border-green-600/30 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-600/30 transition-colors flex items-center gap-1">
              ⬇ Signed Copy
            </button>
          )}
          {canEdit && (
            <label className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer flex items-center gap-1 ${uploadingSignedPDF ? 'bg-[#2a3d55] text-[#8A9AB0] opacity-50 cursor-not-allowed' : 'bg-[#2a3d55] text-[#8A9AB0] hover:text-white'}`}
              title="Upload a physically signed or externally signed agreement PDF">
              {uploadingSignedPDF ? 'Uploading...' : '📎 Upload Signed'}
              <input type="file" accept=".pdf" onChange={uploadSignedPDF} className="hidden" disabled={uploadingSignedPDF} />
            </label>
          )}
          {qboConnected && proposal?.status === 'Won' && (
            <button onClick={sendToQBO} disabled={sendingToQBO}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${qboInvoiceId ? 'bg-green-600/20 text-green-400 border border-green-600/30' : 'bg-[#2CA01C] text-white hover:bg-[#259018]'}`}>
              {sendingToQBO ? 'Sending...' : qboInvoiceId ? '✓ In QuickBooks' : '🟢 Send to QuickBooks'}
            </button>
          )}
          <button onClick={() => setShowPricingModal(true)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${(proposal?.hide_material_prices || proposal?.hide_labor_breakdown) ? 'bg-[#C8622A] text-white' : 'bg-[#2a3d55] text-[#8A9AB0] hover:text-white'}`}>
            ⚙ Pricing
          </button>
          <button onClick={downloadPDF} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3a4d65] transition-colors">↓ PDF</button>
          <button onClick={downloadDOCX} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3a4d65] transition-colors">↓ DOCX</button>
          {features.sitePhotos && (
            <button onClick={() => setShowPhotosModal(true)} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3a4d65] transition-colors flex items-center gap-2">
              📷 Photos{photos.length > 0 ? ` (${photos.length})` : ''}
            </button>
          )}
          {canEdit && (
            <button onClick={generateSOW} disabled={generatingSOW}
              className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {generatingSOW ? 'Generating...' : proposal?.scope_of_work ? 'Regenerate SOW' : 'Generate SOW'}
            </button>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="mb-4">
          <label className="text-white text-sm font-semibold block mb-1">AI Notes (Optional)</label>
          <p className="text-[#8A9AB0] text-xs mb-2">Describe what you want the Scope of Work to include, how it should sound, or anything important.</p>
          <textarea value={aiNotes} onChange={e => setAiNotes(e.target.value)}
            placeholder="Example: This is for a commercial install. Keep it professional, emphasize safety, and make it easy for a non-technical client to understand."
            className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] min-h-[100px]" />
        </div>
      )}

      {canEdit && editingSOW ? (
        <div className="space-y-3">
          <textarea value={sowDraft} onChange={e => setSowDraft(e.target.value)} rows={14}
            className="w-full bg-[#0F1C2E] text-white border border-[#C8622A]/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-y leading-relaxed" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditingSOW(false)} className="px-4 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
            <button onClick={saveSOW} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">Save SOW</button>
          </div>
        </div>
      ) : proposal?.scope_of_work ? (
        <div className="relative group">
          <p className="text-[#D6E4F0] text-sm leading-relaxed whitespace-pre-wrap">{proposal.scope_of_work}</p>
          {canEdit && (
            <button onClick={() => { setSowDraft(proposal.scope_of_work); setEditingSOW(true) }}
              className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity bg-[#2a3d55] text-[#8A9AB0] hover:text-white px-2 py-1 rounded text-xs">
              ✏️ Edit
            </button>
          )}
        </div>
      ) : (
        <p className="text-[#8A9AB0] text-sm">No Scope of Work yet.{canEdit ? ' Click Generate SOW to create one.' : ''}</p>
      )}
    </div>
  )
}
