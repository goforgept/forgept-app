const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inputClass = "bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"

export default function ChangeOrderModal({ coForm, setCoForm, savingCO, onSave, onClose }) {
  const matTotal = (coForm.line_items || []).reduce((sum, l) => sum + ((parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
  const labTotal = (coForm.labor_items || []).reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
  const coTotal = matTotal + labTotal

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-white font-bold text-lg mb-5">New Change Order</h3>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Name <span className="text-[#C8622A]">*</span></label>
              <input type="text" value={coForm.name} onChange={e => setCoForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Additional camera location" className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Description</label>
              <input type="text" value={coForm.description} onChange={e => setCoForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Brief description..." className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">Materials</p>
              <button onClick={() => setCoForm(p => ({ ...p, line_items: [...(p.line_items || []), { id: crypto.randomUUID(), item_name: '', quantity: 1, unit: 'ea', your_cost_unit: '', markup_percent: 35, customer_price_unit: '' }] }))}
                className="text-[#C8622A] text-xs hover:text-white transition-colors">+ Add Material</button>
            </div>
            {(coForm.line_items || []).length === 0
              ? <p className="text-[#8A9AB0] text-xs italic">No materials added yet.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#2a3d55]">
                        {['Item Name', 'Qty', 'Unit', 'Your Cost', 'Markup %', 'Unit Price', 'Total', ''].map(h => (
                          <th key={h} className="text-[#8A9AB0] text-left py-1.5 pr-2 font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(coForm.line_items || []).map((line, i) => {
                        const lineTotal = (parseFloat(line.customer_price_unit) || 0) * (parseFloat(line.quantity) || 0)
                        return (
                          <tr key={line.id} className="border-b border-[#2a3d55]/30">
                            <td className="pr-2 py-1"><input value={line.item_name} onChange={e => setCoForm(p => { const li = [...(p.line_items||[])]; li[i] = {...li[i], item_name: e.target.value}; return {...p, line_items: li} })} placeholder="Item name" className={`w-36 ${inputClass}`} /></td>
                            <td className="pr-2 py-1"><input type="number" min="0" value={line.quantity} onChange={e => setCoForm(p => { const li = [...(p.line_items||[])]; li[i] = {...li[i], quantity: e.target.value}; return {...p, line_items: li} })} className={`w-14 ${inputClass}`} /></td>
                            <td className="pr-2 py-1"><select value={line.unit} onChange={e => setCoForm(p => { const li = [...(p.line_items||[])]; li[i] = {...li[i], unit: e.target.value}; return {...p, line_items: li} })} className={inputClass}>{['ea','ft','lot','hr','box','roll'].map(u => <option key={u}>{u}</option>)}</select></td>
                            <td className="pr-2 py-1"><input type="number" min="0" step="0.01" placeholder="0.00" value={line.your_cost_unit} onChange={e => setCoForm(p => { const li = [...(p.line_items||[])]; const cost = parseFloat(e.target.value)||0; const mkp = parseFloat(li[i].markup_percent)||0; li[i] = {...li[i], your_cost_unit: e.target.value, customer_price_unit: (cost*(1+mkp/100)).toFixed(2)}; return {...p, line_items: li} })} className={`w-20 ${inputClass}`} /></td>
                            <td className="pr-2 py-1"><input type="number" min="0" placeholder="35" value={line.markup_percent} onChange={e => setCoForm(p => { const li = [...(p.line_items||[])]; const mkp = parseFloat(e.target.value)||0; const cost = parseFloat(li[i].your_cost_unit)||0; li[i] = {...li[i], markup_percent: e.target.value, customer_price_unit: (cost*(1+mkp/100)).toFixed(2)}; return {...p, line_items: li} })} className={`w-14 ${inputClass}`} /></td>
                            <td className="pr-2 py-1"><input type="number" min="0" step="0.01" placeholder="0.00" value={line.customer_price_unit} onChange={e => setCoForm(p => { const li = [...(p.line_items||[])]; li[i] = {...li[i], customer_price_unit: e.target.value}; return {...p, line_items: li} })} className={`w-20 ${inputClass}`} /></td>
                            <td className="pr-2 py-1 text-white font-medium">${lineTotal.toLocaleString('en-US',{minimumFractionDigits:2})}</td>
                            <td className="py-1"><button onClick={() => setCoForm(p => ({...p, line_items: (p.line_items||[]).filter((_,idx)=>idx!==i)}))} className="text-[#8A9AB0] hover:text-red-400">✕</button></td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr><td colSpan="6" className="text-[#8A9AB0] text-right pt-2 pr-2 font-semibold">Materials Total</td><td className="text-[#C8622A] font-bold pt-2">${matTotal.toLocaleString('en-US',{minimumFractionDigits:2})}</td><td></td></tr>
                    </tfoot>
                  </table>
                </div>
              )
            }
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">Labor</p>
              <button onClick={() => setCoForm(p => ({ ...p, labor_items: [...(p.labor_items || []), { id: crypto.randomUUID(), role: '', quantity: '', unit: 'hr', your_cost: '', markup: 35, customer_price: '' }] }))}
                className="text-[#C8622A] text-xs hover:text-white transition-colors">+ Add Labor</button>
            </div>
            {(coForm.labor_items || []).length === 0
              ? <p className="text-[#8A9AB0] text-xs italic">No labor added yet.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#2a3d55]">
                        {['Role', 'Qty', 'Unit', 'Your Cost', 'Markup %', 'Total', ''].map(h => (
                          <th key={h} className="text-[#8A9AB0] text-left py-1.5 pr-2 font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(coForm.labor_items || []).map((labor, i) => (
                        <tr key={labor.id} className="border-b border-[#2a3d55]/30">
                          <td className="pr-2 py-1"><input value={labor.role} onChange={e => setCoForm(p => { const li = [...(p.labor_items||[])]; li[i] = {...li[i], role: e.target.value}; return {...p, labor_items: li} })} placeholder="e.g. Electrician" className={`w-36 ${inputClass}`} /></td>
                          <td className="pr-2 py-1"><input type="number" min="0" step="0.5" value={labor.quantity} onChange={e => setCoForm(p => { const li = [...(p.labor_items||[])]; const qty=parseFloat(e.target.value)||0; const cost=parseFloat(li[i].your_cost)||0; const mkp=parseFloat(li[i].markup)||0; li[i]={...li[i],quantity:e.target.value,customer_price:(cost*(1+mkp/100)*qty).toFixed(2)}; return {...p,labor_items:li} })} className={`w-14 ${inputClass}`} /></td>
                          <td className="pr-2 py-1"><select value={labor.unit} onChange={e => setCoForm(p => { const li=[...(p.labor_items||[])]; li[i]={...li[i],unit:e.target.value}; return {...p,labor_items:li} })} className={inputClass}>{['hr','day','lot'].map(u => <option key={u}>{u}</option>)}</select></td>
                          <td className="pr-2 py-1"><input type="number" min="0" step="0.01" placeholder="0.00" value={labor.your_cost} onChange={e => setCoForm(p => { const li=[...(p.labor_items||[])]; const cost=parseFloat(e.target.value)||0; const mkp=parseFloat(li[i].markup)||0; const qty=parseFloat(li[i].quantity)||0; li[i]={...li[i],your_cost:e.target.value,customer_price:(cost*(1+mkp/100)*qty).toFixed(2)}; return {...p,labor_items:li} })} className={`w-20 ${inputClass}`} /></td>
                          <td className="pr-2 py-1"><input type="number" min="0" placeholder="35" value={labor.markup} onChange={e => setCoForm(p => { const li=[...(p.labor_items||[])]; const mkp=parseFloat(e.target.value)||0; const cost=parseFloat(li[i].your_cost)||0; const qty=parseFloat(li[i].quantity)||0; li[i]={...li[i],markup:e.target.value,customer_price:(cost*(1+mkp/100)*qty).toFixed(2)}; return {...p,labor_items:li} })} className={`w-14 ${inputClass}`} /></td>
                          <td className="pr-2 py-1 text-white font-medium">${(parseFloat(labor.customer_price)||0).toLocaleString('en-US',{minimumFractionDigits:2})}</td>
                          <td className="py-1"><button onClick={() => setCoForm(p => ({...p,labor_items:(p.labor_items||[]).filter((_,idx)=>idx!==i)}))} className="text-[#8A9AB0] hover:text-red-400">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr><td colSpan="5" className="text-[#8A9AB0] text-right pt-2 pr-2 font-semibold">Labor Total</td><td className="text-[#C8622A] font-bold pt-2">${labTotal.toLocaleString('en-US',{minimumFractionDigits:2})}</td><td></td></tr>
                    </tfoot>
                  </table>
                </div>
              )
            }
          </div>

          {((coForm.line_items||[]).length > 0 || (coForm.labor_items||[]).length > 0) && (
            <div className="bg-[#0F1C2E] rounded-xl p-4 flex justify-between items-center">
              <div className="text-sm text-[#8A9AB0] space-y-0.5">
                {(coForm.line_items||[]).length > 0 && <p>Materials: <span className="text-white">${matTotal.toLocaleString('en-US',{minimumFractionDigits:2})}</span></p>}
                {(coForm.labor_items||[]).length > 0 && <p>Labor: <span className="text-white">${labTotal.toLocaleString('en-US',{minimumFractionDigits:2})}</span></p>}
              </div>
              <div className="text-right">
                <p className="text-[#8A9AB0] text-xs mb-0.5">Change Order Total</p>
                <p className="text-[#C8622A] font-bold text-xl">${coTotal.toLocaleString('en-US',{minimumFractionDigits:2})}</p>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
            <button onClick={onSave} disabled={savingCO || !coForm.name.trim()}
              className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {savingCO ? 'Saving...' : 'Create Change Order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
