import { useState } from 'react'

export default function SheetTab({ sheet, isActive, onSelect, onRename, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [name,    setName]    = useState(sheet.name)

  const statusColor = {
    draft:    'bg-yellow-900/40 text-yellow-400',
    approved: 'bg-green-900/40 text-green-400',
    revised:  'bg-blue-900/40 text-blue-400',
  }[sheet.status] || 'bg-[#2a3d55] text-[#8A9AB0]'

  const handleKeyDown = (e) => {
    if (e.key === 'Enter')  { onRename(name); setEditing(false) }
    if (e.key === 'Escape') { setName(sheet.name); setEditing(false) }
  }

  return (
    <div onClick={onSelect}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors whitespace-nowrap group ${
        isActive
          ? 'bg-[#C8622A]/20 text-[#C8622A] border border-[#C8622A]/40'
          : 'text-[#8A9AB0] hover:bg-[#1a2d45] border border-transparent'
      }`}>
      {editing ? (
        <input autoFocus value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { onRename(name); setEditing(false) }}
          onClick={e => e.stopPropagation()}
          className="w-20 text-xs border-b border-[#C8622A] outline-none bg-transparent text-white" />
      ) : (
        <span onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}>{sheet.name}</span>
      )}
      {/* Rename icon */}
      <button onClick={(e) => { e.stopPropagation(); setEditing(true) }}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-[#8A9AB0] hover:text-white"
        title="Rename">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
        </svg>
      </button>
      <span className={`px-1.5 py-0.5 rounded text-xs ${statusColor}`}>{sheet.status}</span>
      <button onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-[#8A9AB0] hover:text-red-400">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
  )
}
