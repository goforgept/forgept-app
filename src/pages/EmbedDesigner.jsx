import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import DrawingSheet from '../components/drawing/DrawingSheet'
import SymbolPicker from '../components/drawing/SymbolPicker'
import DrawingBOMPreview from '../components/drawing/DrawingBOMPreview'
import SheetTab from '../components/designer/SheetTab'
import PlacementPanel from '../components/designer/PlacementPanel'
import CablePanel from '../components/designer/CablePanel'

export default function EmbedDesigner() {
  const [searchParams]  = useSearchParams()
  const sessionToken    = searchParams.get('session')
  const proposalIdParam = searchParams.get('proposal')

  const [status,          setStatus]          = useState('authenticating')
  const [orgId,           setOrgId]           = useState(null)
  const [proposalId,      setProposalId]      = useState(proposalIdParam)
  const [proposal,        setProposal]        = useState(null)
  const [sheets,          setSheets]          = useState([])
  const [activeSheetId,   setActiveSheetId]   = useState(null)
  const [laborEnabled,    setLaborEnabled]    = useState(false)
  const [laborDefaults,   setLaborDefaults]   = useState([])
  const [uploading,       setUploading]       = useState(false)
  const [error,           setError]           = useState(null)
  const [selectedSymbol,  setSelectedSymbol]  = useState(null)
  const [selectedPlacement, setSelectedPlacement] = useState(null)
  const [selectedCable,     setSelectedCable]     = useState(null)
  const [editingCableId,    setEditingCableId]    = useState(null)
  const [updatedCable,      setUpdatedCable]      = useState(null)
  const [deletedCableId,    setDeletedCableId]    = useState(null)
  const [copiedPlacement,   setCopiedPlacement]   = useState(null)
  const [showLabels,        setShowLabels]        = useState(true)
  const [activeTab,         setActiveTab]         = useState('canvas')
  const [sidebarOpen,       setSidebarOpen]       = useState(true)
  const [exporting,         setExporting]         = useState(false)
  const [exported,          setExported]          = useState(false)
  const [bomRefreshKey,          setBomRefreshKey]          = useState(0)
  const [placementsRefreshKey,   setPlacementsRefreshKey]   = useState(0)
  const stageRefs = useRef({})

  const activeSheet = sheets.find(s => s.id === activeSheetId) || null

  useEffect(() => { init() }, [])

  const init = async () => {
    if (!sessionToken) { setStatus('error'); return }

    const { data, error: sessionErr } = await supabase.auth.setSession({
      access_token:  sessionToken,
      refresh_token: 'embed_session',
    })
    if (sessionErr || !data?.session) { setStatus('error'); return }

    setStatus('loading')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile }  = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
      if (!profile) { setStatus('error'); return }
      setOrgId(profile.org_id)

      const [{ data: org }, { data: defaults }] = await Promise.all([
        supabase.from('organizations').select('designer_labor_enabled').eq('id', profile.org_id).single(),
        supabase.from('designer_labor_defaults').select('category, labor_role, hours_per_unit').eq('org_id', profile.org_id),
      ])
      setLaborEnabled(org?.designer_labor_enabled ?? false)
      setLaborDefaults(defaults || [])

      let pid = proposalIdParam
      if (!pid) {
        // Auto-create a proposal for this embed session
        const { data: newProp } = await supabase.from('proposals').insert({
          proposal_name: 'Embedded Design',
          org_id:        profile.org_id,
          user_id:       user.id,
          status:        'Draft',
          industry:      'Security',
        }).select('id, proposal_name, company, client_name, status, industry').single()
        pid = newProp?.id
        setProposalId(pid)
        setProposal(newProp)
      } else {
        const { data: p } = await supabase.from('proposals')
          .select('id, proposal_name, company, client_name, status, industry')
          .eq('id', pid).single()
        setProposal(p)
      }

      const { data: sheetData } = await supabase
        .from('drawing_sheets').select('*')
        .eq('proposal_id', pid)
        .neq('storage_path', 'pending')
        .order('sort_order', { ascending: true })
      setSheets(sheetData || [])
      if (sheetData?.length > 0) setActiveSheetId(sheetData[0].id)

      setStatus('ready')
    } catch (e) {
      console.error(e)
      setStatus('error')
    }
  }

  const load = async () => {
    if (!proposalId) return
    const { data: sheetData } = await supabase
      .from('drawing_sheets').select('*')
      .eq('proposal_id', proposalId)
      .neq('storage_path', 'pending')
      .order('sort_order', { ascending: true })
    setSheets(sheetData || [])
    if (sheetData?.length > 0 && !activeSheetId) setActiveSheetId(sheetData[0].id)
  }

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['application/pdf', 'image/png', 'image/jpeg']
    if (!allowed.includes(file.type)) { setError('Please upload a PDF, PNG, or JPG.'); return }
    if (!orgId || !proposalId) return
    setUploading(true)
    setError(null)
    try {
      const isPDF = file.type === 'application/pdf'
      let numPages = 1
      if (isPDF) {
        const pdfjsLib  = await import('pdfjs-dist')
        const workerUrl = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl.default
        const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
        numPages = pdf.numPages
      }
      const baseName    = file.name.replace(/\.[^/.]+$/, '')
      const ext         = file.name.split('.').pop()
      const storagePath = `${orgId}/${proposalId}/${crypto.randomUUID()}.${ext}`
      const { uploadToR2 } = await import('../r2')
      await uploadToR2(storagePath, file, file.type)
      let firstId = null
      for (let i = 1; i <= numPages; i++) {
        const cleanName = baseName.replace(/^\d{4}-\d{2}-\d{2}[_\s-]*/g, '').trim().slice(0, 40)
        const sheetName = numPages > 1 ? `${cleanName} — P${i}` : cleanName
        const { data: sheet } = await supabase.from('drawing_sheets').insert({
          org_id: orgId, proposal_id: proposalId, name: sheetName,
          storage_path: storagePath, page_number: i, sort_order: sheets.length + i - 1,
          last_activity_at: new Date().toISOString(),
        }).select().single()
        if (i === 1) firstId = sheet?.id
      }
      await load()
      if (firstId) setActiveSheetId(firstId)
    } catch (err) {
      setError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleAddBlankSheet = async () => {
    if (!orgId || !proposalId) return
    const { data: sheet } = await supabase.from('drawing_sheets').insert({
      org_id: orgId, proposal_id: proposalId,
      name: `Floor ${sheets.length + 1}`, storage_path: 'blank', sort_order: sheets.length,
    }).select().single()
    await load()
    if (sheet) setActiveSheetId(sheet.id)
  }

  const handleDeleteSheet = async (sheetId) => {
    if (!window.confirm('Delete this floor plan and all device placements on it?')) return
    await supabase.from('drawing_sheets').delete().eq('id', sheetId)
    const next = sheets.find(s => s.id !== sheetId)
    setActiveSheetId(next?.id || null)
    setSheets(prev => prev.filter(s => s.id !== sheetId))
  }

  const handleRenameSheet = async (sheetId, newName) => {
    if (!newName?.trim()) return
    await supabase.from('drawing_sheets').update({ name: newName.trim() }).eq('id', sheetId)
    setSheets(prev => prev.map(s => s.id === sheetId ? { ...s, name: newName.trim() } : s))
  }

  const handleExportBOM = async () => {
    if (!proposalId || sheets.length === 0) return
    setExporting(true)
    try {
      const sheetIds = sheets.map(s => s.id)
      const [{ data: placements }, { data: cables }] = await Promise.all([
        supabase.from('drawing_placements')
          .select('quantity, part_number_override, manufacturer_override, description_override, notes, device_address, global_products(name, part_number, manufacturer, category), placement_components(*)')
          .in('drawing_sheet_id', sheetIds),
        supabase.from('cable_runs').select('cable_type, total_footage').in('drawing_sheet_id', sheetIds),
      ])

      const bom: Record<string, any> = {}
      for (const p of (placements || []) as any[]) {
        const key = p.part_number_override || p.global_products?.part_number || 'unassigned'
        const qty = p.quantity ?? 1
        if (bom[key]) bom[key].quantity += qty
        else bom[key] = {
          part_number:  key === 'unassigned' ? null : key,
          name:         p.description_override || p.global_products?.name,
          manufacturer: p.manufacturer_override || p.global_products?.manufacturer,
          category:     p.global_products?.category,
          quantity:     qty,
        }
        for (const c of (p.placement_components || []) as any[]) {
          const ck = c.part_number || c.name
          if (bom[ck]) bom[ck].quantity += c.quantity ?? 1
          else bom[ck] = { part_number: c.part_number || null, name: c.name, manufacturer: c.manufacturer || null, category: c.component_type, quantity: c.quantity ?? 1 }
        }
      }

      const cableSummary: Record<string, number> = {}
      for (const c of (cables || []) as any[]) {
        cableSummary[c.cable_type] = (cableSummary[c.cable_type] || 0) + (c.total_footage || 0)
      }

      const payload = {
        type:        'forgept:export',
        proposal_id: proposalId,
        devices:     Object.values(bom).sort((a: any, b: any) => (a.category || '').localeCompare(b.category || '')),
        cables:      Object.entries(cableSummary).map(([cable_type, footage]) => ({ cable_type, footage })),
      }

      window.parent.postMessage(payload, '*')
      setExported(true)
      setTimeout(() => setExported(false), 3000)
    } finally {
      setExporting(false)
    }
  }

  if (status === 'authenticating' || status === 'loading') return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-[#C8622A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-[#8A9AB0] text-sm">{status === 'authenticating' ? 'Authenticating…' : 'Loading designer…'}</p>
      </div>
    </div>
  )

  if (status === 'error') return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <div className="text-center max-w-sm px-6">
        <p className="text-red-400 font-semibold mb-2">Unable to load designer</p>
        <p className="text-[#8A9AB0] text-sm">The embed session is missing or has expired. Generate a new session token from your server and reload the iframe.</p>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-screen bg-[#0F1C2E] overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2a3d55] bg-[#1a2d45] flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[#C8622A] text-sm">📐</span>
          <span className="text-white font-semibold text-sm truncate">
            {proposal?.proposal_name || proposal?.company || 'Designer'}
          </span>
          {proposal?.client_name && (
            <span className="text-[#8A9AB0] text-xs hidden md:block">{proposal.client_name}</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Tab switcher */}
          <div className="flex items-center gap-0.5 bg-[#0F1C2E] rounded-lg p-0.5">
            {[{ id: 'canvas', label: 'Drawing' }, { id: 'bom', label: 'BOM Preview' }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${activeTab === tab.id ? 'bg-[#C8622A] text-white' : 'text-[#8A9AB0] hover:text-white'}`}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Symbol picker toggle */}
          {activeTab === 'canvas' && sheets.length > 0 && (
            <button onClick={() => setSidebarOpen(s => !s)}
              className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${sidebarOpen ? 'border-[#C8622A]/40 bg-[#C8622A]/10 text-[#C8622A]' : 'border-[#2a3d55] text-[#8A9AB0] hover:text-white'}`}
              title="Toggle symbol picker">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7"/>
              </svg>
            </button>
          )}

          {/* Export BOM */}
          <button onClick={handleExportBOM} disabled={exporting || sheets.length === 0}
            className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 ${exported ? 'bg-green-600 text-white' : 'bg-[#C8622A] text-white hover:bg-[#b5571f]'}`}>
            {exported ? '✓ Exported' : exporting ? 'Exporting…' : 'Export BOM'}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-900/30 border-b border-red-800/40 text-xs text-red-400 flex items-center justify-between flex-shrink-0">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="underline ml-2">Dismiss</button>
        </div>
      )}

      {/* Sheet tabs */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[#2a3d55] bg-[#0F1C2E] overflow-x-auto flex-shrink-0">
        {sheets.map(sheet => (
          <SheetTab key={sheet.id} sheet={sheet}
            isActive={sheet.id === activeSheetId}
            onSelect={() => { setActiveSheetId(sheet.id); setSelectedPlacement(null) }}
            onRename={(name) => handleRenameSheet(sheet.id, name)}
            onDelete={() => handleDeleteSheet(sheet.id)} />
        ))}
        <label className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-dashed border-[#2a3d55] text-[#8A9AB0] hover:border-[#C8622A] hover:text-[#C8622A] cursor-pointer transition-colors whitespace-nowrap ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
          {uploading
            ? <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Uploading…</>
            : <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>Upload Floor Plan</>
          }
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
        <button onClick={handleAddBlankSheet}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-dashed border-[#2a3d55] text-[#8A9AB0] hover:border-[#C8622A] hover:text-[#C8622A] transition-colors whitespace-nowrap">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          Blank Canvas
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex min-h-0">

        {activeTab === 'canvas' && (
          <>
            {sheets.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-6 p-12 text-center">
                <div className="w-20 h-20 rounded-2xl bg-[#1a2d45] flex items-center justify-center">
                  <span className="text-4xl">📐</span>
                </div>
                <div>
                  <p className="text-white text-lg font-semibold">Start your floor plan</p>
                  <p className="text-[#8A9AB0] text-sm mt-2 max-w-sm">Upload a PDF or image floor plan, or start with a blank canvas.</p>
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
                {sidebarOpen && (
                  <div className="w-60 border-r border-[#2a3d55] flex-shrink-0 overflow-y-auto min-h-0 h-full">
                    <SymbolPicker selectedSymbol={selectedSymbol} onSelect={setSelectedSymbol} orgId={orgId} />
                  </div>
                )}

                <div className="flex-1 flex overflow-hidden min-w-0">
                  <div className="flex-1 overflow-hidden min-w-0">
                    {activeSheet && (
                      <DrawingSheet
                        key={activeSheet.id}
                        sheet={activeSheet}
                        orgId={orgId}
                        selectedSymbol={selectedSymbol}
                        onPlacementChange={() => { setBomRefreshKey(k => k + 1) }}
                        onPlacementSelect={(p) => { setSelectedPlacement(p); setSelectedCable(null) }}
                        onPlacementUpdate={setSelectedPlacement}
                        updatedPlacement={selectedPlacement}
                        onCableSelect={(c) => { setSelectedCable(c); setSelectedPlacement(null) }}
                        editingCableId={editingCableId}
                        onEditingCableDone={() => setEditingCableId(null)}
                        updatedCable={updatedCable}
                        deletedCableId={deletedCableId}
                        copiedPlacement={copiedPlacement}
                        onCopyPlacement={setCopiedPlacement}
                        onStageReady={(stage) => { stageRefs.current[activeSheet.id] = stage }}
                        allSheetIds={sheets.map(s => s.id)}
                        showLabels={showLabels}
                        onToggleLabels={() => setShowLabels(s => !s)}
                        placementsRefreshKey={placementsRefreshKey}
                      />
                    )}
                  </div>

                  {/* Right panel */}
                  {(selectedPlacement || selectedCable) && (
                    <div className="w-72 border-l border-[#2a3d55] flex-shrink-0 overflow-y-auto min-h-0 h-full">
                      {selectedPlacement && (
                        <PlacementPanel
                          placement={selectedPlacement}
                          orgId={orgId}
                          laborEnabled={laborEnabled}
                          laborDefaults={laborDefaults}
                          onUpdate={(updated) => {
                            setSelectedPlacement(updated)
                            setBomRefreshKey(k => k + 1)
                            setPlacementsRefreshKey(k => k + 1)
                          }}
                          onDelete={() => {
                            setSelectedPlacement(null)
                            setBomRefreshKey(k => k + 1)
                            setPlacementsRefreshKey(k => k + 1)
                          }}
                          onClose={() => setSelectedPlacement(null)}
                        />
                      )}
                      {selectedCable && !selectedPlacement && (
                        <CablePanel
                          cable={selectedCable}
                          onUpdate={(updated) => { setSelectedCable(updated); setUpdatedCable(updated) }}
                          onDelete={() => { setDeletedCableId(selectedCable.id); setSelectedCable(null) }}
                          onEditPath={() => { setEditingCableId(selectedCable.id) }}
                          onClose={() => setSelectedCable(null)}
                        />
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {activeTab === 'bom' && (
          <div className="flex-1 overflow-y-auto p-4">
            <DrawingBOMPreview proposalId={proposalId} refreshKey={bomRefreshKey} />
          </div>
        )}
      </div>
    </div>
  )
}
