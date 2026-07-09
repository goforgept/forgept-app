export default function SaveTemplateModal({ lineItems, laborItems, templateName, setTemplateName, savingTemplate, onSave, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-fp-card rounded-2xl p-6 w-full max-w-sm">
        <div className="w-12 h-12 rounded-full bg-[#C8622A]/20 flex items-center justify-center mx-auto mb-4"><span className="text-[#C8622A] text-xl">📋</span></div>
        <h3 className="text-fp-text font-bold text-lg mb-2 text-center">Save as Template</h3>
        <p className="text-fp-muted text-sm mb-5 text-center">This will save all {lineItems.length} line items{laborItems.filter(l => l.role).length > 0 ? ` and ${laborItems.filter(l => l.role).length} labor item${laborItems.filter(l => l.role).length > 1 ? 's' : ''}` : ''} as a reusable template.</p>
        <div className="mb-4">
          <label className="text-fp-muted text-xs mb-1 block">Template Name</label>
          <input type="text" value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="e.g. 8 Camera Install"
            className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" autoFocus />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 bg-fp-inset text-fp-muted hover:text-fp-text rounded-lg text-sm transition-colors">Cancel</button>
          <button onClick={onSave} disabled={savingTemplate || !templateName.trim()} className="flex-1 py-2 bg-fp-brand text-white rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">{savingTemplate ? 'Saving...' : 'Save Template'}</button>
        </div>
      </div>
    </div>
  )
}
