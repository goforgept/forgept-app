import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

// ─── Designer ─────────────────────────────────────────────────────────────────
// Full screen Designer page at /designer/:proposalId
// Bundle 1 — shell, routing, sheet management
// Bundle 2 — canvas, symbol picker, placement
// Bundle 3 — edit panel, bulk edit, assembly templates
// Bundle 4 — AI integration
// Bundle 5 — cable paths, FOV, calculations
// Bundle 6 — export, share, diagrams
export default function Designer({ featureDrawingTool }) {
  const { proposalId } = useParams()
  const navigate       = useNavigate()

  const [proposal,      setProposal]      = useState(null)
  const [sheets,        setSheets]        = useState([])
  const [activeSheetId, setActiveSheetId] = useState(null)
  const [orgId,         setOrgId]         = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [uploading,     setUploading]     = useState(false)
  const [error,         setError]         = useState(null)
  const [showFireAlarmAck, setShowFireAlarmAck] = useState(false)
  const [fireAlarmAck,     setFireAlarmAck]     = useState({
    licensed: false, liability: false, estimates: false, ahj: false
  })
  const [nicetNumber, setNicetNumber] = useState('')

  useEffect(() => {
    if (featureDrawingTool === false) {
      navigate('/')
      return
    }
    load()
  }, [proposalId])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile }  = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()

      setOrgId(profile.org_id)

      // Load proposal
      if (proposalId && proposalId !== 'new') {
        const { data: proposalData } = await supabase
          .from('proposals')
          .select('id, proposal_name, company, client_name, status, industry')
          .eq('id', proposalId)
          .single()
        setProposal(proposalData)

        // Check fire alarm industry
        if (proposalData?.industry === 'fire_alarm') {
          const ackKey = `fire_alarm_ack_${proposalId}`
          if (!sessionStorage.getItem(ackKey)) {
            setShowFireAlarmAck(true)
          }
        }
      }

      // Load sheets
      const { data: sheetData } = await supabase
        .from('drawing_sheets')
        .select('*')
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
        .insert({
          org_id:      orgId,
          proposal_id: proposalId,
          name:        file.name.replace(/\.[^/.]+$/, ''),
          storage_path:'pending',
          sort_order:  sheets.length,
        })
        .select().single()
      if (insertErr) throw insertErr

      const ext         = file.name.split('.').pop()
      const storagePath = `${orgId}/${proposalId}/${sheet.id}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('floor-plans')
        .upload(storagePath, file, { upsert: false })
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

  const handleDeleteSheet = async (sheetId) => {
    if (!window.confirm('Delete this floor plan and all device placements on it?')) return
    try {
      const sheet = sheets.find(s => s.id === sheetId)
      await supabase.from('drawing_sheets').delete().eq('id', sheetId)
      if (sheet?.storage_path && sheet.storage_path !== 'pending') {
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
    await supabase.from('drawing_sheets')
      .update({ name: newName.trim() })
      .eq('id', sheetId)
    await load()
  }

  const handleFireAlarmAckConfirm = () => {
    const allChecked = Object.values(fireAlarmAck).every(Boolean)
    if (!allChecked) { alert('Please acknowledge all items before continuing.'); return }
    sessionStorage.setItem(`fire_alarm_ack_${proposalId}`, '1')
    setShowFireAlarmAck(false)
  }

  const activeSheet = sheets.find(s => s.id === activeSheetId) || null

  // ── Fire Alarm Acknowledgment Modal ────────────────────────────────────────
  if (showFireAlarmAck) {
    return (
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
            ForgePt Designer is a design aid tool only. Fire alarm designs involve life safety
            systems governed by NFPA 72 and local codes. All outputs are for estimation and
            design purposes only.
          </p>

          <div className="space-y-4 mb-6">
            {[
              { key: 'licensed',   label: 'All designs must be verified by a licensed NICET certified fire alarm technician or licensed engineer before installation.' },
              { key: 'liability',  label: 'ForgePt accepts no liability for calculation accuracy or code compliance. This tool does not certify NFPA 72 compliance.' },
              { key: 'estimates',  label: 'All calculations are estimates for design purposes only and must be independently verified before installation.' },
              { key: 'ahj',        label: 'AHJ requirements vary by jurisdiction and must be confirmed locally before submitting any drawings.' },
            ].map(item => (
              <label key={item.key} className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={fireAlarmAck[item.key]}
                  onChange={e => setFireAlarmAck(prev => ({ ...prev, [item.key]: e.target.checked }))}
                  className="mt-0.5 accent-[#C8622A] w-4 h-4 flex-shrink-0"
                />
                <span className="text-sm text-[#8A9AB0] group-hover:text-white transition-colors">
                  {item.label}
                </span>
              </label>
            ))}
          </div>

          <div className="mb-6">
            <label className="text-[#8A9AB0] text-xs mb-1 block">
              NICET Certification Number (optional)
            </label>
            <input
              type="text"
              placeholder="e.g. 123456"
              value={nicetNumber}
              onChange={e => setNicetNumber(e.target.value)}
              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex-1 px-4 py-2 bg-[#0F1C2E] text-[#8A9AB0] text-sm font-semibold rounded-lg border border-[#2a3d55] hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleFireAlarmAckConfirm}
              disabled={!Object.values(fireAlarmAck).every(Boolean)}
              className={`flex-1 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                Object.values(fireAlarmAck).every(Boolean)
                  ? 'bg-[#C8622A] text-white hover:bg-[#b5571f]'
                  : 'bg-[#2a3d55] text-[#8A9AB0] cursor-not-allowed'
              }`}
            >
              I Acknowledge &amp; Continue
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
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

  // ── Main Designer Shell ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-[#0F1C2E] overflow-hidden">

      {/* ── Top header bar ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a3d55] bg-[#1a2d45] flex-shrink-0">
        {/* Left — back button + project name */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-[#8A9AB0] hover:text-white text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
            Back to Proposal
          </button>
          <span className="text-[#2a3d55]">|</span>
          <div>
            <span className="text-white font-semibold text-sm">
              {proposal?.proposal_name || proposal?.company || 'Designer'}
            </span>
            {proposal?.company && proposal?.proposal_name && (
              <span className="text-[#8A9AB0] text-xs ml-2">{proposal.company}</span>
            )}
          </div>
        </div>

        {/* Center — ForgePt Designer branding */}
        <div className="flex items-center gap-2">
          <span className="text-[#C8622A] text-lg">📐</span>
          <span className="text-white font-bold text-sm">ForgePt Designer</span>
        </div>

        {/* Right — actions */}
        <div className="flex items-center gap-2">
          {/* Fire alarm disclaimer badge */}
          {proposal?.industry === 'fire_alarm' && (
            <span className="text-xs bg-yellow-900/40 text-yellow-400 border border-yellow-800/40 px-2 py-1 rounded-lg">
              ⚠ Design Aid Only — Verify with NICET
            </span>
          )}
          {/* More actions coming in Bundle 6 */}
          <button className="px-3 py-1.5 bg-[#2a3d55] text-[#8A9AB0] text-xs font-medium rounded-lg hover:text-white transition-colors cursor-not-allowed opacity-50" disabled>
            Export (Bundle 6)
          </button>
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
      <div className="flex items-center gap-1 px-4 py-2 border-b border-[#2a3d55] bg-[#0F1C2E] overflow-x-auto flex-shrink-0">
        {sheets.map(sheet => (
          <SheetTab
            key={sheet.id}
            sheet={sheet}
            isActive={sheet.id === activeSheetId}
            onSelect={() => setActiveSheetId(sheet.id)}
            onRename={(name) => handleRenameSheet(sheet.id, name)}
            onDelete={() => handleDeleteSheet(sheet.id)}
          />
        ))}

        {/* Upload new sheet */}
        <label className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-dashed border-[#2a3d55] text-[#8A9AB0] hover:border-[#C8622A] hover:text-[#C8622A] cursor-pointer transition-colors whitespace-nowrap ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
          {uploading
            ? <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Uploading...</>
            : <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>Add Floor Plan</>
          }
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>

        {/* Blank canvas option */}
        <button
          onClick={async () => {
            const { data: sheet } = await supabase.from('drawing_sheets')
              .insert({ org_id: orgId, proposal_id: proposalId, name: `Floor ${sheets.length + 1}`, storage_path: 'blank', sort_order: sheets.length })
              .select().single()
            await load()
            if (sheet) setActiveSheetId(sheet.id)
          }}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-dashed border-[#2a3d55] text-[#8A9AB0] hover:border-[#C8622A] hover:text-[#C8622A] transition-colors whitespace-nowrap"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          Blank Canvas
        </button>
      </div>

      {/* ── Main canvas area — placeholder until Bundle 2 ── */}
      <div className="flex-1 overflow-hidden flex">
        {sheets.length === 0 ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-12 text-center">
            <div className="w-20 h-20 rounded-2xl bg-[#1a2d45] flex items-center justify-center">
              <span className="text-4xl">📐</span>
            </div>
            <div>
              <p className="text-white text-lg font-semibold">Start your floor plan</p>
              <p className="text-[#8A9AB0] text-sm mt-2 max-w-sm">
                Upload a floor plan PDF or image, use a satellite map view,
                or start with a blank canvas.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="px-5 py-2.5 bg-[#C8622A] text-white text-sm font-semibold rounded-lg hover:bg-[#b5571f] cursor-pointer transition-colors">
                📄 Upload Floor Plan
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
              <button
                onClick={async () => {
                  const { data: sheet } = await supabase.from('drawing_sheets')
                    .insert({ org_id: orgId, proposal_id: proposalId, name: 'Floor 1', storage_path: 'blank', sort_order: 0 })
                    .select().single()
                  await load()
                  if (sheet) setActiveSheetId(sheet.id)
                }}
                className="px-5 py-2.5 bg-[#1a2d45] text-white text-sm font-semibold rounded-lg border border-[#2a3d55] hover:border-[#C8622A] transition-colors"
              >
                🗒 Blank Canvas
              </button>
              <button
                disabled
                className="px-5 py-2.5 bg-[#1a2d45] text-[#8A9AB0] text-sm font-semibold rounded-lg border border-[#2a3d55] opacity-50 cursor-not-allowed"
              >
                🗺 Map View (Bundle 2)
              </button>
            </div>
          </div>
        ) : activeSheet ? (
          /* Canvas placeholder — Bundle 2 builds this out */
          <div className="flex-1 flex flex-col items-center justify-center bg-[#060f1c] text-center p-8">
            <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-2xl p-8 max-w-md">
              <p className="text-[#C8622A] text-4xl mb-4">🚧</p>
              <p className="text-white font-bold text-lg mb-2">Canvas Coming in Bundle 2</p>
              <p className="text-[#8A9AB0] text-sm mb-4">
                Sheet <strong className="text-white">"{activeSheet.name}"</strong> is ready.
                The interactive canvas with device placement, symbol picker, and drawing tools
                will be built in Bundle 2.
              </p>
              <div className="text-xs text-[#8A9AB0] space-y-1 text-left bg-[#0F1C2E] rounded-lg p-4">
                <p className="font-semibold text-white mb-2">Bundle 2 includes:</p>
                <p>✓ Konva canvas with zoom/pan</p>
                <p>✓ Symbol picker sidebar</p>
                <p>✓ Click to place devices</p>
                <p>✓ Map view (Mapbox)</p>
                <p>✓ Real-time collaboration</p>
                <p>✓ AI drawing reader</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
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
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors whitespace-nowrap group ${
        isActive
          ? 'bg-[#C8622A]/20 text-[#C8622A] border border-[#C8622A]/40'
          : 'text-[#8A9AB0] hover:bg-[#1a2d45] border border-transparent'
      }`}
    >
      {editing ? (
        <input autoFocus value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { onRename(name); setEditing(false) }}
          onClick={e => e.stopPropagation()}
          className="w-24 text-xs border-b border-[#C8622A] outline-none bg-transparent text-white"
        />
      ) : (
        <>
          <span onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}>{sheet.name}</span>
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true) }}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-[#8A9AB0] hover:text-white ml-1"
            title="Rename sheet"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </button>
        </>
      )}
      <span className={`px-1.5 py-0.5 rounded text-xs ${statusColor}`}>{sheet.status}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-[#8A9AB0] hover:text-red-400"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
  )
}