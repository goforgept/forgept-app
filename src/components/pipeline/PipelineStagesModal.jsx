import { useState, useRef } from 'react'
import { supabase } from '../../supabase'

const COLORS = [
  '#8A9AB0', '#3b82f6', '#6366f1', '#a855f7',
  '#ec4899', '#C8622A', '#f59e0b', '#22c55e',
  '#14b8a6', '#ef4444',
]

function StageRow({ stage, isDragOver, dragHandleProps, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ name: stage.name, probability: stage.probability ?? 50, definition: stage.definition ?? '', color: stage.color })

  const save = async () => {
    await supabase.from('pipeline_stages').update({
      name: draft.name,
      probability: Number(draft.probability),
      definition: draft.definition,
      color: draft.color,
    }).eq('id', stage.id)
    onEdit({ ...stage, ...draft, probability: Number(draft.probability) })
    setEditing(false)
  }

  const cancel = () => {
    setDraft({ name: stage.name, probability: stage.probability ?? 50, definition: stage.definition ?? '', color: stage.color })
    setEditing(false)
  }

  return (
    <div className={`bg-fp-card border rounded-xl overflow-hidden transition-all ${isDragOver ? 'border-fp-brand shadow-lg scale-[1.01]' : 'border-fp-border'}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          {...dragHandleProps}
          className="text-fp-muted cursor-grab active:cursor-grabbing select-none text-lg leading-none touch-none"
          title="Drag to reorder"
        >⠿</span>
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: stage.color }} />
        <div className="flex-1 min-w-0">
          <p className="text-fp-text text-sm font-semibold truncate">{stage.name}</p>
          {stage.definition && !editing && (
            <p className="text-fp-muted text-xs truncate">{stage.definition}</p>
          )}
        </div>
        <span className="text-fp-muted text-xs font-mono w-10 text-right">{stage.probability ?? 50}%</span>
        <button onClick={() => setEditing(e => !e)}
          className="text-fp-muted hover:text-fp-text text-xs px-2 py-1 rounded transition-colors">
          {editing ? 'Cancel' : 'Edit'}
        </button>
        <button onClick={() => onDelete(stage)}
          className="text-red-500/60 hover:text-red-400 text-xs px-2 py-1 rounded transition-colors">
          Delete
        </button>
      </div>

      {editing && (
        <div className="px-4 pb-4 border-t border-fp-border space-y-3 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Stage Name</label>
              <input
                value={draft.name}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
              />
            </div>
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Probability (%)</label>
              <input
                type="number" min="0" max="100"
                value={draft.probability}
                onChange={e => setDraft(d => ({ ...d, probability: e.target.value }))}
                className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
              />
            </div>
          </div>
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Definition</label>
            <input
              value={draft.definition}
              onChange={e => setDraft(d => ({ ...d, definition: e.target.value }))}
              placeholder="What does this stage mean?"
              className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
            />
          </div>
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button key={c} onClick={() => setDraft(d => ({ ...d, color: c }))}
                  className="w-6 h-6 rounded-full border-2 transition-all"
                  style={{ background: c, borderColor: draft.color === c ? '#fff' : 'transparent' }} />
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={cancel}
              className="px-4 py-2 text-fp-muted text-sm rounded-lg hover:text-fp-text transition-colors">Cancel</button>
            <button onClick={save}
              className="px-4 py-2 bg-fp-brand text-white text-sm rounded-lg hover:bg-[#b5571f] transition-colors font-semibold">Save</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PipelineStagesModal({ stages: initialStages, orgId, onClose, onSaved }) {
  const [stages, setStages] = useState(initialStages)
  const [newName, setNewName] = useState('')
  const [newProb, setNewProb] = useState(50)
  const [newDef, setNewDef] = useState('')
  const [newColor, setNewColor] = useState('#8A9AB0')
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)

  // Drag state
  const dragIndex = useRef(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  const handleDragStart = (index) => (e) => {
    dragIndex.current = index
    e.dataTransfer.effectAllowed = 'move'
    // Minimal ghost image so the handle feels like a drag, not a copy
    e.dataTransfer.setDragImage(e.currentTarget.closest('[data-stage-row]'), 20, 20)
  }

  const handleDragOver = (index) => (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (index !== dragIndex.current) setDragOverIndex(index)
  }

  const handleDrop = async (index) => (e) => {
    e.preventDefault()
    const from = dragIndex.current
    if (from == null || from === index) { setDragOverIndex(null); return }
    const next = [...stages]
    const [moved] = next.splice(from, 1)
    next.splice(index, 0, moved)
    const reindexed = next.map((s, i) => ({ ...s, position: i }))
    setStages(reindexed)
    setDragOverIndex(null)
    dragIndex.current = null
    await Promise.all(reindexed.map(s => supabase.from('pipeline_stages').update({ position: s.position }).eq('id', s.id)))
    onSaved?.()
  }

  const handleDragEnd = () => {
    dragIndex.current = null
    setDragOverIndex(null)
  }

  const handleUpdate = (updated) => {
    setStages(prev => prev.map(s => s.id === updated.id ? updated : s))
    onSaved?.()
  }

  const handleDelete = async (stage) => {
    if (!window.confirm(`Delete "${stage.name}"? Proposals in this stage will need to be reassigned.`)) return
    await supabase.from('pipeline_stages').delete().eq('id', stage.id)
    setStages(prev => prev.filter(s => s.id !== stage.id))
    onSaved?.()
  }

  const handleAdd = async () => {
    if (!newName.trim()) return
    setSaving(true)
    const { data } = await supabase.from('pipeline_stages').insert({
      org_id: orgId,
      name: newName.trim(),
      probability: Number(newProb),
      definition: newDef.trim() || null,
      color: newColor,
      position: stages.length,
    }).select().single()
    if (data) {
      setStages(prev => [...prev, data])
      setNewName(''); setNewProb(50); setNewDef(''); setNewColor('#8A9AB0')
      setAdding(false)
      onSaved?.()
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="bg-fp-card rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-fp-border">
          <div>
            <h3 className="text-fp-text font-bold text-lg">Pipeline Stages</h3>
            <p className="text-fp-muted text-xs mt-0.5">Drag ⠿ to reorder</p>
          </div>
          <button onClick={onClose} className="text-fp-muted hover:text-fp-text text-xl leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {stages.map((stage, i) => (
            <div
              key={stage.id}
              data-stage-row
              onDragOver={handleDragOver(i)}
              onDrop={handleDrop(i)}
            >
              <StageRow
                stage={stage}
                isDragOver={dragOverIndex === i}
                onEdit={handleUpdate}
                onDelete={handleDelete}
                dragHandleProps={{
                  draggable: true,
                  onDragStart: handleDragStart(i),
                  onDragEnd: handleDragEnd,
                }}
              />
            </div>
          ))}
        </div>

        <div className="border-t border-fp-border p-4">
          {adding ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Stage Name</label>
                  <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. Site Assessment"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                  />
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Probability (%)</label>
                  <input
                    type="number" min="0" max="100"
                    value={newProb}
                    onChange={e => setNewProb(e.target.value)}
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                  />
                </div>
              </div>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Definition</label>
                <input
                  value={newDef}
                  onChange={e => setNewDef(e.target.value)}
                  placeholder="What does this stage mean?"
                  className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                />
              </div>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setNewColor(c)}
                      className="w-6 h-6 rounded-full border-2 transition-all"
                      style={{ background: c, borderColor: newColor === c ? '#fff' : 'transparent' }} />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setAdding(false)} className="px-4 py-2 text-fp-muted text-sm rounded-lg hover:text-fp-text transition-colors">Cancel</button>
                <button onClick={handleAdd} disabled={saving || !newName.trim()}
                  className="px-4 py-2 bg-fp-brand text-white text-sm rounded-lg hover:bg-[#b5571f] transition-colors font-semibold disabled:opacity-50">
                  {saving ? 'Adding…' : 'Add Stage'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)}
              className="w-full py-2 border border-dashed border-fp-border rounded-xl text-fp-muted text-sm hover:text-fp-text hover:border-fp-brand/50 transition-colors">
              + Add Stage
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
