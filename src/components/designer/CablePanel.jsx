import { useState, useRef } from 'react'
import { supabase } from '../../supabase'

export default function CablePanel({ cable, onClose, onUpdate, onDelete, onEditPoints }) {
  const [form, setForm] = useState({
    cable_type:   cable.cable_type   || 'Cat6',
    label:        cable.label        || '',
    part_number:  cable.part_number  || '',
    waste_factor: cable.waste_factor || 10,
    color:        cable.color        || '#3b82f6',
    stroke_width: cable.stroke_width || 2,
  })
  const [saved,      setSaved]      = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const saveTimer = useRef(null)

  const update = (field, value) => {
    const updated = { ...form, [field]: value }
    setForm(updated)

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const totalFootage = Math.round(cable.footage * (1 + updated.waste_factor / 100))
      const { error } = await supabase.from('cable_runs').update({
        cable_type:    updated.cable_type,
        label:         updated.label        || null,
        part_number:   updated.part_number  || null,
        waste_factor:  parseFloat(updated.waste_factor) || 10,
        total_footage: totalFootage,
        color:         updated.color        || '#3b82f6',
        stroke_width:  updated.stroke_width || 2,
      }).eq('id', cable.id)
      if (!error) {
        setSaved(true)
        onUpdate?.({ ...cable, ...updated, total_footage: totalFootage })
        setTimeout(() => setSaved(false), 1500)
      }
    }, 600)
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this cable run?')) return
    setDeleting(true)
    await supabase.from('cable_runs').delete().eq('id', cable.id)
    onDelete?.()
  }

  const totalFootage = Math.round((cable.footage || 0) * (1 + (form.waste_factor || 10) / 100))
  const inputClass   = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]"
  const labelClass   = "text-[#8A9AB0] text-xs mb-1 block"

  return (
    <>
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-[#2a3d55] flex-shrink-0">
        <div>
          <p className="text-white text-sm font-semibold">{form.cable_type}</p>
          <p className="text-[#8A9AB0] text-xs">Cable Run</p>
        </div>
        <button onClick={onClose} className="text-[#8A9AB0] hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {/* Cable type + part number */}
        <div className="space-y-2">
          <div>
            <label className={labelClass}>Part Number</label>
            <input type="text" value={form.part_number}
              onChange={e => update('part_number', e.target.value)}
              placeholder="e.g. BELDEN-1583A, CAT6-23AWG"
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Label</label>
            <input type="text" value={form.label}
              onChange={e => update('label', e.target.value)}
              placeholder="e.g. To IDF-1, Home Run"
              className={inputClass} />
          </div>
        </div>

        {/* Cable color */}
        <div>
          <label className={labelClass}>Cable Color</label>
          <div className="flex flex-wrap gap-2">
            {[
              { color: '#3b82f6', label: 'Data (blue)' },
              { color: '#22c55e', label: 'Fiber (green)' },
              { color: '#eab308', label: 'Power (yellow)' },
              { color: '#ef4444', label: 'Alarm (red)' },
              { color: '#a855f7', label: 'AV (purple)' },
              { color: '#C8622A', label: 'Control (orange)' },
              { color: '#06b6d4', label: 'Network (cyan)' },
            ].map(({ color, label }) => (
              <button key={color} onClick={() => update('color', color)}
                title={label}
                className={`w-7 h-7 rounded-full border-2 transition-all ${
                  (form.color || '#3b82f6') === color
                    ? 'border-white scale-110'
                    : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: color }} />
            ))}
            <input type="color"
              value={form.color || '#3b82f6'}
              onChange={e => update('color', e.target.value)}
              className="w-7 h-7 rounded-full cursor-pointer border-0 bg-transparent"
              title="Custom color" />
          </div>
        </div>

        {/* Thickness slider */}
        <div>
          <label className={labelClass}>Line Thickness — {form.stroke_width || 2}px</label>
          <input type="range" min="1" max="8" step="1"
            value={form.stroke_width || 2}
            onChange={e => update('stroke_width', parseInt(e.target.value))}
            className="w-full accent-[#C8622A]" />
          <div className="flex justify-between text-xs text-[#4a5a6a] mt-0.5">
            <span>Thin</span>
            <span>Thick</span>
          </div>
        </div>

        <div>
          <label className={labelClass}>Cable Type</label>
          <select value={form.cable_type} onChange={e => update('cable_type', e.target.value)}
            className={inputClass}>
            {['Cat6', 'Cat6A', 'Cat5e', 'Fiber SM', 'Fiber MM', 'Coax RG59', 'Coax RG6', 'Speaker 16/2', 'Speaker 14/2', '18/2', '22/4', '22/6', 'Composite', 'HDMI', 'HDBaseT', 'Power', 'Plenum Cat6', 'Plenum 22/4'].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Label</label>
          <input type="text" value={form.label}
            onChange={e => update('label', e.target.value)}
            placeholder="e.g. To IDF-1"
            className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Waste Factor (%)</label>
          <div className="flex items-center gap-2">
            <input type="range" min="0" max="30" step="1"
              value={form.waste_factor}
              onChange={e => update('waste_factor', parseInt(e.target.value))}
              className="flex-1 accent-[#C8622A]" />
            <span className="text-[#8A9AB0] text-xs w-8 text-right">{form.waste_factor}%</span>
          </div>
        </div>

        {/* Footage summary */}
        <div className="bg-[#1a2d45] rounded-lg p-3 border border-[#2a3d55] space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-[#8A9AB0]">Measured footage</span>
            <span className="text-white font-mono">{cable.footage || 0}ft</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[#8A9AB0]">Waste ({form.waste_factor}%)</span>
            <span className="text-white font-mono">+{Math.round((cable.footage || 0) * form.waste_factor / 100)}ft</span>
          </div>
          <div className="flex justify-between text-xs border-t border-[#2a3d55] pt-1.5">
            <span className="text-[#8A9AB0] font-semibold">Total footage</span>
            <span className="text-[#C8622A] font-bold font-mono">{totalFootage}ft</span>
          </div>
        </div>

        {!cable.footage && (
          <p className="text-[#4a5a6a] text-xs">
            Set scale calibration to calculate real footage from pixel distances.
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-[#2a3d55] flex-shrink-0 space-y-2">
        <div className="text-center">
          <span className={`text-xs ${saved ? 'text-green-400' : 'text-[#4a5a6a]'}`}>
            {saved ? '✓ Saved' : 'Changes save automatically'}
          </span>
        </div>
        <button onClick={() => { onEditPoints?.(); onClose() }}
          className="w-full py-2 text-xs font-semibold rounded-lg border border-green-700 text-green-400 hover:bg-green-900/20 transition-colors mb-2">
          ✎ Edit Waypoints
        </button>
        <button onClick={handleDelete} disabled={deleting}
          className="w-full py-2 text-xs font-semibold rounded-lg border border-red-800/40 text-red-400 hover:bg-red-900/20 transition-colors">
          {deleting ? 'Deleting...' : 'Delete Cable Run'}
        </button>
      </div>
    </div>
    </>
  )
}
