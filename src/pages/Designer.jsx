import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import DrawingSheet from '../components/drawing/DrawingSheet'
import SymbolPicker from '../components/drawing/SymbolPicker'
import DrawingBOMPreview from '../components/drawing/DrawingBOMPreview'
import DrawingExport from '../components/drawing/DrawingExport'
import SheetTab from '../components/designer/SheetTab'
import PlacementPanel from '../components/designer/PlacementPanel'
import CablePanel from '../components/designer/CablePanel'

export default function Designer({ featureDrawingTool, featureDesignerOnly }) {
  const { proposalId } = useParams()
  const navigate       = useNavigate()

  const [proposal,        setProposal]        = useState(null)
  const [sheets,          setSheets]          = useState([])
  const [activeSheetId,   setActiveSheetId]   = useState(null)
  const [orgId,           setOrgId]           = useState(null)
  const [laborEnabled,    setLaborEnabled]    = useState(false)
  const [laborDefaults,   setLaborDefaults]   = useState([])
  const [loading,         setLoading]         = useState(true)
  const [uploading,       setUploading]       = useState(false)
  const [approving,        setApproving]        = useState(false)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [approveData,      setApproveData]      = useState(null)
  const [error,           setError]           = useState(null)
  const [selectedSymbol,  setSelectedSymbol]  = useState(null)
  const [selectedPlacement, setSelectedPlacement] = useState(null)
  const [selectedCable,     setSelectedCable]     = useState(null)
  const [editingCableId,    setEditingCableId]    = useState(null)
  const [updatedCable,      setUpdatedCable]      = useState(null)
  const [deletedCableId,    setDeletedCableId]    = useState(null)
  const [copiedPlacement,   setCopiedPlacement]   = useState(null)
  const [showLabels,        setShowLabels]        = useState(() => localStorage.getItem('designer_show_labels') !== 'false')
  const [industryFilter,    setIndustryFilter]    = useState('all')
  const stageRefs = useRef({}) // sheetId -> Konva stage
  const [bomRefreshKey,          setBomRefreshKey]          = useState(0)
  const [placementsRefreshKey,   setPlacementsRefreshKey]   = useState(0)
  const [activeTab,       setActiveTab]       = useState('canvas') // 'canvas' | 'bom'
  const [sidebarOpen,     setSidebarOpen]     = useState(true)
  const [showFireAlarmAck, setShowFireAlarmAck] = useState(false)
  const [fireAlarmAck,    setFireAlarmAck]    = useState({
    licensed: false, liability: false, estimates: false, ahj: false
  })
  const [nicetNumber, setNicetNumber] = useState('')

  useEffect(() => {
    if (featureDrawingTool === false && !featureDesignerOnly) { navigate('/'); return }
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

      const [{ data: org }, { data: defaults }] = await Promise.all([
        supabase.from('organizations').select('designer_labor_enabled').eq('id', profile.org_id).single(),
        supabase.from('designer_labor_defaults').select('category, labor_role, hours_per_unit').eq('org_id', profile.org_id),
      ])
      setLaborEnabled(org?.designer_labor_enabled ?? false)
      setLaborDefaults(defaults || [])

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
      const { uploadToR2 } = await import('../r2')
      await uploadToR2(storagePath, file, file.type)

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

      // Only delete from storage if NO other sheets share the same storage_path
      if (sheet?.storage_path && !['pending', 'blank'].includes(sheet.storage_path)) {
        const othersUsingFile = sheets.filter(s => 
          s.id !== sheetId && s.storage_path === sheet.storage_path
        )
        if (othersUsingFile.length === 0) {
          // R2 deletion — skip for now, files cleaned up via maintenance
        }
      }

      const nextSheet = sheets.find(s => s.id !== sheetId)
      setActiveSheetId(nextSheet?.id || null)
      setSheets(prev => prev.filter(s => s.id !== sheetId))
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
    try {
    const sheetIds = sheets.map(s => s.id)
    const [{ data: placementData }, { data: cableData }, { data: riseData }] = await Promise.all([
      supabase.from('drawing_placements')
        .select('*, global_products(name, part_number, manufacturer, category, accessories), placement_components(*)')
        .in('drawing_sheet_id', sheetIds),
      supabase.from('cable_runs').select('cable_type, total_footage').in('drawing_sheet_id', sheetIds),
      supabase.from('vertical_rises').select('cable_type, total_footage').eq('proposal_id', proposalId),
    ])

    const deviceMap = {}
    ;(placementData || []).forEach(p => {
      const gp  = p.global_products
      const key = p.part_number_override || gp?.part_number || 'unknown'
      if (!deviceMap[key]) deviceMap[key] = {
        part_number:  p.part_number_override || gp?.part_number,
        name:         p.description_override || gp?.name,
        manufacturer: p.manufacturer_override || gp?.manufacturer,
        category:     gp?.category,
        qty:          0,
        is_generic:   !p.part_number_override && gp?.manufacturer === 'Generic',
      }
      deviceMap[key].qty += p.quantity || 1

      // placement_components (hardware attached to this device)
      ;(p.placement_components || []).forEach(c => {
        const cKey = c.part_number || c.name || 'unknown_component'
        if (!deviceMap[cKey]) deviceMap[cKey] = {
          part_number:  c.part_number || null,
          name:         c.name,
          manufacturer: c.manufacturer || null,
          category:     c.component_type,
          qty:          0,
          is_generic:   !c.part_number,
        }
        deviceMap[cKey].qty += c.quantity || 1
      })
    })

    const cableMap = {}
    ;[...(cableData || []), ...(riseData || [])].forEach(r => {
      const t = r.cable_type || 'Unknown'
      if (!cableMap[t]) cableMap[t] = 0
      cableMap[t] += r.total_footage || 0
    })

    setApproveData({
      devices:    Object.values(deviceMap).sort((a, b) => (a.category || '').localeCompare(b.category || '')),
      cables:     Object.entries(cableMap),
      hasGenerics: Object.values(deviceMap).some(d => d.is_generic),
    })
    setShowApproveModal(true)
    } catch (err) {
      console.error('handleApprove error:', err)
      alert('Failed to load preview: ' + err.message)
    }
  }
  const handleApproveConfirm = async () => {
    setApproving(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.rpc('sync_drawing_to_bom', {
        p_proposal_id: proposalId,
        p_approved_by: user.id,
      })
      if (error) throw error
      setShowApproveModal(false)
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

          {/* Sign out — shown for designer-only users who have no sidebar */}
          {featureDesignerOnly && !featureDrawingTool && (
            <button
              onClick={async () => { sessionStorage.removeItem('orgType'); await supabase.auth.signOut() }}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#2a3d55] text-[#8A9AB0] hover:text-white hover:border-[#C8622A]/40 transition-colors"
              title="Sign out">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
              </svg>
            </button>
          )}

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
                      orgId={orgId}
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
                        deletedCableId={deletedCableId}
                        copiedPlacement={copiedPlacement}
                        onCopyPlacement={(p) => setCopiedPlacement(p)}
                        onStageReady={(stage) => { stageRefs.current[activeSheetId] = stage }}
                        allSheetIds={sheets.map(s => s.id)}
                        showLabels={showLabels}
                        placementsRefreshKey={placementsRefreshKey}
                        onToggleLabels={(val) => {
                          setShowLabels(val)
                          localStorage.setItem('designer_show_labels', val)
                        }}
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
                          onSaved={() => { setBomRefreshKey(k => k + 1); setPlacementsRefreshKey(k => k + 1) }}
                          sheets={sheets}
                          currentSheetId={activeSheetId}
                          proposalId={proposalId}
                          allSheetIds={sheets.map(s => s.id)}
                          laborEnabled={laborEnabled}
                          laborDefaults={laborDefaults}
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
                            setDeletedCableId(selectedCable?.id)
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
              stageRefs={stageRefs}
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

      {/* ── Pre-approval BOM Review Modal ── */}
      {showApproveModal && approveData && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a3d55] flex-shrink-0">
              <div>
                <h2 className="text-white font-bold text-lg">Review Before Approving</h2>
                <p className="text-[#8A9AB0] text-xs mt-0.5">
                  This will push to the proposal BOM and replace any previously drawing-sourced items
                </p>
              </div>
              <button onClick={() => setShowApproveModal(false)} className="text-[#8A9AB0] hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              {/* Generic warning */}
              {approveData.hasGenerics && (
                <div className="flex items-start gap-3 bg-yellow-900/20 border border-yellow-800/40 rounded-xl p-4">
                  <svg className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  </svg>
                  <div>
                    <p className="text-yellow-400 text-sm font-semibold">Generic devices detected</p>
                    <p className="text-yellow-400/70 text-xs mt-0.5">
                      Some devices are still using generic symbols. You can still approve — they'll appear as unpriced items in the BOM. Fill in real part numbers for accurate pricing.
                    </p>
                  </div>
                </div>
              )}

              {/* Devices */}
              <div>
                <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide mb-2">
                  Devices & Equipment ({approveData.devices.reduce((s, d) => s + d.qty, 0)} total)
                </p>
                <div className="bg-[#0F1C2E] rounded-xl overflow-hidden border border-[#2a3d55]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#2a3d55]">
                        <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">Part Number</th>
                        <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">Name</th>
                        <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">Manufacturer</th>
                        <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">Category</th>
                        <th className="text-center px-4 py-2 font-medium text-[#8A9AB0]">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2a3d55]/50">
                      {approveData.devices.map((d, i) => (
                        <tr key={i} className={d.is_generic ? 'bg-yellow-900/10' : ''}>
                          <td className="px-4 py-2 font-mono text-[#C8622A]">{d.part_number}</td>
                          <td className="px-4 py-2 text-white">{d.name}</td>
                          <td className="px-4 py-2 text-[#8A9AB0]">{d.manufacturer}</td>
                          <td className="px-4 py-2">
                            <span className="px-2 py-0.5 rounded-full bg-[#2a3d55] text-[#8A9AB0]">{d.category}</span>
                          </td>
                          <td className="px-4 py-2 text-center text-white font-semibold">{d.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cable summary */}
              {approveData.cables.length > 0 && (
                <div>
                  <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide mb-2">Cable Summary</p>
                  <div className="bg-[#0F1C2E] rounded-xl border border-[#2a3d55] divide-y divide-[#2a3d55]/50">
                    {approveData.cables.map(([type, footage]) => (
                      <div key={type} className="flex items-center justify-between px-4 py-2 text-xs">
                        <span className="text-white">{type}</span>
                        <span className="text-[#C8622A] font-bold font-mono">{Math.round(footage)}ft</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#0F1C2E] rounded-xl p-3 border border-[#2a3d55] text-center">
                  <p className="text-[#C8622A] text-xl font-bold">{sheets.length}</p>
                  <p className="text-[#8A9AB0] text-xs">Sheets</p>
                </div>
                <div className="bg-[#0F1C2E] rounded-xl p-3 border border-[#2a3d55] text-center">
                  <p className="text-[#C8622A] text-xl font-bold">{approveData.devices.reduce((s, d) => s + d.qty, 0)}</p>
                  <p className="text-[#8A9AB0] text-xs">Devices</p>
                </div>
                <div className="bg-[#0F1C2E] rounded-xl p-3 border border-[#2a3d55] text-center">
                  <p className="text-[#C8622A] text-xl font-bold">{Math.round(approveData.cables.reduce((s, [, f]) => s + f, 0))}ft</p>
                  <p className="text-[#8A9AB0] text-xs">Total Cable</p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#2a3d55] flex-shrink-0">
              <button onClick={() => setShowApproveModal(false)}
                className="px-4 py-2 text-sm text-[#8A9AB0] hover:text-white transition-colors">
                Cancel — keep editing
              </button>
              <button onClick={handleApproveConfirm} disabled={approving}
                className={`flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
                  approving ? 'bg-[#2a3d55] text-[#8A9AB0] cursor-not-allowed' : 'bg-[#C8622A] text-white hover:bg-[#b5571f]'
                }`}>
                {approving ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Pushing to BOM...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                    </svg>
                    Confirm & Push to BOM
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

