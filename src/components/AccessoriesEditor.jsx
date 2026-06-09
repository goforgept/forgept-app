import { useState } from 'react'
import { supabase } from '../supabase'

export default function AccessoriesEditor({ product, tableName = 'global_products', onClose, onSaved }) {
  const [accessories, setAccessories] = useState(product.accessories || { required: [], options: [] })
  const [saving, setSaving] = useState(false)
  const [reqForm, setReqForm] = useState({ type: '', part_number: '', name: '', manufacturer: product.manufacturer || '', quantity: 1 })
  const [optForm, setOptForm] = useState({ group: '', required: true, default: '' })
  const [optChoice, setOptChoice] = useState({ part_number: '', name: '', manufacturer: product.manufacturer || '' })
  const [editingGroupIdx, setEditingGroupIdx] = useState(null)

  const ic = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A] placeholder-[#4a5a6a]"

  const addRequired = () => {
    if (!reqForm.type || !reqForm.part_number) return
    setAccessories(p => ({ ...p, required: [...(p.required || []), { ...reqForm, quantity: parseInt(reqForm.quantity) || 1 }] }))
    setReqForm({ type: '', part_number: '', name: '', manufacturer: product.manufacturer || '', quantity: 1 })
  }

  const addOptionGroup = () => {
    if (!optForm.group) return
    setAccessories(p => ({ ...p, options: [...(p.options || []), { ...optForm, choices: [] }] }))
    setOptForm({ group: '', required: true, default: '' })
  }

  const addChoice = (groupIdx) => {
    if (!optChoice.part_number) return
    setAccessories(p => {
      const options = [...p.options]
      options[groupIdx] = { ...options[groupIdx], choices: [...(options[groupIdx].choices || []), { ...optChoice }] }
      return { ...p, options }
    })
    setOptChoice({ part_number: '', name: '', manufacturer: product.manufacturer || '' })
  }

  const handleSave = async () => {
    setSaving(true)
    const { data, error } = await supabase.from(tableName).update({ accessories }).eq('id', product.id).select().single()
    setSaving(false)
    if (!error && data) onSaved(data)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-[#1a2d45] px-6 py-4 border-b border-[#2a3d55] flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-base">Accessories</h3>
            <p className="text-[#8A9AB0] text-xs mt-0.5">{product.part_number} · {product.name}</p>
          </div>
          <button onClick={onClose} className="text-[#8A9AB0] hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Required Components */}
          <div>
            <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide mb-3">Required Components</p>
            {(accessories.required || []).length > 0 && (
              <div className="bg-[#0F1C2E] rounded-xl border border-[#2a3d55] divide-y divide-[#2a3d55]/50 mb-3">
                {accessories.required.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1">
                      <span className="text-white text-xs font-medium">{item.type}</span>
                      <span className="text-[#8A9AB0] text-xs ml-2">{item.part_number}</span>
                      <span className="text-[#4a5a6a] text-xs ml-2">{item.name}</span>
                    </div>
                    <span className="text-[#8A9AB0] text-xs">×{item.quantity}</span>
                    <button onClick={() => setAccessories(p => ({ ...p, required: p.required.filter((_, i) => i !== idx) }))}
                      className="text-red-400 hover:text-red-300 text-xs">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-5 gap-2">
              <input placeholder="Type (e.g. Lock)" value={reqForm.type} onChange={e => setReqForm(p => ({ ...p, type: e.target.value }))} className={ic} />
              <input placeholder="Part #" value={reqForm.part_number} onChange={e => setReqForm(p => ({ ...p, part_number: e.target.value }))} className={ic} />
              <input placeholder="Name" value={reqForm.name} onChange={e => setReqForm(p => ({ ...p, name: e.target.value }))} className={ic} />
              <input placeholder="Mfr" value={reqForm.manufacturer} onChange={e => setReqForm(p => ({ ...p, manufacturer: e.target.value }))} className={ic} />
              <div className="flex gap-1">
                <input type="number" min="1" placeholder="Qty" value={reqForm.quantity} onChange={e => setReqForm(p => ({ ...p, quantity: e.target.value }))} className={`${ic} w-12`} />
                <button onClick={addRequired} className="bg-[#C8622A] text-white px-2 py-1 rounded text-xs hover:bg-[#b5571f] transition-colors">Add</button>
              </div>
            </div>
          </div>

          {/* Option Groups */}
          <div>
            <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide mb-3">Option Groups</p>
            {(accessories.options || []).map((group, groupIdx) => (
              <div key={groupIdx} className="bg-[#0F1C2E] rounded-xl border border-[#2a3d55] mb-3">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a3d55]">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-xs font-semibold">{group.group}</span>
                    {group.required && <span className="text-xs bg-[#C8622A]/20 text-[#C8622A] px-1.5 py-0.5 rounded">Required</span>}
                    {group.default && <span className="text-xs text-[#8A9AB0]">Default: {group.default}</span>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingGroupIdx(editingGroupIdx === groupIdx ? null : groupIdx)}
                      className="text-xs text-[#C8622A] hover:text-white transition-colors">
                      {editingGroupIdx === groupIdx ? 'Done' : '+ Add Choice'}
                    </button>
                    <button onClick={() => { setAccessories(p => ({ ...p, options: p.options.filter((_, i) => i !== groupIdx) })); if (editingGroupIdx === groupIdx) setEditingGroupIdx(null) }}
                      className="text-red-400 hover:text-red-300 text-xs">✕</button>
                  </div>
                </div>
                {(group.choices || []).map((choice, choiceIdx) => (
                  <div key={choiceIdx} className="flex items-center gap-3 px-3 py-1.5 border-b border-[#2a3d55]/30">
                    <span className="text-[#C8622A] font-mono text-xs w-28 truncate">{choice.part_number}</span>
                    <span className="text-white text-xs flex-1">{choice.name}</span>
                    <span className="text-[#8A9AB0] text-xs">{choice.manufacturer}</span>
                    {group.default === choice.part_number && <span className="text-xs bg-green-900/40 text-green-400 px-1.5 py-0.5 rounded">Default</span>}
                    <button onClick={() => setAccessories(p => { const opts = [...p.options]; opts[groupIdx] = { ...opts[groupIdx], default: choice.part_number }; return { ...p, options: opts } })}
                      className="text-xs text-[#8A9AB0] hover:text-green-400 transition-colors">Set Default</button>
                    <button onClick={() => setAccessories(p => { const opts = [...p.options]; opts[groupIdx].choices = opts[groupIdx].choices.filter((_, i) => i !== choiceIdx); return { ...p, options: opts } })}
                      className="text-red-400 hover:text-red-300 text-xs">✕</button>
                  </div>
                ))}
                {editingGroupIdx === groupIdx && (
                  <div className="px-3 py-2 space-y-2 bg-[#0F1C2E]/50">
                    <p className="text-[#8A9AB0] text-xs font-medium">Add Choice:</p>
                    <div className="grid grid-cols-3 gap-2">
                      <input placeholder="Part Number" value={optChoice.part_number} onChange={e => setOptChoice(p => ({ ...p, part_number: e.target.value }))} className={ic} />
                      <input placeholder="Name" value={optChoice.name} onChange={e => setOptChoice(p => ({ ...p, name: e.target.value }))} className={ic} />
                      <input placeholder="Manufacturer" value={optChoice.manufacturer} onChange={e => setOptChoice(p => ({ ...p, manufacturer: e.target.value }))} className={ic} />
                    </div>
                    <button onClick={() => addChoice(groupIdx)} className="bg-[#C8622A] text-white px-3 py-1.5 rounded text-xs hover:bg-[#b5571f] transition-colors">Add Choice</button>
                  </div>
                )}
              </div>
            ))}
            <div className="flex gap-2">
              <input placeholder="Group name (e.g. Mount Type)" value={optForm.group} onChange={e => setOptForm(p => ({ ...p, group: e.target.value }))} className={`${ic} flex-1`} />
              <label className="flex items-center gap-1.5 text-xs text-[#8A9AB0] cursor-pointer">
                <input type="checkbox" checked={optForm.required} onChange={e => setOptForm(p => ({ ...p, required: e.target.checked }))} className="accent-[#C8622A]" />
                Required
              </label>
              <button onClick={addOptionGroup} className="bg-[#2a3d55] text-white px-3 py-1.5 rounded text-xs hover:bg-[#3a4d65] transition-colors flex-shrink-0">Add Group</button>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-[#1a2d45] px-6 py-4 border-t border-[#2a3d55] flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-[#2a3d55] text-[#8A9AB0] rounded-lg hover:text-white transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 text-sm font-semibold bg-[#C8622A] text-white rounded-lg hover:bg-[#b5571f] transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Accessories'}
          </button>
        </div>
      </div>
    </div>
  )
}
