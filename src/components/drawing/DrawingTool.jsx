import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'
import DrawingSheet from './DrawingSheet'
import SymbolPicker from './SymbolPicker'
import DrawingBOMPreview from './DrawingBOMPreview'

export default function DrawingTool({ proposalId, orgId, featureEnabled, onBOMApproved }) {
  const [activeTab, setActiveTab]           = useState('canvas')
  const [sheets, setSheets]                 = useState([])
  const [activeSheetId, setActiveSheetId]   = useState(null)
  const [selectedSymbol, setSelectedSymbol] = useState(null)
  const [loading, setLoading]               = useState(true)
  const [uploading, setUploading]           = useState(false)
  const [approving, setApproving]           = useState(false)
  const [error, setError]                   = useState(null)

  if (!featureEnabled) return null

  const loadSheets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('drawing_sheets')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: true })
      if (error) throw error
      setSheets(data || [])
      if (data?.length > 0 && !activeSheetId) setActiveSheetId(data[0].id)
    } catch (err) {
      setError('Failed to load drawing sheets.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [proposalId])

  useEffect(() => { loadSheets() }, [loadSheets])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['application/pdf', 'image/png', 'image/jpeg']
    if (!allowed.includes(file.type)) { setError('Please upload a PDF, PNG, or JPG file.'); return }
    setUploading(true)
    setError(null)
    try {
      const { data: sheet, error: insertErr } = await supabase
        .from('drawing_sheets')
        .insert({ org_id: orgId, proposal_id: proposalId, name: file.name.replace(/\.[^/.]+$/, ''), storage_path: 'pending', sort_order: sheets.length })
        .select().single()
      if (insertErr) throw insertErr
      const ext = file.name.split('.').pop()
      const storagePath = `${orgId}/${proposalId}/${sheet.id}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('floor-plans').upload(storagePath, file, { upsert: false })
      if (uploadErr) throw uploadErr
      const { error: updateErr } = await supabase.from('drawing_sheets').update({ storage_path: storagePath }).eq('id', sheet.id)
      if (updateErr) throw updateErr
      await loadSheets()
      setActiveSheetId(sheet.id)
    } catch (err) {
      setError('Upload failed. Please try again.')
      console.error(err)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleDeleteSheet = async (sheetId) => {
    if (!window.confirm('Delete this floor plan and all device placements on it?')) return
    try {
      const sheet = sheets.find(s => s.id === sheetId)
      const { error: deleteErr } = await supabase.from('drawing_sheets').delete().eq('id', sheetId)
      if (deleteErr) throw deleteErr
      if (sheet?.storage_path && sheet.storage_path !== 'pending') {
        await supabase.storage.from('floor-plans').remove([sheet.storage_path])
      }
      await loadSheets()
      setActiveSheetId(sheets.find(s => s.id !== sheetId)?.id || null)
    } catch (err) { setError('Failed to delete sheet.') }
  }

  const handleRenameSheet = async (sheetId, newName) => {
    if (!newName?.trim()) return
    await supabase.from('drawing_sheets').update({ name: newName.trim() }).eq('id', sheetId)
    await loadSheets()
  }

  const handleApprove = async () => {
    if (!window.confirm('Approve all drawings and push to proposal BOM? This will replace any previously drawing-sourced BOM items.')) return
    setApproving(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.rpc('sync_drawing_to_bom', { p_proposal_id: proposalId, p_approved_by: user.id })
      if (error) throw error
      await loadSheets()
      onBOMApproved?.()
      setActiveTab('canvas')
    } catch (err) {
      setError('Approval failed. Please try again.')
      console.error(err)
    } finally { setApproving(false) }
  }

  const activeSheet = sheets.find(s => s.id === activeSheetId) || null
  const allApproved = sheets.length > 0 && sheets.every(s => s.status === 'approved')
  const anyDraft    = sheets.some(s => s.status === 'draft')

  return (
    <div className="mt-6 border border-[#2a3d55] rounded-xl overflow-hidden bg-[#0F1C2E]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a3d55] bg-[#1a2d45]">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[#C8622A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 6.75V15m6-6v8.25m.503-10.498l4.875 2.437c.381.19.622.58.622 1.006v4.163a1.5 1.5 0 01-.621 1.22l-4.875 3.046a1.5 1.5 0 01-1.627.023L4.5 13.5m15-5.25l-4.875-2.437" />
          </svg>
          <span className="text-white text-sm font-semibold">Floor Plan Drawing Tool</span>
        </div>
        <div className="flex items-center gap-1 bg-[#0F1C2E] rounded-lg p-1">
          {['canvas', 'bom'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                activeTab === tab ? 'bg-[#C8622A] text-white' : 'text-[#8A9AB0] hover:text-white'
              }`}>
              {tab === 'canvas' ? 'Drawing' : 'BOM Preview'}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-900/30 border-b border-red-800/40 text-xs text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="underline ml-2">Dismiss</button>
        </div>
      )}

      {/* Sheet tabs */}
      {sheets.length > 0 && (
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[#2a3d55] overflow-x-auto">
          {sheets.map(sheet => (
            <SheetTab key={sheet.id} sheet={sheet} isActive={sheet.id === activeSheetId}
              onSelect={() => setActiveSheetId(sheet.id)}
              onRename={(name) => handleRenameSheet(sheet.id, name)}
              onDelete={() => handleDeleteSheet(sheet.id)} />
          ))}
          <label className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-dashed border-[#2a3d55] text-[#8A9AB0] hover:border-[#C8622A] hover:text-[#C8622A] cursor-pointer transition-colors whitespace-nowrap ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            {uploading
              ? <span className="flex items-center gap-1"><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Uploading...</span>
              : <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>Add Floor Plan</>
            }
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      )}

      {/* Canvas tab */}
      {activeTab === 'canvas' && (
        <div className="flex" style={{ minHeight: 600 }}>
          {!loading && sheets.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#1a2d45] flex items-center justify-center">
                <svg className="w-8 h-8 text-[#8A9AB0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
                </svg>
              </div>
              <div>
                <p className="text-white text-sm font-medium">Upload a floor plan to get started</p>
                <p className="text-[#8A9AB0] text-xs mt-1">PDF, PNG, or JPG — one sheet per floor or area</p>
              </div>
              <label className="px-4 py-2 bg-[#C8622A] text-white text-sm font-medium rounded-lg hover:bg-[#b5571f] cursor-pointer transition-colors">
                {uploading ? 'Uploading...' : 'Upload Floor Plan'}
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
            </div>
          )}
          {!loading && activeSheet && (
            <>
              <div className="w-64 border-r border-[#2a3d55] flex-shrink-0 overflow-y-auto">
                <SymbolPicker selectedSymbol={selectedSymbol} onSelect={setSelectedSymbol} />
              </div>
              <div className="flex-1 overflow-hidden">
                <DrawingSheet sheet={activeSheet} orgId={orgId} selectedSymbol={selectedSymbol} onPlacementChange={() => {}} />
              </div>
            </>
          )}
          {loading && <div className="flex-1 flex items-center justify-center"><span className="text-sm text-[#8A9AB0]">Loading...</span></div>}
        </div>
      )}

      {/* BOM Preview tab */}
      {activeTab === 'bom' && (
        <DrawingBOMPreview proposalId={proposalId} orgId={orgId} sheets={sheets} />
      )}

      {/* Footer */}
      {sheets.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#2a3d55] bg-[#1a2d45]">
          <div className="text-xs text-[#8A9AB0]">
            {anyDraft ? `${sheets.filter(s => s.status === 'draft').length} sheet(s) pending approval` : 'All sheets approved'}
          </div>
          <button onClick={handleApprove} disabled={approving || sheets.length === 0}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              approving || sheets.length === 0
                ? 'bg-[#2a3d55] text-[#8A9AB0] cursor-not-allowed'
                : 'bg-[#C8622A] text-white hover:bg-[#b5571f]'
            }`}>
            {approving ? 'Pushing to BOM...' : allApproved ? 'Re-approve & Sync BOM' : 'Approve & Push to BOM'}
          </button>
        </div>
      )}
    </div>
  )
}

function SheetTab({ sheet, isActive, onSelect, onRename, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [name, setName]       = useState(sheet.name)
  const statusColor = { draft: 'bg-yellow-900/40 text-yellow-400', approved: 'bg-green-900/40 text-green-400', revised: 'bg-blue-900/40 text-blue-400' }[sheet.status] || 'bg-[#2a3d55] text-[#8A9AB0]'
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { onRename(name); setEditing(false) }
    if (e.key === 'Escape') { setName(sheet.name); setEditing(false) }
  }
  return (
    <div onClick={onSelect} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors whitespace-nowrap group ${isActive ? 'bg-[#C8622A]/20 text-[#C8622A] border border-[#C8622A]/40' : 'text-[#8A9AB0] hover:bg-[#1a2d45] border border-transparent'}`}>
      {editing
        ? <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={handleKeyDown}
            onBlur={() => { onRename(name); setEditing(false) }} onClick={e => e.stopPropagation()}
            className="w-24 text-xs border-b border-[#C8622A] outline-none bg-transparent text-white" />
        : <span onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}>{sheet.name}</span>
      }
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