import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { PATHWAY_DEFS } from '../drawing/SymbolPicker'

const CABLE_OPTIONS = [
  'Cat6', 'Cat6A', 'Cat5e', 'Fiber SM', 'Fiber MM',
  'Coax RG59', 'Coax RG6', 'Speaker 16/2', 'Speaker 14/2',
  '18/2', '22/4', '22/6', 'Composite', 'HDMI', 'HDBaseT',
  'Power', 'Plenum Cat6', 'Plenum 22/4',
]

// Support both old string[] format and new {type,qty}[] format
const normalizeCableTypes = (ct) => {
  if (!ct?.length) return []
  return typeof ct[0] === 'string' ? ct.map(t => ({ type: t, qty: 1 })) : ct
}

export default function PathwayPanel({ pathway, onClose, onUpdate, onDelete }) {
  const [form, setForm] = useState({
    pathway_type:  pathway.pathway_type  || 'EMT',
    label:         pathway.label         || '',
    notes:         pathway.notes         || '',
    cable_types:   normalizeCableTypes(pathway.cable_types),
    hook_interval: pathway.hook_interval ?? 4,
  })
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setForm({
      pathway_type:  pathway.pathway_type  || 'EMT',
      label:         pathway.label         || '',
      notes:         pathway.notes         || '',
      cable_types:   normalizeCableTypes(pathway.cable_types),
      hook_interval: pathway.hook_interval ?? 4,
    })
  }, [pathway.id])

  const save = async () => {
    setSaving(true)
    const { data, error } = await supabase
      .from('drawing_pathways')
      .update({
        pathway_type:  form.pathway_type,
        label:         form.label || null,
        notes:         form.notes || null,
        cable_types:   form.cable_types,
        hook_interval: form.hook_interval,
      })
      .eq('id', pathway.id)
      .select()
      .single()
    setSaving(false)
    if (!error && data) onUpdate?.(data)
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this pathway?')) return
    setDeleting(true)
    await supabase.from('drawing_pathways').delete().eq('id', pathway.id)
    onDelete?.()
  }

  const toggleCable = (cable) => {
    setForm(f => {
      const exists = f.cable_types.find(c => c.type === cable)
      return {
        ...f,
        cable_types: exists
          ? f.cable_types.filter(c => c.type !== cable)
          : [...f.cable_types, { type: cable, qty: 1 }],
      }
    })
  }

  const setQty = (cable, qty) => {
    const n = Math.max(1, parseInt(qty) || 1)
    setForm(f => ({
      ...f,
      cable_types: f.cable_types.map(c => c.type === cable ? { ...c, qty: n } : c),
    }))
  }

  const def        = PATHWAY_DEFS.find(d => d.type === form.pathway_type)
  const footage    = pathway.total_footage || 0
  const hasFootage = footage > 0
  const isJHook    = form.pathway_type === 'J-hook'
  const hookCount  = isJHook && hasFootage ? Math.ceil(footage / form.hook_interval) : null

  return (
    <div className="flex flex-col h-full bg-[#0F1C2E]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a3d55]">
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5 rounded inline-block" style={{ backgroundColor: def?.color }}/>
          <span className="text-sm font-semibold text-white">{def?.label || 'Pathway'}</span>
        </div>
        <button onClick={onClose}
          className="w-6 h-6 flex items-center justify-center text-[#8A9AB0] hover:text-white transition-colors rounded">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

        {/* Summary card */}
        <div className="rounded-lg border border-[#2a3d55] bg-[#0a1628] px-3 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#8A9AB0]">Total length</span>
            <span className="text-sm font-semibold text-white">
              {hasFootage ? `${footage} ft` : <span className="text-[#8A9AB0] text-xs">Set scale to measure</span>}
            </span>
          </div>

          {hasFootage && form.cable_types.length > 0 && (
            <div className="pt-1 border-t border-[#2a3d55]/60 space-y-1">
              <p className="text-xs text-[#8A9AB0]">Cable needed</p>
              {form.cable_types.map(c => (
                <div key={c.type} className="flex items-center justify-between">
                  <span className="text-xs text-white">{c.qty > 1 ? `${c.qty}× ` : ''}{c.type}</span>
                  <span className="text-xs font-medium text-[#C8622A]">{footage * c.qty} ft</span>
                </div>
              ))}
            </div>
          )}

          {isJHook && hasFootage && (
            <div className="pt-1 border-t border-[#2a3d55]/60">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8A9AB0]">J-hooks needed</span>
                <span className="text-sm font-semibold text-[#3b82f6]">{hookCount}</span>
              </div>
              <p className="text-xs text-[#8A9AB0]/60 mt-0.5">@ 1 per {form.hook_interval} ft</p>
            </div>
          )}
        </div>

        {/* J-hook interval */}
        {isJHook && (
          <div>
            <label className="block text-xs font-medium text-[#8A9AB0] mb-1.5">
              Hook interval (ft)
              <span className="ml-1 text-[#8A9AB0]/50 font-normal">BICSI max 4 ft</span>
            </label>
            <div className="flex items-center gap-2">
              {[2, 3, 4, 5].map(v => (
                <button key={v}
                  onClick={() => setForm(f => ({ ...f, hook_interval: v }))}
                  className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${
                    form.hook_interval === v
                      ? 'bg-[#3b82f6]/20 border border-[#3b82f6] text-[#3b82f6]'
                      : 'bg-[#1a2d45] border border-[#2a3d55] text-[#8A9AB0] hover:text-white'
                  }`}>
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Type */}
        <div>
          <label className="block text-xs font-medium text-[#8A9AB0] mb-1.5">Type</label>
          <select value={form.pathway_type}
            onChange={e => setForm(f => ({ ...f, pathway_type: e.target.value }))}
            className="w-full text-xs border border-[#2a3d55] rounded-lg px-2 py-1.5 bg-[#1a2d45] text-white focus:outline-none focus:border-[#C8622A]">
            {PATHWAY_DEFS.map(d => (
              <option key={d.type} value={d.type}>{d.label}</option>
            ))}
          </select>
        </div>

        {/* Label */}
        <div>
          <label className="block text-xs font-medium text-[#8A9AB0] mb-1.5">Label (optional)</label>
          <input type="text" placeholder={def?.label}
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            className="w-full text-xs border border-[#2a3d55] rounded-lg px-2 py-1.5 bg-[#1a2d45] text-white placeholder-[#4a5568] focus:outline-none focus:border-[#C8622A]"/>
        </div>

        {/* Cable types with qty */}
        <div>
          <label className="block text-xs font-medium text-[#8A9AB0] mb-1.5">Cables in this pathway</label>
          <div className="flex flex-col gap-0.5 max-h-52 overflow-y-auto">
            {CABLE_OPTIONS.map(cable => {
              const entry   = form.cable_types.find(c => c.type === cable)
              const checked = !!entry
              return (
                <div key={cable}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded transition-colors ${
                    checked ? 'bg-[#C8622A]/10' : 'hover:bg-[#1a2d45]'
                  }`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleCable(cable)}
                    className="accent-[#C8622A] flex-shrink-0"/>
                  <span className="text-xs text-white flex-1">{cable}</span>
                  {checked && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => setQty(cable, (entry.qty || 1) - 1)}
                        className="w-5 h-5 flex items-center justify-center rounded bg-[#1a2d45] text-[#8A9AB0] hover:text-white text-xs leading-none">−</button>
                      <span className="w-5 text-center text-xs font-medium text-[#C8622A]">{entry.qty}</span>
                      <button onClick={() => setQty(cable, (entry.qty || 1) + 1)}
                        className="w-5 h-5 flex items-center justify-center rounded bg-[#1a2d45] text-[#8A9AB0] hover:text-white text-xs leading-none">+</button>
                      {hasFootage && (
                        <span className="text-xs text-[#8A9AB0] w-14 text-right">{footage * entry.qty}ft</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-[#8A9AB0] mb-1.5">Notes</label>
          <textarea rows={2} placeholder="Optional notes..."
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="w-full text-xs border border-[#2a3d55] rounded-lg px-2 py-1.5 bg-[#1a2d45] text-white placeholder-[#4a5568] focus:outline-none focus:border-[#C8622A] resize-none"/>
        </div>

        <p className="text-xs text-[#8A9AB0]">
          {pathway.points?.length || 0} points · Double-click pathway to edit waypoints
        </p>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#2a3d55] flex gap-2">
        <button onClick={save} disabled={saving}
          className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-[#C8622A] text-white hover:bg-[#b5551e] disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={handleDelete} disabled={deleting}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors">
          {deleting ? '…' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
