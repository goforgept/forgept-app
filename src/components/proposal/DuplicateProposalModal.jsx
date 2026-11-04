import { useState } from 'react'

export default function DuplicateProposalModal({ proposal, onDuplicate, onClose, duplicating }) {
  const [form, setForm] = useState({
    proposal_name: `Copy of ${proposal?.proposal_name || 'Proposal'}`,
    company:       proposal?.company       || '',
    client_name:   proposal?.client_name   || '',
    client_email:  proposal?.client_email  || '',
  })

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const inputCls = "w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-fp-card rounded-2xl p-6 w-full max-w-lg shadow-2xl">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-fp-text font-bold text-lg">Duplicate Proposal</h2>
          <button onClick={onClose} className="text-fp-muted hover:text-fp-text text-xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Proposal Name</label>
            <input type="text" value={form.proposal_name} onChange={e => set('proposal_name', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Company</label>
            <input type="text" value={form.company} onChange={e => set('company', e.target.value)} placeholder="e.g. Acme Corp" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Contact Name</label>
              <input type="text" value={form.client_name} onChange={e => set('client_name', e.target.value)} placeholder="e.g. Jane Smith" className={inputCls} />
            </div>
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Contact Email</label>
              <input type="email" value={form.client_email} onChange={e => set('client_email', e.target.value)} placeholder="e.g. jane@acme.com" className={inputCls} />
            </div>
          </div>
          <p className="text-fp-muted text-xs">All line items, sections, and labor will be copied. Status will be reset to Draft.</p>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-fp-border text-fp-muted hover:text-fp-text text-sm transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onDuplicate(form)}
            disabled={duplicating || !form.proposal_name.trim()}
            className="flex-1 bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
          >
            {duplicating ? 'Duplicating…' : 'Duplicate'}
          </button>
        </div>
      </div>
    </div>
  )
}
