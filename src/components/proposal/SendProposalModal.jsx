export default function SendProposalModal({ proposal, sendForm, setSendForm, sendingProposal, onSend, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-fp-card rounded-2xl p-6 w-full max-w-lg">
        <h3 className="text-fp-text font-bold text-lg mb-1">Send Proposal</h3>
        <p className="text-fp-muted text-sm mb-5">Sending to <span className="text-fp-text font-medium">{proposal?.client_email}</span> · PDF will be attached</p>
        <div className="space-y-4">
          <div><label className="text-fp-muted text-xs mb-1 block">Subject</label><input type="text" value={sendForm.subject} onChange={e => setSendForm(p => ({ ...p, subject: e.target.value }))} className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" /></div>
          <div><label className="text-fp-muted text-xs mb-1 block">Message</label><textarea value={sendForm.message} onChange={e => setSendForm(p => ({ ...p, message: e.target.value }))} rows={6} className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none" /></div>
          <div className="bg-fp-inset rounded-lg px-4 py-3 text-xs text-fp-muted">
            <p>✓ PDF proposal will be attached automatically</p><p>✓ Proposal will be marked as Sent</p><p>✓ Follow-up emails will begin on your cadence</p><p>✓ Reply-to will be set to your email</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
            <button onClick={onSend} disabled={sendingProposal || !sendForm.subject || !sendForm.message} className="flex-1 bg-green-600 text-fp-text py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50">{sendingProposal ? 'Sending...' : 'Send Proposal →'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
