export default function InvoicingTab({ invoicingForm, setInvoicingForm, inputClass, savingInvoicing, handleSaveInvoicing }) {
  return (
    <div className="space-y-6">
      <div className="bg-[#1a2d45] rounded-xl p-6">
        <h3 className="text-white font-bold mb-1">Payment Instructions</h3>
        <p className="text-[#8A9AB0] text-sm mb-5">These appear on every invoice PDF so clients know how to pay you.</p>
        <div className="space-y-4">
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Make Checks Payable To</label>
            <input type="text" value={invoicingForm.payment_instructions_payable_to}
              onChange={e => setInvoicingForm(p => ({ ...p, payment_instructions_payable_to: e.target.value }))}
              placeholder="Your company legal name" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Bank Name</label>
              <input type="text" value={invoicingForm.payment_instructions_bank}
                onChange={e => setInvoicingForm(p => ({ ...p, payment_instructions_bank: e.target.value }))}
                placeholder="e.g. First National Bank" className={inputClass} />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Zelle / Venmo</label>
              <input type="text" value={invoicingForm.payment_instructions_zelle}
                onChange={e => setInvoicingForm(p => ({ ...p, payment_instructions_zelle: e.target.value }))}
                placeholder="email or phone number" className={inputClass} />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Routing Number</label>
              <input type="text" value={invoicingForm.payment_instructions_routing}
                onChange={e => setInvoicingForm(p => ({ ...p, payment_instructions_routing: e.target.value }))}
                placeholder="Optional" className={inputClass} />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Account Number</label>
              <input type="text" value={invoicingForm.payment_instructions_account}
                onChange={e => setInvoicingForm(p => ({ ...p, payment_instructions_account: e.target.value }))}
                placeholder="Optional" className={inputClass} />
            </div>
          </div>
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Additional Notes</label>
            <textarea value={invoicingForm.payment_instructions_notes}
              onChange={e => setInvoicingForm(p => ({ ...p, payment_instructions_notes: e.target.value }))}
              rows={3} placeholder="e.g. Net 30 terms. Late payments subject to 1.5% monthly finance charge."
              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" />
          </div>
        </div>
      </div>
      <button onClick={handleSaveInvoicing} disabled={savingInvoicing}
        className="bg-[#C8622A] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
        {savingInvoicing ? 'Saving...' : 'Save Invoicing Settings'}
      </button>
    </div>
  )
}
