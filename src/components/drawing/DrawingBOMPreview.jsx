import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'

const CABLE_TYPES = [
  'Cat6', 'Cat6A', 'Cat5e', 'Fiber SM', 'Fiber MM',
  'Coax RG59', 'Coax RG6', 'Speaker 16/2', 'Speaker 14/2',
  '18/2', '22/4', '22/6', 'Composite', 'HDMI', 'HDBaseT',
  'Power', 'Plenum Cat6', 'Plenum 22/4'
]

export default function DrawingBOMPreview({ proposalId, orgId, sheets, refreshKey }) {
  const [rows,          setRows]          = useState([])
  const [cableRuns,     setCableRuns]     = useState([])
  const [verticalRises, setVerticalRises] = useState([])
  const [components,    setComponents]    = useState([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(null)
  const [laborEnabled,  setLaborEnabled]  = useState(false)
  const [laborSummary,  setLaborSummary]  = useState([]) // [{role, totalHrs}]
  const [showRiseModal, setShowRiseModal] = useState(false)
  const [riseForm,      setRiseForm]      = useState({
    from_sheet_id: '',
    to_sheet_id:   '',
    label:         '',
    cable_type:    'Cat6',
    rise_height:   '',
    quantity:      1,
    waste_factor:  10,
  })

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (!sheets.length) { setRows([]); setLoading(false); return }
      const sheetIds = sheets.map(s => s.id)

      // Load device placements
      const { data: placements, error: placementErr } = await supabase
        .from('drawing_placements')
        .select('id, quantity, drawing_sheet_id, part_number_override, manufacturer_override, model_number_override, description_override, labor_overrides, global_products(id, name, part_number, model_number, manufacturer, category)')
        .in('drawing_sheet_id', sheetIds)
      if (placementErr) throw placementErr

      // Load cable runs
      const { data: runs } = await supabase
        .from('cable_runs')
        .select('*')
        .in('drawing_sheet_id', sheetIds)
        .order('cable_type')

      // Load placement components
      const { data: rawComponents } = await supabase
        .from('placement_components')
        .select('*, drawing_placements!inner(drawing_sheet_id)')
        .in('drawing_placements.drawing_sheet_id', sheetIds)

      // Aggregate components by type+name+part_number
      const compMap = Object.create(null)
      ;(rawComponents || []).forEach(c => {
        const key = `${c.component_type}|${c.name || ''}|${c.part_number || ''}`
        if (!compMap[key]) compMap[key] = { ...c, quantity: 0 }
        compMap[key].quantity += c.quantity || 1
      })
      const components = Object.values(compMap)

      // Load vertical rises
      const { data: rises } = await supabase
        .from('vertical_rises')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('created_at')

      // Group placements by part number
      const grouped = Object.create(null)
      ;(placements || []).forEach(p => {
       const gp           = p.global_products
        const partNumber   = p.part_number_override   || gp.part_number
        const name         = p.description_override   || p.model_number_override || gp.name
        const manufacturer = p.manufacturer_override  || gp.manufacturer
        const key          = partNumber
        if (!grouped[key]) {
          grouped[key] = {
            part_number:  partNumber,
            model_number: p.model_number_override || gp.model_number,
            name,
            manufacturer,
            category:     gp.category,
            unit_price:   null,
            has_pricing:  false,
            total_qty:    0,
            by_floor:     {},
          }
        }
        grouped[key].total_qty += p.quantity
        grouped[key].by_floor[p.drawing_sheet_id] = (grouped[key].by_floor[p.drawing_sheet_id] || 0) + p.quantity
      })

      // Load rack items, enclosures, and accessories via rooms chain
      const { data: roomsForBOM } = await supabase
        .from('rooms').select('id').eq('proposal_id', proposalId)
      if (roomsForBOM?.length) {
        const roomIds = roomsForBOM.map(r => r.id)
        const { data: racksForBOM } = await supabase
          .from('racks').select('id, name, part_number, manufacturer, model').in('room_id', roomIds)
        if (racksForBOM?.length) {
          const rackIds = racksForBOM.map(r => r.id)
          const [{ data: rackItemsList }, { data: rackCompsList }] = await Promise.all([
            supabase.from('rack_items')
              .select('id, label, manufacturer, model, part_number, category, quantity, global_products(id, name, part_number, manufacturer, category)')
              .in('rack_id', rackIds),
            supabase.from('rack_components')
              .select('id, component_type, name, part_number, manufacturer, quantity')
              .in('rack_id', rackIds),
          ])
          // Rack enclosures (the physical cabinet)
          racksForBOM.forEach(rack => {
            if (!rack.part_number) return
            if (!grouped[rack.part_number]) {
              grouped[rack.part_number] = {
                part_number: rack.part_number, model_number: rack.model || null,
                name: rack.name || 'Rack', manufacturer: rack.manufacturer || '',
                category: 'Rack', unit_price: null, has_pricing: false, total_qty: 0, by_floor: {},
              }
            }
            grouped[rack.part_number].total_qty += 1
          })
          // Devices in U slots
          ;(rackItemsList || []).forEach(ri => {
            const gp = ri.global_products
            const partNumber   = ri.part_number || gp?.part_number || `ri-${ri.id}`
            const name         = ri.label || gp?.name || ri.model || 'Unknown Device'
            const manufacturer = ri.manufacturer || gp?.manufacturer || ''
            const category     = ri.category || gp?.category || 'Rack Equipment'
            if (!grouped[partNumber]) {
              grouped[partNumber] = {
                part_number: partNumber, model_number: ri.model || null,
                name, manufacturer, category, unit_price: null, has_pricing: false, total_qty: 0, by_floor: {},
              }
            }
            grouped[partNumber].total_qty += ri.quantity || 1
          })
          // Rack accessories (cable management, patch cords, blank panels, etc.)
          ;(rackCompsList || []).forEach(rc => {
            const partNumber = rc.part_number || `rc-${rc.id}`
            const name       = rc.name || rc.component_type || 'Rack Accessory'
            if (!grouped[partNumber]) {
              grouped[partNumber] = {
                part_number: partNumber, model_number: null,
                name, manufacturer: rc.manufacturer || '', category: rc.component_type || 'Rack Accessory',
                unit_price: null, has_pricing: false, total_qty: 0, by_floor: {},
              }
            }
            grouped[partNumber].total_qty += rc.quantity || 1
          })
        }
      }

      const sorted = Object.values(grouped).sort((a, b) => {
        if (a.manufacturer !== b.manufacturer) return a.manufacturer.localeCompare(b.manufacturer)
        if (a.category !== b.category) return a.category.localeCompare(b.category)
        return a.name.localeCompare(b.name)
      })

      setRows(sorted)
      setCableRuns(runs || [])
      setVerticalRises(rises || [])
      setComponents(components)

      // Load labor settings and compute summary
      const [{ data: org }, { data: defaults }] = await Promise.all([
        supabase.from('organizations').select('designer_labor_enabled').eq('id', orgId).single(),
        supabase.from('designer_labor_defaults').select('category, labor_role, hours_per_unit').eq('org_id', orgId),
      ])
      const enabled = org?.designer_labor_enabled ?? false
      setLaborEnabled(enabled)
      if (enabled && defaults?.length) {
        const byRole = Object.create(null)
        ;(placements || []).forEach(p => {
          const cat      = p.global_products?.category
          const defs     = defaults.filter(d => d.category === cat)
          const qty      = p.quantity ?? 1
          const overrides = p.labor_overrides || {}
          defs.forEach(def => {
            if (!def.labor_role) return
            const hrs = (parseFloat(overrides[def.labor_role] ?? def.hours_per_unit ?? 1)) * qty
            byRole[def.labor_role] = (byRole[def.labor_role] || 0) + hrs
          })
        })
        setLaborSummary(Object.entries(byRole).map(([role, hrs]) => ({ role, totalHrs: Math.round(hrs * 100) / 100 })))
      } else {
        setLaborSummary([])
      }
    } catch (err) {
      setError('Failed to load BOM preview.')
      console.error(err)
    } finally { setLoading(false) }
  }, [sheets, proposalId])

  useEffect(() => { loadAll() }, [loadAll, refreshKey])

  // ── Aggregate cable runs by type ──────────────────────────────────────────
  const cableByType = Object.create(null)
  cableRuns.forEach(run => {
    const type = run.cable_type || 'Unknown'
    if (!cableByType[type]) cableByType[type] = { footage: 0, total_footage: 0, runs: 0 }
    cableByType[type].footage       += run.footage       || 0
    cableByType[type].total_footage += run.total_footage || 0
    cableByType[type].runs          += 1
  })

  // Add vertical rises to cable totals
  verticalRises.forEach(rise => {
    const type = rise.cable_type || 'Unknown'
    if (!cableByType[type]) cableByType[type] = { footage: 0, total_footage: 0, runs: 0 }
    cableByType[type].footage       += rise.footage       || 0
    cableByType[type].total_footage += rise.total_footage || 0
  })

  const totalCableFootage = Object.values(cableByType).reduce((s, c) => s + c.total_footage, 0)

  // ── Add vertical rise ──────────────────────────────────────────────────────
  const handleAddRise = async () => {
    if (!riseForm.rise_height) { alert('Please enter a rise height.'); return }
    const footage      = parseFloat(riseForm.rise_height) * parseInt(riseForm.quantity)
    const totalFootage = Math.round(footage * (1 + riseForm.waste_factor / 100))

    const { error } = await supabase.from('vertical_rises').insert({
      org_id:         orgId,
      proposal_id:    proposalId,
      from_sheet_id:  riseForm.from_sheet_id || null,
      to_sheet_id:    riseForm.to_sheet_id   || null,
      label:          riseForm.label         || null,
      cable_type:     riseForm.cable_type,
      rise_height:    parseFloat(riseForm.rise_height),
      quantity:       parseInt(riseForm.quantity),
      waste_factor:   parseFloat(riseForm.waste_factor),
      footage,
      total_footage:  totalFootage,
    })

    if (!error) {
      setShowRiseModal(false)
      setRiseForm({ from_sheet_id: '', to_sheet_id: '', label: '', cable_type: 'Cat6', rise_height: '', quantity: 1, waste_factor: 10 })
      loadAll()
    }
  }

  const handleDeleteRise = async (id) => {
    if (!window.confirm('Delete this vertical rise?')) return
    await supabase.from('vertical_rises').delete().eq('id', id)
    loadAll()
  }

  const totalItems    = rows.reduce((s, r) => s + r.total_qty, 0)
  const totalPrice    = rows.reduce((s, r) => r.unit_price ? s + r.unit_price * r.total_qty : s, 0)
  const missingPrices = rows.filter(r => !r.has_pricing).length

  const inputClass = "bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#C8622A] w-full"

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-sm text-[#8A9AB0]">
      <svg className="w-5 h-5 animate-spin mr-2 text-[#C8622A]" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
      Loading BOM preview...
    </div>
  )

  if (error) return <div className="flex items-center justify-center py-16 text-sm text-red-400">{error}</div>

  return (
    <div className="flex flex-col">

      {/* Summary bar */}
      <div className="flex items-center gap-6 px-4 py-3 border-b border-[#2a3d55] bg-[#1a2d45] text-xs flex-wrap">
        <div><span className="text-[#8A9AB0]">Devices</span><span className="ml-2 font-semibold text-white">{totalItems}</span></div>
        <div><span className="text-[#8A9AB0]">Unique SKUs</span><span className="ml-2 font-semibold text-white">{rows.length}</span></div>
        <div><span className="text-[#8A9AB0]">Cable runs</span><span className="ml-2 font-semibold text-white">{cableRuns.length}</span></div>
        <div><span className="text-[#8A9AB0]">Total cable</span><span className="ml-2 font-semibold text-[#C8622A]">{Math.round(totalCableFootage)}ft</span></div>
        
      </div>

      {/* Multi-sheet note */}
      {sheets.length > 1 && (
        <div className="px-4 py-2 bg-[#C8622A]/10 border-b border-[#C8622A]/20 text-xs text-[#C8622A]">
          Aggregated across {sheets.length} sheets
        </div>
      )}
      {/* ── Device BOM Table ── */}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <div className="px-4 py-2 bg-[#1a2d45] border-b border-[#2a3d55]">
            <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide">Devices & Equipment</p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#2a3d55] bg-[#1a2d45]">
                <th className="text-left px-4 py-2 font-medium text-[#8A9AB0] w-8">#</th>
                <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">Part number</th>
                <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">Name</th>
                <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">Manufacturer</th>
                <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">Category</th>
                {sheets.length > 1 && sheets.map(s => (
                <th key={s.id} className="text-center px-3 py-2 font-medium text-[#8A9AB0] whitespace-nowrap max-w-24">
                  <span title={s.name}>{s.name.length > 12 ? s.name.slice(0, 12) + '…' : s.name}</span>
                </th>
              ))}
                <th className="text-center px-4 py-2 font-medium text-[#8A9AB0]">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a3d55]/50">
              {rows.map((row, idx) => {
                const lineTotal = row.unit_price ? row.unit_price * row.total_qty : null
                return (
                  <tr key={row.part_number} className={`hover:bg-[#1a2d45]/50 transition-colors ${!row.has_pricing ? 'bg-yellow-900/10' : ''}`}>
                    <td className="px-4 py-2.5 text-[#8A9AB0]">{idx + 1}</td>
                    <td className="px-4 py-2.5 font-mono text-[#C8622A] whitespace-nowrap">{row.part_number}</td>
                    <td className="px-4 py-2.5 text-white font-medium max-w-xs">
                      <div className="truncate">{row.name}</div>
                      {row.model_number && row.model_number !== row.part_number && (
                        <div className="text-[#8A9AB0] font-normal">{row.model_number}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[#8A9AB0] whitespace-nowrap">{row.manufacturer}</td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded-full bg-[#2a3d55] text-[#8A9AB0] whitespace-nowrap">{row.category}</span>
                    </td>
                    {sheets.length > 1 && sheets.map(s => (
                      <td key={s.id} className="text-center px-3 py-2.5 text-[#8A9AB0]">{row.by_floor[s.id] || '—'}</td>
                    ))}
                    <td className="text-center px-4 py-2.5 font-semibold text-white">{row.total_qty}</td>
                    
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#2a3d55] bg-[#1a2d45] font-semibold">
                <td colSpan={sheets.length > 1 ? 5 + sheets.length : 5} className="px-4 py-2.5 text-[#8A9AB0] text-right">Total devices</td>
                <td className="text-center px-4 py-2.5 text-white">{totalItems}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {rows.some(r => r.manufacturer === 'Generic') && (
        <div className="px-4 py-2 bg-yellow-900/20 border-b border-yellow-800/30 text-xs text-yellow-400 flex items-center gap-2">
          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          Some devices are using generic symbols. Click each device on the canvas and fill in the real part number, manufacturer and model in the edit panel before approving.
        </div>
      )}

      {rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center gap-2 border-b border-[#2a3d55]">
          <p className="text-sm font-medium text-white">No devices placed yet</p>
          <p className="text-xs text-[#8A9AB0]">Switch to the Drawing tab and start placing devices</p>
        </div>
      )}

      {/* ── Components / Hardware ── */}
      {components.length > 0 && (
        <div className="border-t border-[#2a3d55]">
          <div className="px-4 py-2 bg-[#1a2d45] border-b border-[#2a3d55]">
            <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide">Components & Hardware</p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#2a3d55] bg-[#1a2d45]">
                <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">Type</th>
                <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">Name / Part #</th>
                <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">Manufacturer</th>
                <th className="text-center px-4 py-2 font-medium text-[#8A9AB0]">Qty</th>
                <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a3d55]/50">
              {components.map(c => (
                <tr key={c.id} className="hover:bg-[#1a2d45]/50">
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded-full bg-[#2a3d55] text-[#8A9AB0] text-xs">{c.component_type}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="text-white">{c.name || c.component_type}</div>
                    {c.part_number && <div className="text-[#C8622A] font-mono text-xs">{c.part_number}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-[#8A9AB0]">{c.manufacturer || '—'}</td>
                  <td className="text-center px-4 py-2.5 text-white font-semibold">{c.quantity}</td>
                  <td className="px-4 py-2.5 text-[#8A9AB0]">{c.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Cable Runs Summary ── */}
      <div className="border-t border-[#2a3d55]">
        <div className="px-4 py-2 bg-[#1a2d45] border-b border-[#2a3d55]">
          <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide">Cable Summary</p>
        </div>

        {Object.keys(cableByType).length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-[#8A9AB0]">
            No cable runs drawn yet. Use cable mode on the canvas to draw runs.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#2a3d55] bg-[#1a2d45]">
                <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">Cable Type</th>
                <th className="text-center px-4 py-2 font-medium text-[#8A9AB0]">Runs</th>
                <th className="text-right px-4 py-2 font-medium text-[#8A9AB0]">Measured</th>
                <th className="text-right px-4 py-2 font-medium text-[#8A9AB0]">With Waste</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a3d55]/50">
              {Object.entries(cableByType).sort(([a], [b]) => a.localeCompare(b)).map(([type, data]) => (
                <tr key={type} className="hover:bg-[#1a2d45]/50">
                  <td className="px-4 py-2.5 text-white font-medium">{type}</td>
                  <td className="text-center px-4 py-2.5 text-[#8A9AB0]">{data.runs || '—'}</td>
                  <td className="text-right px-4 py-2.5 text-[#8A9AB0] font-mono">{Math.round(data.footage)}ft</td>
                  <td className="text-right px-4 py-2.5 text-[#C8622A] font-bold font-mono">{Math.round(data.total_footage)}ft</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#2a3d55] bg-[#1a2d45] font-semibold">
                <td colSpan={3} className="px-4 py-2.5 text-[#8A9AB0] text-right">Total cable (with waste)</td>
                <td className="text-right px-4 py-2.5 text-[#C8622A] font-mono">{Math.round(totalCableFootage)}ft</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* ── Vertical Rises ── */}
      <div className="border-t border-[#2a3d55]">
        <div className="flex items-center justify-between px-4 py-2 bg-[#1a2d45] border-b border-[#2a3d55]">
          <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide">Vertical Rises / Cross-Sheet Runs</p>
          <button onClick={() => setShowRiseModal(true)}
            className="flex items-center gap-1 text-xs text-[#C8622A] hover:text-white transition-colors">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Add Rise
          </button>
        </div>

        {verticalRises.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-[#8A9AB0]">
            No vertical rises added. Use "Add Rise" to account for cable between sheets or sections.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#2a3d55] bg-[#1a2d45]">
                <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">From</th>
                <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">To</th>
                <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">Label</th>
                <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">Cable</th>
                <th className="text-center px-4 py-2 font-medium text-[#8A9AB0]">Height</th>
                <th className="text-center px-4 py-2 font-medium text-[#8A9AB0]">Qty</th>
                <th className="text-right px-4 py-2 font-medium text-[#8A9AB0]">Total</th>
                <th className="px-4 py-2"/>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a3d55]/50">
              {verticalRises.map(rise => {
                const fromSheet = sheets.find(s => s.id === rise.from_sheet_id)
                const toSheet   = sheets.find(s => s.id === rise.to_sheet_id)
                return (
                  <tr key={rise.id} className="hover:bg-[#1a2d45]/50">
                    <td className="px-4 py-2.5 text-[#8A9AB0]">{fromSheet?.name || '—'}</td>
                    <td className="px-4 py-2.5 text-[#8A9AB0]">{toSheet?.name || '—'}</td>
                    <td className="px-4 py-2.5 text-white">{rise.label || '—'}</td>
                    <td className="px-4 py-2.5 text-[#8A9AB0]">{rise.cable_type}</td>
                    <td className="text-center px-4 py-2.5 text-[#8A9AB0] font-mono">{rise.rise_height}ft</td>
                    <td className="text-center px-4 py-2.5 text-[#8A9AB0]">{rise.quantity}</td>
                    <td className="text-right px-4 py-2.5 text-[#C8622A] font-bold font-mono">{Math.round(rise.total_footage)}ft</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => handleDeleteRise(rise.id)}
                        className="text-[#8A9AB0] hover:text-red-400 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

    

      {/* ── Labor Summary ── */}
      {laborEnabled && laborSummary.length > 0 && (
        <div className="border-t border-[#2a3d55]">
          <div className="px-4 py-2 bg-[#1a2d45] border-b border-[#2a3d55]">
            <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide">Estimated Labor</p>
            <p className="text-[#4a5a6a] text-xs mt-0.5">Hours only — rates applied when pushed to proposal</p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#2a3d55] bg-[#1a2d45]">
                <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">Role</th>
                <th className="text-right px-4 py-2 font-medium text-[#8A9AB0]">Total Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a3d55]/50">
              {laborSummary.map(row => (
                <tr key={row.role} className="hover:bg-[#1a2d45]/50">
                  <td className="px-4 py-2.5 text-white font-medium">{row.role}</td>
                  <td className="text-right px-4 py-2.5 text-[#C8622A] font-bold font-mono">{row.totalHrs}h</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#2a3d55] bg-[#1a2d45] font-semibold">
                <td className="px-4 py-2.5 text-[#8A9AB0] text-right">Total labor hours</td>
                <td className="text-right px-4 py-2.5 text-[#C8622A] font-mono">
                  {laborSummary.reduce((s, r) => s + r.totalHrs, 0).toFixed(2)}h
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Add Vertical Rise Modal ── */}
      {showRiseModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-6 w-96 shadow-2xl">
            <h3 className="text-white font-bold text-base mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-[#C8622A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18"/>
              </svg>
              Add Vertical Rise
            </h3>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">From sheet</label>
                  <select value={riseForm.from_sheet_id}
                    onChange={e => setRiseForm(prev => ({ ...prev, from_sheet_id: e.target.value }))}
                    className={inputClass}>
                    <option value="">— Any —</option>
                    {sheets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">To sheet</label>
                  <select value={riseForm.to_sheet_id}
                    onChange={e => setRiseForm(prev => ({ ...prev, to_sheet_id: e.target.value }))}
                    className={inputClass}>
                    <option value="">— Any —</option>
                    {sheets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    <option value="external">External</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Label / description</label>
                <input type="text" placeholder="e.g. Camera 001 → IDF-1, Section A → MDF"
                  value={riseForm.label}
                  onChange={e => setRiseForm(prev => ({ ...prev, label: e.target.value }))}
                  className={inputClass} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Cable type</label>
                  <select value={riseForm.cable_type}
                    onChange={e => setRiseForm(prev => ({ ...prev, cable_type: e.target.value }))}
                    className={inputClass}>
                    {CABLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Quantity</label>
                  <input type="number" min="1" value={riseForm.quantity}
                    onChange={e => setRiseForm(prev => ({ ...prev, quantity: e.target.value }))}
                    className={inputClass} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Rise height (ft)</label>
                  <input type="number" min="1" placeholder="14"
                    value={riseForm.rise_height}
                    onChange={e => setRiseForm(prev => ({ ...prev, rise_height: e.target.value }))}
                    className={inputClass} />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Waste factor (%)</label>
                  <input type="number" min="0" max="30" value={riseForm.waste_factor}
                    onChange={e => setRiseForm(prev => ({ ...prev, waste_factor: e.target.value }))}
                    className={inputClass} />
                </div>
              </div>

              {/* Live calculation */}
              {riseForm.rise_height && (
                <div className="bg-[#0F1C2E] rounded-lg p-3 border border-[#2a3d55] space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#8A9AB0]">{riseForm.quantity} run{riseForm.quantity > 1 ? 's' : ''} × {riseForm.rise_height}ft</span>
                    <span className="text-white font-mono">{parseFloat(riseForm.rise_height) * parseInt(riseForm.quantity)}ft</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#8A9AB0]">Waste ({riseForm.waste_factor}%)</span>
                    <span className="text-white font-mono">+{Math.round(parseFloat(riseForm.rise_height) * parseInt(riseForm.quantity) * riseForm.waste_factor / 100)}ft</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-[#2a3d55] pt-1">
                    <span className="text-[#8A9AB0] font-semibold">Total {riseForm.cable_type}</span>
                    <span className="text-[#C8622A] font-bold font-mono">
                      {Math.round(parseFloat(riseForm.rise_height) * parseInt(riseForm.quantity) * (1 + riseForm.waste_factor / 100))}ft
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowRiseModal(false)}
                className="flex-1 py-2 text-sm font-medium rounded-lg border border-[#2a3d55] text-[#8A9AB0] hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={handleAddRise}
                className="flex-1 py-2 text-sm font-semibold rounded-lg bg-[#C8622A] text-white hover:bg-[#b5571f] transition-colors">
                Add to Drawing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}