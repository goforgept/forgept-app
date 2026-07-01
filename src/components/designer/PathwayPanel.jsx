import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { PATHWAY_DEFS } from '../drawing/SymbolPicker'

const CABLE_OPTIONS = [
  'Cat6', 'Cat6A', 'Cat5e', 'Fiber SM', 'Fiber MM',
  'Coax RG59', 'Coax RG6', 'Speaker 16/2', 'Speaker 14/2',
  '18/2', '22/4', '22/6', 'Composite', 'HDMI', 'HDBaseT',
  'Power', 'Plenum Cat6', 'Plenum 22/4',
]

export default function PathwayPanel({ pathway, onClose, onUpdate, onDelete }) {
  const [form, setForm] = useState({
    pathway_type: pathway.pathway_type || 'EMT',
    label:        pathway.label        || '',
    notes:        pathway.notes        || '',
    cable_types:  pathway.cable_types  || [],
  })
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setForm({
      pathway_type: pathway.pathway_type || 'EMT',
      label:        pathway.label        || '',
      notes:        pathway.notes        || '',
      cable_types:  pathway.cable_types  || [],
    })
  }, [pathway.id])

  const save = async () => {
    setSaving(true)
    const { data, error } = await supabase
      .from('drawing_pathways')
      .update({
        pathway_type: form.pathway_type,
        label:        form.label || null,
        notes:        form.notes || null,
        cable_types:  form.cable_types,
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
    setForm(f => ({
      ...f,
      cable_types: f.cable_types.includes(cable)
        ? f.cable_types.filter(c => c !== cable)
        : [...f.cable_types, cable],
    }))
  }

  const def = PATHWAY_DEFS.find(d => d.type === form.pathway_type)

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

        {/* Cable types */}
        <div>
          <label className="block text-xs font-medium text-[#8A9AB0] mb-1.5">Cables in this pathway</label>
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
            {CABLE_OPTIONS.map(cable => (
              <label key={cable}
                className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-[#1a2d45] transition-colors">
                <input type="checkbox"
                  checked={form.cable_types.includes(cable)}
                  onChange={() => toggleCable(cable)}
                  className="accent-[#C8622A]"/>
                <span className="text-xs text-white">{cable}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-[#8A9AB0] mb-1.5">Notes</label>
          <textarea rows={3} placeholder="Optional notes..."
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="w-full text-xs border border-[#2a3d55] rounded-lg px-2 py-1.5 bg-[#1a2d45] text-white placeholder-[#4a5568] focus:outline-none focus:border-[#C8622A] resize-none"/>
        </div>

        {/* Point count */}
        <div className="text-xs text-[#8A9AB0]">
          {pathway.points?.length || 0} points drawn
        </div>
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
