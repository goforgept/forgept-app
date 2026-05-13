import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import DrawingSheet from '../components/drawing/DrawingSheet'
import SymbolPicker from '../components/drawing/SymbolPicker'
import DrawingBOMPreview from '../components/drawing/DrawingBOMPreview'
import DrawingExport from '../components/drawing/DrawingExport'

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
  const [selectedCable,     setSelectedCable]     = useState(null)
  const [editingCableId,    setEditingCableId]    = useState(null)
  const [updatedCable,      setUpdatedCable]      = useState(null)
  const [bomRefreshKey,     setBomRefreshKey]     = useState(0)
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

      // Clean up orphaned pending sheets older than 5 minutes
      await supabase
        .from('drawing_sheets')
        .delete()
        .eq('proposal_id', proposalId)
        .eq('storage_path', 'pending')
        .lt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())

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
    if (!orgId) { setError('Please wait for the page to finish loading.'); return }
    setUploading(true)
    setError(null)

    try {
      const isPDF = file.type === 'application/pdf'
      let numPages = 1

      // Check page count for PDFs
      if (isPDF) {
        const pdfjsLib  = await import('pdfjs-dist')
        const workerUrl = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl.default
        const arrayBuffer = await file.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
        numPages = pdf.numPages
      }

      const baseName = file.name.replace(/\.[^/.]+$/, '')
      const ext      = file.name.split('.').pop()
      const firstSheetId = null

      // Upload the file once
      const tempId      = crypto.randomUUID()
      const storagePath = `${orgId}/${proposalId}/${tempId}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('floor-plans')
        .upload(storagePath, file, { upsert: false })
      if (uploadErr) throw uploadErr

      // Create one sheet per page
      let firstId = null
      for (let i = 1; i <= numPages; i++) {
        // Clean up filename — remove date prefixes and long suffixes
        const cleanName = baseName
          .replace(/^\d{4}-\d{2}-\d{2}[_\s-]*/g, '') // remove date prefix
          .replace(/\s*[\(\[].+[\)\]]/g, '')            // remove parenthetical
          .trim()
          .slice(0, 40)                                  // cap at 40 chars
        const sheetName = numPages > 1 ? `${cleanName} — P${i}` : cleanName
        const { data: sheet, error: insertErr } = await supabase
          .from('drawing_sheets')
          .insert({
            org_id:       orgId,
            proposal_id:  proposalId,
            name:         sheetName,
            storage_path: storagePath,
            page_number:  i,
            sort_order:   sheets.length + i - 1,
            last_activity_at: new Date().toISOString(),
          })
          .select().single()
        if (insertErr) throw insertErr
        if (i === 1) firstId = sheet.id
      }

      await load()
      if (firstId) setActiveSheetId(firstId)

      if (numPages > 1) {
        setError(null)
        // Show success message briefly
        setTimeout(() => {}, 100)
      }
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
            {[
              { id: 'canvas', label: 'Drawing' },
              { id: 'bom',    label: 'BOM Preview' },
              { id: 'export', label: 'Export' },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeTab === tab.id ? 'bg-[#C8622A] text-white' : 'text-[#8A9AB0] hover:text-white'
                }`}>
                {tab.label}
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
                  <div className="w-60 border-r border-[#2a3d55] flex-shrink-0 overflow-y-auto min-h-0 h-full">
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
                        onPlacementSelect={(p) => { setSelectedPlacement(p); setSelectedCable(null) }}
                        onPlacementUpdate={setSelectedPlacement}
                        updatedPlacement={selectedPlacement}
                        onCableSelect={(c) => { setSelectedCable(c); setSelectedPlacement(null); setEditingCableId(null) }}
                        editingCableId={editingCableId}
                        onEditingCableDone={() => setEditingCableId(null)}
                        updatedCable={updatedCable}
                      />
                    )}
                  </div>

                  {/* Right panel — selected placement or cable */}
                  {(selectedPlacement || selectedCable) && (
                    <div className="w-64 border-l border-[#2a3d55] flex-shrink-0 overflow-y-auto bg-[#0F1C2E]">
                      {selectedPlacement && (
                        <PlacementPanel
                          placement={selectedPlacement}
                          onClose={() => setSelectedPlacement(null)}
                          onUpdate={(updated) => setSelectedPlacement(updated)}
                          onSaved={() => setBomRefreshKey(k => k + 1)}
                          sheets={sheets}
                          currentSheetId={activeSheetId}
                          proposalId={proposalId}
                        />
                      )}
                      {selectedCable && (
                        <CablePanel
                          cable={selectedCable}
                          onClose={() => setSelectedCable(null)}
                          onUpdate={(updated) => { setSelectedCable(updated); setUpdatedCable(updated) }}
                          onEditPoints={() => {
                            setEditingCableId(selectedCable?.id)
                            setSelectedCable(null)
                          }}
                          onDelete={() => {
                            setSelectedCable(null)
                          }}
                        />
                      )}
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
              refreshKey={bomRefreshKey}
            />
          </div>
        )}

        {/* Export tab */}
        {activeTab === 'export' && (
          <div className="flex-1 overflow-auto">
            <DrawingExport
              proposalId={proposalId}
              orgId={orgId}
              sheets={sheets}
              proposal={proposal}
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

// ─── Default components per category ─────────────────────────────────────────
const DEFAULT_COMPONENTS = {
  // Security — Cameras
  'Dome Camera':         ['Mount', 'Housing', 'Junction Box', 'Cable'],
  'Bullet Camera':       ['Mount', 'Housing', 'Junction Box', 'Cable'],
  'PTZ Camera':          ['Mount', 'Housing', 'Junction Box', 'Cable'],
  'NVR':                 ['Hard Drive', 'Rail Kit', 'UPS'],

  // Security — Access Control
  'Access Reader':       ['Back Box', 'Cable'],
  'Access Control Door': ['Lock', 'Reader', 'REX', 'Door Contact', 'Power Supply', 'Controller', 'Composite Cable', '22/4 Cable', 'Push to Exit'],
  'Controller':          ['Power Supply', 'Cabinet', 'Battery Backup'],
  'Motion Sensor':       ['Back Box', 'Cable'],
  'Intercom':            ['Power Supply', 'Back Box', 'Cable', 'Strike', 'Door Release'],
  'Sensor':              ['Back Box', 'Cable', 'Power Supply'],
  'Wireless Lock':       ['Battery Pack', 'Wireless Gateway', 'Credential', 'Door Coordinator'],
  'LPR Camera':          ['Mount', 'IR Illuminator', 'Cable', 'Junction Box'],
  'Guard Tour':          ['Charging Cradle', 'Software License', 'Cable'],
  'Multi-Lens Camera':   ['Mount', 'Housing', 'Junction Box', 'Cable'],
  'Fisheye Camera':      ['Mount', 'Housing', 'Junction Box', 'Cable'],

  // Security — Fire Alarm
  'Smoke Detector':      ['Base', 'Cable'],
  'Heat Detector':       ['Base', 'Cable'],
  'Horn Strobe':         ['Back Box', 'Power Supply', 'Cable'],
  'Pull Station':        ['Back Box', 'Cable'],
  'FACP':                ['Cabinet', 'Power Supply', 'Battery', 'Cable'],
  'Duct Detector':       ['Sampling Tube', 'Cable'],

  // AV
  'Speaker':             ['Amplifier', 'Volume Control', 'Back Box', 'Cable'],
  'Display':             ['Mount', 'Media Player', 'HDMI Cable'],
  'Projector':           ['Mount', 'Screen', 'HDMI Cable'],
  'Microphone':          ['DSP', 'Cable'],
  'Amplifier':           ['Rack Mount', 'Power Conditioner'],
  'DSP':                 ['Rack Mount'],
  'Control':             ['Rack Mount', 'Cable'],
  'Network':             ['Patch Cable', 'SFP Module', 'Rack Mount'],
  'Rack':                ['Cable Management', 'PDU', 'Shelf', 'Rail Kit'],

  // Low Voltage / DataCom
  'Data Drop':           ['Cat6 Jack', 'Faceplate', 'Back Box', 'RJ45 Connector', 'Cat6 Cable', 'Patch Cable'],
  'Data':                ['Cat6 Jack', 'Faceplate', 'Back Box', 'RJ45 Connector', 'Cat6 Cable'],
  'Fiber Panel':         ['LC Fiber Connector', 'LC Adapter', 'Fiber Cable', 'Cable Management'],
  'Cable Tray':          ['Cable', 'Straps', 'Mounting Brackets'],
  'UPS':                 ['PDU', 'Battery', 'Rack Mount'],
  'Wireless AP':         ['Mount', 'PoE Injector', 'Cat6 Cable'],

  // Electrical
  'Panel':               ['Breakers', 'Lugs', 'Surge Protection'],
  'Outlet':              ['Cover Plate', 'Box'],
  'Lighting':            ['Driver', 'Mount', 'Wire'],
  'Conduit':             ['Fittings', 'Straps', 'Pull String'],
  'Junction Box':        ['Cover Plate', 'Wire Connectors'],
  'Disconnect':          ['Fuses', 'Wire'],

  // HVAC
  'Diffuser':            ['Collar', 'Duct', 'Damper'],
  'Thermostat':          ['Sub Base', 'Wire', 'Wall Plate'],
  'VAV':                 ['Actuator', 'Controller', 'Duct'],
}

// ─── ComponentsSection ───────────────────────────────────────────────────────
function ComponentsSection({ placementId, orgId, category }) {
  const [components, setComponents] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [adding,     setAdding]     = useState(false)

  useEffect(() => {
    loadComponents()
  }, [placementId])

  const loadComponents = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('placement_components')
      .select('*')
      .eq('placement_id', placementId)
      .order('created_at')
    setComponents(data || [])
    setLoading(false)
  }

  const handleAdd = async (type) => {
    const { data, error } = await supabase
      .from('placement_components')
      .insert({
        org_id:         orgId,
        placement_id:   placementId,
        component_type: type,
        name:           type,
        quantity:       1,
      })
      .select()
      .single()
    if (!error && data) setComponents(prev => [...prev, data])
    setAdding(false)
  }

  const handleUpdate = async (id, field, value) => {
    await supabase.from('placement_components').update({ [field]: value }).eq('id', id)
    setComponents(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
  }

  const handleDelete = async (id) => {
    await supabase.from('placement_components').delete().eq('id', id)
    setComponents(prev => prev.filter(c => c.id !== id))
  }

  const defaultTypes = DEFAULT_COMPONENTS[category] || ['Mount', 'Housing', 'Cable', 'Power Supply']
  const inputClass   = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A] placeholder-[#4a5a6a]"

  return (
    <div className="border-t border-[#2a3d55] pt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide">Components</p>
        <button
          onClick={() => setAdding(s => !s)}
          className="text-xs text-[#C8622A] hover:text-white transition-colors flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          Add
        </button>
      </div>

      {/* Add component picker */}
      {adding && (
        <div className="mb-3 bg-[#1a2d45] rounded-lg p-2 border border-[#2a3d55]">
          <p className="text-[#8A9AB0] text-xs mb-2">Select component type:</p>
          <div className="flex flex-wrap gap-1 mb-2">
            {defaultTypes.map(type => (
              <button key={type} onClick={() => handleAdd(type)}
                className="px-2 py-1 text-xs bg-[#0F1C2E] text-[#8A9AB0] hover:text-[#C8622A] hover:border-[#C8622A] border border-[#2a3d55] rounded transition-colors">
                {type}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              type="text"
              placeholder="Custom type..."
              className={inputClass}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target.value.trim()) {
                  handleAdd(e.target.value.trim())
                  e.target.value = ''
                }
              }}
            />
            <button onClick={() => setAdding(false)}
              className="text-[#8A9AB0] hover:text-white text-xs px-2">✕</button>
          </div>
        </div>
      )}

      {/* Component list */}
      {loading ? (
        <p className="text-[#8A9AB0] text-xs">Loading...</p>
      ) : components.length === 0 ? (
        <p className="text-[#4a5a6a] text-xs">No components added yet</p>
      ) : (
        <div className="space-y-2">
          {components.map(component => (
            <div key={component.id} className="bg-[#1a2d45] rounded-lg p-2 border border-[#2a3d55] group">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[#C8622A] text-xs font-medium">{component.component_type}</span>
                <button onClick={() => handleDelete(component.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[#8A9AB0] hover:text-red-400">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <div className="space-y-1">
                <input type="text" placeholder="Name / description"
                  value={component.name || ''}
                  onChange={e => handleUpdate(component.id, 'name', e.target.value)}
                  onBlur={e => supabase.from('placement_components').update({ name: e.target.value }).eq('id', component.id)}
                  className={inputClass} />
                <div className="flex gap-1">
                  <input type="text" placeholder="Part #"
                    value={component.part_number || ''}
                    onChange={e => handleUpdate(component.id, 'part_number', e.target.value)}
                    onBlur={e => supabase.from('placement_components').update({ part_number: e.target.value }).eq('id', component.id)}
                    className={inputClass} />
                  <input type="text" placeholder="Mfr"
                    value={component.manufacturer || ''}
                    onChange={e => handleUpdate(component.id, 'manufacturer', e.target.value)}
                    onBlur={e => supabase.from('placement_components').update({ manufacturer: e.target.value }).eq('id', component.id)}
                    className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A] placeholder-[#4a5a6a]" />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[#8A9AB0] text-xs">Qty:</span>
                  <input type="number" min="1"
                    value={component.quantity || 1}
                    onChange={e => handleUpdate(component.id, 'quantity', parseInt(e.target.value) || 1)}
                    onBlur={e => supabase.from('placement_components').update({ quantity: parseInt(e.target.value) || 1 }).eq('id', component.id)}
                    className="w-14 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A] text-center" />
                  {component.notes !== undefined && (
                    <input type="text" placeholder="Notes"
                      value={component.notes || ''}
                      onChange={e => handleUpdate(component.id, 'notes', e.target.value)}
                      onBlur={e => supabase.from('placement_components').update({ notes: e.target.value }).eq('id', component.id)}
                      className="flex-1 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A] placeholder-[#4a5a6a]" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── PlacementPanel ───────────────────────────────────────────────────────────
// Right side panel — full edit fields for a selected placement
function PlacementPanel({ placement, onClose, onUpdate, onSaved, sheets, currentSheetId, proposalId }) {
  const [attachedRun, setAttachedRun] = useState(null)

  useEffect(() => {
    const fetchRun = async () => {
      const { data } = await supabase
        .from('cable_runs')
        .select('footage, waste_factor, cable_type, total_footage')
        .or(`from_placement_id.eq.${placement.id},to_placement_id.eq.${placement.id}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setAttachedRun(data)
    }
    fetchRun()
  }, [placement.id])
  if (!placement) return null
  const product = placement.global_products
  if (!product) return null

  const getInitialForm = (p) => ({
    device_address:         p.device_address         || '',
    part_number_override:   p.part_number_override   || '',
    manufacturer_override:  p.manufacturer_override  || '',
    model_number_override:  p.model_number_override  || '',
    description_override:   p.description_override   || '',
    notes:                  p.notes                  || '',
    quantity:               p.quantity               || 1,
    symbol_size:            p.symbol_size            || 32,
    rotation:               p.rotation               || 0,
    marker_color:           p.marker_color           || '#C8622A',
    runs_to_sheet_id:       p.runs_to_sheet_id       || '',
    runs_to_label:          p.runs_to_label          || '',
    rise_height:            p.rise_height            || '',
    rise_cable_type:        p.rise_cable_type        || 'Cat6',
    fov_angle:              p.fov_angle              || null,
    fov_range:              p.fov_range              || null,
    serial_number:          p.serial_number          || '',
    ip_address:             p.ip_address             || '',
    mac_address:            p.mac_address            || '',
    switch_name:            p.switch_name            || '',
    switch_port:            p.switch_port            || '',
    patch_panel_label:      p.patch_panel_label      || '',
  })

  const [form, setForm] = useState(() => getInitialForm(placement))

  useEffect(() => {
    setForm(getInitialForm(placement))
    setShowAsBuilt(false)
  }, [placement.id])

  const [saved,  setSaved]            = useState(false)
  const [showAsBuilt, setShowAsBuilt] = useState(false)
  const saveTimer = useRef(null)

  const update = (field, value) => {
    const updated = { ...form, [field]: value }
    setForm(updated)
    onUpdate?.({ ...placement, ...updated })

    // Debounced auto-save — outside setForm so timer persists correctly
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const { error } = await supabase.from('drawing_placements').update({
        device_address:        updated.device_address        || null,
        part_number_override:  updated.part_number_override  || null,
        manufacturer_override: updated.manufacturer_override || null,
        description_override:  updated.description_override  || null,
        notes:                 updated.notes                 || null,
        quantity:              parseInt(updated.quantity)    || 1,
        symbol_size:           parseInt(updated.symbol_size) || 32,
          rotation:              parseInt(updated.rotation) || 0,
          marker_color:          updated.marker_color || '#C8622A',
          runs_to_sheet_id:      updated.runs_to_sheet_id || null,
          runs_to_label:         updated.runs_to_label || null,
          rise_height:           updated.rise_height ? parseFloat(updated.rise_height) : null,
          rise_cable_type:       updated.rise_cable_type || null,
          fov_angle:             updated.fov_angle ? parseInt(updated.fov_angle) : null,
          fov_range:             updated.fov_range ? parseInt(updated.fov_range) : null,
        serial_number:         updated.serial_number         || null,
        ip_address:            updated.ip_address            || null,
        mac_address:           updated.mac_address           || null,
        switch_name:           updated.switch_name           || null,
        switch_port:           updated.switch_port           || null,
        patch_panel_label:     updated.patch_panel_label     || null,
      }).eq('id', placement.id)
      if (!error) {
        setSaved(true)
        onSaved?.()
        setTimeout(() => setSaved(false), 1500)
      } else {
        console.error('Auto-save failed:', error)
      }
    }, 800)
  }

  

  const inputClass = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#C8622A] placeholder-[#4a5a6a]"
  const labelClass = "text-[#8A9AB0] text-xs mb-1 block"

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-[#2a3d55] flex-shrink-0">
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold truncate">{product.name}</p>
          <p className="text-[#8A9AB0] text-xs">{product.manufacturer} · {product.category}</p>
        </div>
        <button onClick={onClose} className="text-[#8A9AB0] hover:text-white transition-colors flex-shrink-0 ml-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Scrollable fields */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {/* Global product reference */}
        <div className="bg-[#1a2d45] rounded-lg px-3 py-2 text-xs text-[#8A9AB0] border border-[#2a3d55]">
          <span className="text-white font-mono">{product.part_number}</span>
          <span className="mx-1">·</span>
          {product.manufacturer}
        </div>

        {/* ── Device data ── */}
        <div>
          <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide mb-2">Device Data</p>
          <div className="space-y-2">
            <div>
              <label className={labelClass}>Device Address / Label</label>
              <input type="text" value={form.device_address || ''}
                onChange={e => update('device_address', e.target.value)}
                placeholder="e.g. CAM-01, DR-01, SW-01"
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Part Number</label>
              <input type="text" value={form.part_number_override}
                onChange={e => update('part_number_override', e.target.value)}
                placeholder={product.part_number}
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Manufacturer</label>
              <input type="text" value={form.manufacturer_override}
                onChange={e => update('manufacturer_override', e.target.value)}
                placeholder={product.manufacturer}
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <input type="text" value={form.description_override}
                onChange={e => update('description_override', e.target.value)}
                placeholder="e.g. 4MP IR IK10 Dome"
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Quantity</label>
              <input type="number" min="1" value={form.quantity}
                onChange={e => update('quantity', e.target.value)}
                className={`${inputClass} w-20`} />
            </div>
            {/* Symbol color */}
            <div className="border-t border-[#2a3d55] pt-3">
              <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide mb-2">Symbol Color</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { color: '#C8622A', label: 'Default' },
                  { color: '#3b82f6', label: 'Interior' },
                  { color: '#22c55e', label: 'Exterior' },
                  { color: '#ef4444', label: 'Critical' },
                  { color: '#a855f7', label: 'Special' },
                  { color: '#eab308', label: 'Warning' },
                ].map(({ color, label }) => (
                  <button key={color} onClick={() => update('marker_color', color)}
                    title={label}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      (form.marker_color || '#C8622A') === color
                        ? 'border-white scale-110'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }} />
                ))}
                <input type="color"
                  value={form.marker_color || '#C8622A'}
                  onChange={e => update('marker_color', e.target.value)}
                  className="w-7 h-7 rounded-full cursor-pointer border-0 bg-transparent"
                  title="Custom color" />
              </div>
            </div>

            {/* Termination / runs to */}
            <div className="border-t border-[#2a3d55] pt-3">
              <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide mb-2">
                Network / Termination
              </p>
              <div className="space-y-2">
                <div>
                  <label className={labelClass}>Runs to</label>
                  <input type="text" value={form.runs_to_label}
                    onChange={e => update('runs_to_label', e.target.value)}
                    placeholder="e.g. IDF-1, MDF, Server Room"
                    className={inputClass} />
                </div>
                {form.runs_to_label && (
                  <>
                    
                    <div>
                      <label className={labelClass}>Cable type</label>
                      <select value={form.rise_cable_type}
                        onChange={e => update('rise_cable_type', e.target.value)}
                        className={inputClass}>
                        {['Cat6', 'Cat6A', 'Cat5e', 'Fiber SM', 'Fiber MM', 'Coax RG59', 'Coax RG6', '18/2', '22/4', 'Composite', 'Power'].map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Vertical rise <span className="text-[#4a5a6a]">(feet, optional)</span></label>
                      <input type="number" value={form.rise_height}
                        onChange={e => update('rise_height', e.target.value)}
                        placeholder="e.g. 14"
                        className={`${inputClass} w-24`} />
                    </div>

                    {/* Distance summary */}
                    {(attachedRun || form.rise_height) && (
                      <div className="bg-[#0F1C2E] rounded-lg p-3 border border-[#2a3d55] space-y-1.5 mt-1">
                        <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide mb-2">Cable Distance</p>
                        {attachedRun && (
                          <div className="flex justify-between text-xs">
                            <span className="text-[#8A9AB0]">Floor run</span>
                            <span className="text-white font-mono">{attachedRun.footage || 0}ft</span>
                          </div>
                        )}
                        {form.rise_height && (
                          <div className="flex justify-between text-xs">
                            <span className="text-[#8A9AB0]">Vertical rise</span>
                            <span className="text-white font-mono">{form.rise_height}ft</span>
                          </div>
                        )}
                        {attachedRun && form.rise_height && (
                          <div className="flex justify-between text-xs">
                            <span className="text-[#8A9AB0]">Subtotal</span>
                            <span className="text-white font-mono">
                              {(parseFloat(attachedRun.footage || 0) + parseFloat(form.rise_height || 0)).toFixed(0)}ft
                            </span>
                          </div>
                        )}
                        {(() => {
                          const run    = parseFloat(attachedRun?.footage || 0)
                          const rise   = parseFloat(form.rise_height || 0)
                          const waste  = parseFloat(attachedRun?.waste_factor || 10)
                          const sub    = run + rise
                          const total  = Math.round(sub * (1 + waste / 100))
                          const type   = form.rise_cable_type || attachedRun?.cable_type || 'Cat6'
                          if (!sub) return null
                          return (
                            <>
                              <div className="flex justify-between text-xs">
                                <span className="text-[#8A9AB0]">Waste ({waste}%)</span>
                                <span className="text-white font-mono">+{Math.round(sub * waste / 100)}ft</span>
                              </div>
                              <div className="flex justify-between text-xs border-t border-[#2a3d55] pt-1.5">
                                <span className="text-[#8A9AB0] font-semibold">Total {type}</span>
                                <span className="text-[#C8622A] font-bold font-mono">{total}ft</span>
                              </div>
                            </>
                          )
                        })()}
                        {!attachedRun && (
                          <p className="text-[#4a5a6a] text-xs">Draw a cable run from this device to see floor footage.</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* FOV settings — cameras only */}
            {['Dome Camera', 'Bullet Camera', 'PTZ Camera', 'Motion Sensor', 'Multi-Lens Camera', 'Fisheye Camera'].includes(product.category) && (
              <div className="border-t border-[#2a3d55] pt-3">
                <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide mb-2">Coverage / FOV</p>
                <div className="space-y-2">
                  <div>
                    <label className={labelClass}>Direction <span className="text-[#4a5a6a]">(rotation)</span></label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="0" max="359" step="1"
                        value={form.rotation || placement.rotation || 0}
                        onChange={e => update('rotation', parseInt(e.target.value))}
                        className="flex-1 accent-[#C8622A]" />
                      <span className="text-[#8A9AB0] text-xs w-10 text-right">
                        {form.rotation ?? placement.rotation ?? 0}°
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-[#4a5a6a] mt-0.5">
                      <span>N</span><span>E</span><span>S</span><span>W</span><span>N</span>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>FOV Angle <span className="text-[#4a5a6a]">(degrees)</span></label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="10" max="360" step="5"
                        value={form.fov_angle || placement.global_products?.specs?.fov_angle || 90}
                        onChange={e => update('fov_angle', parseInt(e.target.value))}
                        className="flex-1 accent-[#C8622A]" />
                      <span className="text-[#8A9AB0] text-xs w-10 text-right">
                        {form.fov_angle || placement.global_products?.specs?.fov_angle || 90}°
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Range <span className="text-[#4a5a6a]">(feet)</span></label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="5" max="200" step="5"
                        value={form.fov_range || placement.global_products?.specs?.ir_range || 30}
                        onChange={e => update('fov_range', parseInt(e.target.value))}
                        className="flex-1 accent-[#C8622A]" />
                      <span className="text-[#8A9AB0] text-xs w-10 text-right">
                        {form.fov_range || placement.global_products?.specs?.ir_range || 30}ft
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Symbol size */}
            <div>
              <label className={labelClass}>Symbol Size</label>
              <div className="flex items-center gap-2">
                <input type="range" min="16" max="64" step="4"
                  value={form.symbol_size || 32}
                  onChange={e => update('symbol_size', parseInt(e.target.value))}
                  className="flex-1 accent-[#C8622A]" />
                <span className="text-[#8A9AB0] text-xs w-8 text-right">{form.symbol_size || 32}px</span>
              </div>
              <div className="flex justify-between text-xs text-[#4a5a6a] mt-0.5">
                <span>S</span><span>M</span><span>L</span><span>XL</span>
              </div>
            </div>
            <div>
              <label className={labelClass}>Notes</label>
              <textarea value={form.notes}
                onChange={e => update('notes', e.target.value)}
                placeholder="e.g. Mount at 9ft, corridor mode"
                rows={2}
                className={`${inputClass} resize-none`} />
            </div>
          </div>
        </div>

        {/* ── Components ── */}
        <ComponentsSection placementId={placement.id} orgId={placement.org_id} category={product.category} />

        {/* ── As-built fields ── */}
        <div className="border-t border-[#2a3d55] pt-3">
          <button
            onClick={() => setShowAsBuilt(s => !s)}
            className="flex items-center justify-between w-full text-left mb-2"
          >
            <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide">As-Built Data</p>
            <svg className={`w-3 h-3 text-[#8A9AB0] transition-transform ${showAsBuilt ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
            </svg>
          </button>

          {showAsBuilt && (
            <div className="space-y-2">
              <div>
                <label className={labelClass}>Serial Number</label>
                <input type="text" value={form.serial_number}
                  onChange={e => update('serial_number', e.target.value)}
                  placeholder="Device serial number"
                  className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>IP Address</label>
                <input type="text" value={form.ip_address}
                  onChange={e => update('ip_address', e.target.value)}
                  placeholder="192.168.1.x"
                  className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>MAC Address</label>
                <input type="text" value={form.mac_address}
                  onChange={e => update('mac_address', e.target.value)}
                  placeholder="AA:BB:CC:DD:EE:FF"
                  className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Switch Name</label>
                <input type="text" value={form.switch_name}
                  onChange={e => update('switch_name', e.target.value)}
                  placeholder="e.g. SW-IDF1"
                  className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Switch Port</label>
                <input type="text" value={form.switch_port}
                  onChange={e => update('switch_port', e.target.value)}
                  placeholder="e.g. Gi1/0/12"
                  className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Patch Panel Label</label>
                <input type="text" value={form.patch_panel_label}
                  onChange={e => update('patch_panel_label', e.target.value)}
                  placeholder="e.g. PP-A · C01"
                  className={inputClass} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save button */}
      <div className="px-3 py-2 border-t border-[#2a3d55] flex-shrink-0 text-center">
        <span className={`text-xs transition-opacity ${saved ? 'text-green-400 opacity-100' : 'text-[#4a5a6a] opacity-60'}`}>
          {saved ? '✓ Saved' : 'Changes save automatically'}
        </span>
 </div>
    </div>
  )
}

// ─── CablePanel ───────────────────────────────────────────────────────────────
function CablePanel({ cable, onClose, onUpdate, onDelete, onEditPoints }) {
  const [form, setForm] = useState({
    cable_type:   cable.cable_type   || 'Cat6',
    label:        cable.label        || '',
    waste_factor: cable.waste_factor || 10,
    color:        cable.color        || '#3b82f6',
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
        label:         updated.label || null,
        waste_factor:  parseFloat(updated.waste_factor) || 10,
        total_footage: totalFootage,
        color:         updated.color || '#3b82f6',
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
  )
}