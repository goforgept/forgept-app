import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import DrawingSheet from '../components/drawing/DrawingSheet'
import SymbolPicker from '../components/drawing/SymbolPicker'
import DrawingBOMPreview from '../components/drawing/DrawingBOMPreview'

export default function Designer({ featureDrawingTool }) {
  const { proposalId } = useParams()
  const navigate       = useNavigate()

  const [proposal,        setProposal]        = useState(null)
  const [sheets,          setSheets]          = useState([])
  const [activeSheetId,   setActiveSheetId]   = useState(null)
  const [orgId,           setOrgId]           = useState(null)
  const [loading,         setLoading]         = useState(true)
  const [uploading,       setUploading]       = useState(false)
  const [approving,       setApproving]       = useState(false)
  const [error,           setError]           = useState(null)
  const [selectedSymbol,  setSelectedSymbol]  = useState(null)
  const [selectedPlacement, setSelectedPlacement] = useState(null)
  const [activeTab,       setActiveTab]       = useState('canvas') // 'canvas' | 'bom'
  const [sidebarOpen,     setSidebarOpen]     = useState(true)
  const [showFireAlarmAck, setShowFireAlarmAck] = useState(false)
  const [fireAlarmAck,    setFireAlarmAck]    = useState({
    licensed: false, liability: false, estimates: false, ahj: false
  })
  const [nicetNumber, setNicetNumber] = useState('')

  useEffect(() => {
    if (featureDrawingTool === false) { navigate('/'); return }
    load()
  }, [proposalId])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile }  = await supabase
        .from('profiles').select('org_id').eq('id', user.id).single()
      setOrgId(profile.org_id)

      if (proposalId && proposalId !== 'new') {
        const { data: p } = await supabase
          .from('proposals')
          .select('id, proposal_name, company, client_name, status, industry')
          .eq('id', proposalId).single()
        setProposal(p)

        if (p?.industry === 'fire_alarm') {
          const ackKey = `fire_alarm_ack_${proposalId}`
          if (!sessionStorage.getItem(ackKey)) setShowFireAlarmAck(true)
        }
      }

      const { data: sheetData } = await supabase
        .from('drawing_sheets').select('*')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: true })

      setSheets(sheetData || [])
      if (sheetData?.length > 0) setActiveSheetId(sheetData[0].id)
    } catch (err) {
      setError('Failed to load project.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['application/pdf', 'image/png', 'image/jpeg']
    if (!allowed.includes(file.type)) { setError('Please upload a PDF, PNG, or JPG.'); return }
    setUploading(true)
    setError(null)
    try {
      const { data: sheet, error: insertErr } = await supabase
        .from('drawing_sheets')
        .insert({ org_id: orgId, proposal_id: proposalId, name: file.name.replace(/\.[^/.]+$/, ''), storage_path: 'pending', sort_order: sheets.length })
        .select().single()
      if (insertErr) throw insertErr

      const ext         = file.name.split('.').pop()
      const storagePath = `${orgId}/${proposalId}/${sheet.id}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('floor-plans').upload(storagePath, file, { upsert: false })
      if (uploadErr) throw uploadErr

      await supabase.from('drawing_sheets')
        .update({ storage_path: storagePath, last_activity_at: new Date().toISOString() })
        .eq('id', sheet.id)

      await load()
      setActiveSheetId(sheet.id)
    } catch (err) {
      setError('Upload failed. Please try again.')
      console.error(err)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleAddBlankSheet = async () => {
    const { data: sheet } = await supabase
      .from('drawing_sheets')
      .insert({ org_id: orgId, proposal_id: proposalId, name: `Floor ${sheets.length + 1}`, storage_path: 'blank', sort_order: sheets.length })
      .select().single()
    await load()
    if (sheet) setActiveSheetId(sheet.id)
  }

  const handleDeleteSheet = async (sheetId) => {
    if (!window.confirm('Delete this floor plan and all device placements on it?')) return
    try {
      const sheet = sheets.find(s => s.id === sheetId)
      await supabase.from('drawing_sheets').delete().eq('id', sheetId)
      if (sheet?.storage_path && !['pending', 'blank'].includes(sheet.storage_path)) {
        await supabase.storage.from('floor-plans').remove([sheet.storage_path])
      }
      await load()
      setActiveSheetId(sheets.find(s => s.id !== sheetId)?.id || null)
    } catch (err) {
      setError('Failed to delete sheet.')
    }
  }

  const handleRenameSheet = async (sheetId, newName) => {
    if (!newName?.trim()) return
    await supabase.from('drawing_sheets').update({ name: newName.trim() }).eq('id', sheetId)
    await load()
  }

  const handleApprove = async () => {
    if (!window.confirm('Approve all drawings and push to proposal BOM? This will replace any previously drawing-sourced BOM items.')) return
    setApproving(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.rpc('sync_drawing_to_bom', {
        p_proposal_id: proposalId,
        p_approved_by: user.id,
      })
      if (error) throw error
      await load()
      setActiveTab('canvas')
    } catch (err) {
      setError('Approval failed. Please try again.')
      console.error(err)
    } finally {
      setApproving(false)
    }
  }

  const handleFireAlarmAckConfirm = () => {
    if (!Object.values(fireAlarmAck).every(Boolean)) {
      alert('Please acknowledge all items before continuing.')
      return
    }
    sessionStorage.setItem(`fire_alarm_ack_${proposalId}`, '1')
    setShowFireAlarmAck(false)
  }

  const activeSheet = sheets.find(s => s.id === activeSheetId) || null
  const allApproved = sheets.length > 0 && sheets.every(s => s.status === 'approved')
  const anyDraft    = sheets.some(s => s.status === 'draft')

  // ── Fire alarm acknowledgment modal ────────────────────────────────────────
  if (showFireAlarmAck) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center p-4">
      <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-2xl p-8 max-w-lg w-full">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-white font-bold text-lg">Fire Alarm Design Acknowledgment</h2>
            <p className="text-[#8A9AB0] text-xs">Please read carefully before continuing</p>
          </div>
        </div>
        <p className="text-[#8A9AB0] text-sm mb-6">
          ForgePt Designer is a design aid tool only. Fire alarm designs involve life safety systems
          governed by NFPA 72 and local codes.
        </p>
        <div className="space-y-4 mb-6">
          {[
            { key: 'licensed',  label: 'All designs must be verified by a licensed NICET certified fire alarm technician or licensed engineer before installation.' },
            { key: 'liability', label: 'ForgePt accepts no liability for calculation accuracy or code compliance.' },
            { key: 'estimates', label: 'All calculations are estimates for design purposes only and must be independently verified before installation.' },
            { key: 'ahj',       label: 'AHJ requirements vary by jurisdiction and must be confirmed locally before submitting drawings.' },
          ].map(item => (
            <label key={item.key} className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={fireAlarmAck[item.key]}
                onChange={e => setFireAlarmAck(prev => ({ ...prev, [item.key]: e.target.checked }))}
                className="mt-0.5 accent-[#C8622A] w-4 h-4 flex-shrink-0" />
              <span className="text-sm text-[#8A9AB0]">{item.label}</span>
            </label>
          ))}
        </div>
        <div className="mb-6">
          <label className="text-[#8A9AB0] text-xs mb-1 block">NICET Certification Number (optional)</label>
          <input type="text" placeholder="e.g. 123456" value={nicetNumber}
            onChange={e => setNicetNumber(e.target.value)}
            className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate(-1)}
            className="flex-1 px-4 py-2 bg-[#0F1C2E] text-[#8A9AB0] text-sm font-semibold rounded-lg border border-[#2a3d55] hover:text-white transition-colors">
            Cancel
          </button>
          <button onClick={handleFireAlarmAckConfirm}
            disabled={!Object.values(fireAlarmAck).every(Boolean)}
            className={`flex-1 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
              Object.values(fireAlarmAck).every(Boolean)
                ? 'bg-[#C8622A] text-white hover:bg-[#b5571f]'
                : 'bg-[#2a3d55] text-[#8A9AB0] cursor-not-allowed'
            }`}>
            I Acknowledge &amp; Continue
          </button>
        </div>
      </div>
    </div>
  )

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <svg className="w-8 h-8 animate-spin text-[#C8622A]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        <span className="text-[#8A9AB0] text-sm">Loading Designer...</span>
      </div>
    </div>
  )

  // ── Main layout ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-[#0F1C2E] overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2a3d55] bg-[#1a2d45] flex-shrink-0">
        {/* Left */}
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-[#8A9AB0] hover:text-white text-sm transition-colors flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
            Back
          </button>
          <span className="text-[#2a3d55]">|</span>
          <span className="text-white font-semibold text-sm truncate">
            {proposal?.proposal_name || proposal?.company || 'Designer'}
          </span>
          {proposal?.company && proposal?.proposal_name && (
            <span className="text-[#8A9AB0] text-xs hidden md:block truncate">{proposal.company}</span>
          )}
        </div>

        {/* Center branding */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[#C8622A]">📐</span>
          <span className="text-white font-bold text-sm hidden md:block">ForgePt Designer</span>
        </div>

        {/* Right — tab switcher + actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {proposal?.industry === 'fire_alarm' && (
            <span className="text-xs bg-yellow-900/40 text-yellow-400 border border-yellow-800/40 px-2 py-1 rounded-lg hidden md:block">
              ⚠ Design Aid Only
            </span>
          )}

          {/* Tab switcher */}
          <div className="flex items-center gap-0.5 bg-[#0F1C2E] rounded-lg p-0.5">
            {['canvas', 'bom'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeTab === tab ? 'bg-[#C8622A] text-white' : 'text-[#8A9AB0] hover:text-white'
                }`}>
                {tab === 'canvas' ? 'Drawing' : 'BOM Preview'}
              </button>
            ))}
          </div>

          {/* Symbol picker toggle */}
          {activeTab === 'canvas' && sheets.length > 0 && (
            <button onClick={() => setSidebarOpen(s => !s)}
              className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${
                sidebarOpen
                  ? 'border-[#C8622A]/40 bg-[#C8622A]/10 text-[#C8622A]'
                  : 'border-[#2a3d55] text-[#8A9AB0] hover:text-white'
              }`}
              title="Toggle symbol picker">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="px-4 py-2 bg-red-900/30 border-b border-red-800/40 text-xs text-red-400 flex items-center justify-between flex-shrink-0">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="underline ml-2">Dismiss</button>
        </div>
      )}

      {/* ── Sheet tabs ── */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[#2a3d55] bg-[#0F1C2E] overflow-x-auto flex-shrink-0">
        {sheets.map(sheet => (
          <SheetTab key={sheet.id} sheet={sheet}
            isActive={sheet.id === activeSheetId}
            onSelect={() => { setActiveSheetId(sheet.id); setSelectedPlacement(null) }}
            onRename={(name) => handleRenameSheet(sheet.id, name)}
            onDelete={() => handleDeleteSheet(sheet.id)} />
        ))}

        {/* Upload */}
        <label className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-dashed border-[#2a3d55] text-[#8A9AB0] hover:border-[#C8622A] hover:text-[#C8622A] cursor-pointer transition-colors whitespace-nowrap ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
          {uploading
            ? <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Uploading...</>
            : <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>Upload Floor Plan</>
          }
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>

        {/* Blank canvas */}
        <button onClick={handleAddBlankSheet}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-dashed border-[#2a3d55] text-[#8A9AB0] hover:border-[#C8622A] hover:text-[#C8622A] transition-colors whitespace-nowrap">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          Blank Canvas
        </button>
      </div>

      {/* ── Main content area ── */}
      <div className="flex-1 overflow-hidden flex min-h-0">

        {/* Canvas tab */}
        {activeTab === 'canvas' && (
          <>
            {sheets.length === 0 ? (
              /* Empty state */
              <div className="flex-1 flex flex-col items-center justify-center gap-6 p-12 text-center">
                <div className="w-20 h-20 rounded-2xl bg-[#1a2d45] flex items-center justify-center">
                  <span className="text-4xl">📐</span>
                </div>
                <div>
                  <p className="text-white text-lg font-semibold">Start your floor plan</p>
                  <p className="text-[#8A9AB0] text-sm mt-2 max-w-sm">
                    Upload a PDF or image floor plan, or start with a blank canvas.
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap justify-center">
                  <label className="px-5 py-2.5 bg-[#C8622A] text-white text-sm font-semibold rounded-lg hover:bg-[#b5571f] cursor-pointer transition-colors">
                    📄 Upload Floor Plan
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={handleUpload} />
                  </label>
                  <button onClick={handleAddBlankSheet}
                    className="px-5 py-2.5 bg-[#1a2d45] text-white text-sm font-semibold rounded-lg border border-[#2a3d55] hover:border-[#C8622A] transition-colors">
                    🗒 Blank Canvas
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Symbol picker sidebar */}
                {sidebarOpen && (
                  <div className="w-60 border-r border-[#2a3d55] flex-shrink-0 overflow-y-auto">
                    <SymbolPicker
                      selectedSymbol={selectedSymbol}
                      onSelect={setSelectedSymbol}
                    />
                  </div>
                )}

                {/* Canvas + right panel */}
                <div className="flex-1 flex overflow-hidden min-w-0">
                  {/* Drawing canvas */}
                  <div className="flex-1 overflow-hidden min-w-0">
                    {activeSheet && (
                      <DrawingSheet
                        key={activeSheet.id}
                        sheet={activeSheet}
                        orgId={orgId}
                        selectedSymbol={selectedSymbol}
                        onPlacementChange={() => {}}
                        onPlacementSelect={setSelectedPlacement}
                      />
                    )}
                  </div>

                  {/* Right panel — selected placement info */}
                  {selectedPlacement && (
                    <div className="w-64 border-l border-[#2a3d55] flex-shrink-0 overflow-y-auto bg-[#0F1C2E]">
                      <PlacementPanel
                        placement={selectedPlacement}
                        onClose={() => setSelectedPlacement(null)}
                        onUpdate={(updated) => {
                          setSelectedPlacement(updated)
                        }}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* BOM Preview tab */}
        {activeTab === 'bom' && (
          <div className="flex-1 overflow-auto">
            <DrawingBOMPreview
              proposalId={proposalId}
              orgId={orgId}
              sheets={sheets}
            />
          </div>
        )}
      </div>

      {/* ── Footer — approve button ── */}
      {sheets.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#2a3d55] bg-[#1a2d45] flex-shrink-0">
          <div className="text-xs text-[#8A9AB0]">
            {anyDraft
              ? `${sheets.filter(s => s.status === 'draft').length} sheet(s) pending approval`
              : 'All sheets approved'}
          </div>
          <button onClick={handleApprove} disabled={approving || sheets.length === 0}
            className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
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

// ─── SheetTab ─────────────────────────────────────────────────────────────────
function SheetTab({ sheet, isActive, onSelect, onRename, onDelete }) {
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

// ─── PlacementPanel ───────────────────────────────────────────────────────────
// Right side panel shown when a placement marker is selected.
// Bundle 3 will expand this with full edit fields.
function PlacementPanel({ placement, onClose, onUpdate }) {
  const product = placement.global_products
  if (!product) return null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-[#2a3d55]">
        <div>
          <p className="text-white text-sm font-semibold">{product.name}</p>
          <p className="text-[#8A9AB0] text-xs">{product.category}</p>
        </div>
        <button onClick={onClose} className="text-[#8A9AB0] hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Device info */}
      <div className="p-3 space-y-3 flex-1 overflow-y-auto">
        <div>
          <p className="text-[#8A9AB0] text-xs mb-1">Part Number</p>
          <p className="text-white text-sm font-mono">
            {placement.part_number_override || product.part_number}
          </p>
        </div>
        <div>
          <p className="text-[#8A9AB0] text-xs mb-1">Manufacturer</p>
          <p className="text-white text-sm">
            {placement.manufacturer_override || product.manufacturer}
          </p>
        </div>
        {(placement.description_override || product.description) && (
          <div>
            <p className="text-[#8A9AB0] text-xs mb-1">Description</p>
            <p className="text-white text-sm">
              {placement.description_override || product.description}
            </p>
          </div>
        )}
        {placement.notes && (
          <div>
            <p className="text-[#8A9AB0] text-xs mb-1">Notes</p>
            <p className="text-white text-sm">{placement.notes}</p>
          </div>
        )}

        <div className="pt-2 border-t border-[#2a3d55]">
          <p className="text-[#8A9AB0] text-xs">
            Full edit panel coming in Bundle 3 — part number override, components, site photos, as-built fields.
          </p>
        </div>
      </div>
    </div>
  )
}