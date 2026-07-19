import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabase'
import ComponentsSection from './ComponentsSection'

// Categories that act as power sources (provide PoE / power to other devices)
const POE_SOURCE_CATEGORIES = ['Network', 'Network Switch', 'Switch', 'NVR', 'UPS', 'Panel', 'Controller', 'Rack', 'Power Supply']

const CAMERA_CATEGORIES = ['Dome Camera', 'Bullet Camera', 'PTZ Camera', 'Multi-Lens Camera', 'Fisheye Camera']

const SENSOR_WIDTHS = {
  '1/4"': 3.68,
  '1/3"': 4.80,
  '1/2.8"': 5.37,
  '1/2"': 6.40,
  '1/1.8"': 7.18,
  '2/3"': 8.80,
  '1"': 13.20,
}

const DORI_THRESHOLDS = [
  { label: 'Detection',      ppm: 25,  color: 'bg-green-400'  },
  { label: 'Observation',    ppm: 62,  color: 'bg-blue-400'   },
  { label: 'Recognition',    ppm: 125, color: 'bg-yellow-400' },
  { label: 'Identification', ppm: 250, color: 'bg-red-400'    },
]

function guessMp(product) {
  const text = `${product.name || ''} ${product.description || ''}`.toLowerCase()
  const match = text.match(/(\d+(?:\.\d+)?)\s*mp\b/)
  return match ? String(parseFloat(match[1])) : '2'
}

function mpToResH(mp) {
  const n = parseFloat(mp)
  if (!n || n <= 0) return null
  return Math.round(Math.sqrt(n * 1_000_000 * 16 / 9))
}

export default function PlacementPanel({ placement, onClose, onUpdate, onSaved, sheets, currentSheetId, proposalId, allSheetIds, laborEnabled = false, laborDefaults = [], sheetPlacements = [] }) {
  const [attachedRun,      setAttachedRun]      = useState(null)

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

  const isPowerSource = POE_SOURCE_CATEGORIES.includes(product.category) ||
    product.category?.toLowerCase().includes('switch') ||
    product.category?.toLowerCase().includes('network') ||
    product.name?.toLowerCase().includes('switch')

  // Derived from live sheetPlacements prop — always in sync with the canvas
  const sheetSwitches = sheetPlacements.filter(p => {
    if (p.id === placement.id) return false
    const cat  = p.global_products?.category?.toLowerCase() || ''
    const name = p.global_products?.name?.toLowerCase() || ''
    return POE_SOURCE_CATEGORIES.some(c => c.toLowerCase() === cat) ||
      cat.includes('switch') || cat.includes('network') ||
      name.includes('switch') || name.includes('nvr') || name.includes('ups')
  })

  // For power sources: which placements on the sheet claim this as their switch
  const connectedDevicesDerived = isPowerSource
    ? sheetPlacements.filter(p => p.switch_placement_id === placement.id)
    : []

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
    labor_overrides:        p.labor_overrides        || {},
    switch_placement_id:    p.switch_placement_id    || '',
    watts_override:         p.watts_override         || '',
  })

  const [form, setForm] = useState(() => getInitialForm(placement))

  // When the canvas commits a FOV drag, sync those fields back without resetting the whole form.
  // Also patch formRef immediately so any pending auto-save timer reads the correct values
  // instead of the stale snapshot captured in its closure.
  useEffect(() => {
    const patch = {
      rotation:  placement.rotation  ?? 0,
      fov_angle: placement.fov_angle ?? null,
      fov_range: placement.fov_range ?? null,
    }
    formRef.current = { ...formRef.current, ...patch }
    setForm(prev => ({ ...prev, ...patch }))
    if (placement.fov_angle) setDoriHfov(String(placement.fov_angle))
  }, [placement.rotation, placement.fov_angle, placement.fov_range])

  useEffect(() => {
    setForm(getInitialForm(placement))
    setShowAsBuilt(false)
    setBulkDone(false)
    // Count similar devices
    const countSimilar = async () => {
      const [{ data, count }, { data: compData }] = await Promise.all([
        supabase
          .from('drawing_placements')
          .select('id, device_address, drawing_sheet_id, part_number_override, description_override', { count: 'exact' })
          .in('drawing_sheet_id', allSheetIds || [placement.drawing_sheet_id])
          .eq('global_product_id', placement.global_product_id)
          .neq('id', placement.id),
        supabase
          .from('placement_components')
          .select('*')
          .eq('placement_id', placement.id)
          .order('created_at'),
      ])
      setBulkCount(count || 0)
      setSimilarDevices(data || [])
      setBulkSelected(new Set((data || []).map(d => d.id)))
      setSourceComponents(compData || [])
    }
    countSimilar()
  }, [placement.id])

  const [saved,  setSaved]            = useState(false)
  const [showAsBuilt,    setShowAsBuilt]    = useState(false)
  const [showBulkModal,  setShowBulkModal]  = useState(false)
  const [bulkCount,      setBulkCount]      = useState(0)
  const [bulkScope,      setBulkScope]      = useState('all') // 'all' | 'sheet' | 'generic'
  const [bulkApplying,   setBulkApplying]   = useState(false)
  const [bulkDone,       setBulkDone]       = useState(false)
  const [similarDevices,    setSimilarDevices]    = useState([])
  const [bulkSelected,      setBulkSelected]      = useState(new Set())
  const [includeComponents, setIncludeComponents] = useState(true)
  const [sourceComponents,  setSourceComponents]  = useState([])
  const saveTimer = useRef(null)
  const formRef   = useRef(form)
  useEffect(() => { formRef.current = form }, [form])

  const [activeTab, setActiveTab] = useState('properties') // 'properties' | 'dori'

  // DORI calculator local state (not persisted)
  const [doriMode,   setDoriMode]   = useState('hfov') // 'hfov' | 'focal'
  const [doriHfov,   setDoriHfov]   = useState(() => String(placement.fov_angle ?? product.specs?.fov_angle ?? ''))
  const [doriMp,   setDoriMp]     = useState(() => guessMp(product))
  const [doriFocal,  setDoriFocal]  = useState('')
  const [doriSensor, setDoriSensor] = useState('1/3"')

  // Re-seed when the user selects a different device
  useEffect(() => {
    setActiveTab('properties')
    setDoriHfov(String(placement.fov_angle ?? product.specs?.fov_angle ?? ''))
    setDoriMp(guessMp(product))
    setDoriFocal('')
  }, [placement.id])

  // Only these fields have visible impact on the canvas marker — all others are text-only
  const VISUAL_FIELDS = new Set(['symbol_size', 'rotation', 'marker_color', 'fov_angle', 'fov_range', 'device_address'])

  const update = (field, value) => {
    const updated = { ...form, [field]: value }
    setForm(updated)
    if (VISUAL_FIELDS.has(field)) onUpdate?.({ ...placement, ...updated })

    // Debounced auto-save — reads from formRef so it always saves the latest values,
    // even if the canvas (commitFOV) updated rotation/fov fields after this timer was set.
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const f = formRef.current
      const { error } = await supabase.from('drawing_placements').update({
        device_address:        f.device_address        || null,
        part_number_override:  f.part_number_override  || null,
        manufacturer_override: f.manufacturer_override || null,
        description_override:  f.description_override  || null,
        notes:                 f.notes                 || null,
        quantity:              parseInt(f.quantity)    || 1,
        symbol_size:           parseInt(f.symbol_size) || 32,
          rotation:              parseInt(f.rotation) || 0,
          marker_color:          f.marker_color || '#C8622A',
          runs_to_sheet_id:      f.runs_to_sheet_id || null,
          runs_to_label:         f.runs_to_label || null,
          rise_height:           f.rise_height ? parseFloat(f.rise_height) : null,
          rise_cable_type:       f.rise_cable_type || null,
          fov_angle:             f.fov_angle ? parseInt(f.fov_angle) : null,
          fov_range:             f.fov_range ? parseInt(f.fov_range) : null,
        serial_number:         f.serial_number         || null,
        ip_address:            f.ip_address            || null,
        mac_address:           f.mac_address           || null,
        switch_name:           f.switch_name           || null,
        switch_port:           f.switch_port           || null,
        patch_panel_label:     f.patch_panel_label     || null,
        labor_overrides: Object.keys(f.labor_overrides || {}).length > 0 ? f.labor_overrides : null,
        switch_placement_id:   f.switch_placement_id   || null,
        watts_override:        f.watts_override ? parseFloat(f.watts_override) : null,
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

      {/* Tab bar — cameras only */}
      {CAMERA_CATEGORIES.includes(product.category) && (
        <div className="flex border-b border-[#2a3d55] flex-shrink-0">
          {[['properties', 'Properties'], ['dori', 'DORI']].map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition-colors border-b-2 ${
                activeTab === id
                  ? 'text-[#C8622A] border-[#C8622A]'
                  : 'text-[#8A9AB0] border-transparent hover:text-white'
              }`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable fields */}
      <div className={`flex-1 overflow-y-auto p-3 space-y-3 ${activeTab === 'dori' ? 'hidden' : ''}`}>

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
            {/* Apply to similar */}
            {bulkCount > 0 && (
              <div className="border-t border-[#2a3d55] pt-3">
                {bulkDone ? (
                  <div className="flex items-center gap-2 text-xs text-green-400">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                    </svg>
                    Applied to similar devices
                  </div>
                ) : (
                  <button onClick={() => setShowBulkModal(true)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-[#0F1C2E] border border-[#C8622A]/30 rounded-lg text-xs text-[#C8622A] hover:bg-[#C8622A]/10 transition-colors">
                    <span className="flex items-center gap-2">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                      </svg>
                      Apply to similar devices
                    </span>
                    <span className="bg-[#C8622A]/20 px-1.5 py-0.5 rounded font-semibold">{bulkCount}</span>
                  </button>
                )}
              </div>
            )}

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

            {/* ── Power ── */}
            <div className="border-t border-[#2a3d55] pt-3">
              {isPowerSource ? (
                /* Power source view (switch, NVR, UPS): how much it supplies vs. how much is drawn */
                (() => {
                  const supply = parseFloat(form.watts_override) || product.specs?.power_watts || 0
                  const drawn  = connectedDevicesDerived.reduce((sum, d) =>
                    sum + (d.watts_override ?? d.global_products?.specs?.power_watts ?? 0), 0)
                  const pct        = supply > 0 ? (drawn / supply) * 100 : 0
                  const overBudget = supply > 0 && drawn > supply
                  const nearBudget = pct >= 80
                  return (
                    <>
                      <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide mb-2">Power Supply</p>
                      <div className="space-y-2">
                        <div>
                          <label className={labelClass}>
                            Supply capacity (W)
                            {product.specs?.power_watts && !form.watts_override &&
                              <span className="text-[#4a5a6a] ml-1">— from product default</span>}
                          </label>
                          <input
                            type="number" step="1" min="0"
                            value={form.watts_override}
                            onChange={e => update('watts_override', e.target.value)}
                            placeholder={product.specs?.power_watts ? `${product.specs.power_watts}W` : 'e.g. 370'}
                            className={`${inputClass} w-32`}
                          />
                        </div>
                        {supply > 0 ? (
                          <>
                            <div className="flex justify-between text-xs">
                              <span className="text-[#8A9AB0]">Devices draw</span>
                              <span className={`font-mono font-semibold ${overBudget ? 'text-red-400' : nearBudget ? 'text-yellow-400' : 'text-green-400'}`}>
                                {drawn.toFixed(1)}W / {supply}W
                              </span>
                            </div>
                            <div className="w-full bg-[#2a3d55] rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full transition-all ${overBudget ? 'bg-red-400' : nearBudget ? 'bg-yellow-400' : 'bg-green-400'}`}
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                            {overBudget && (
                              <p className="text-red-400 text-xs font-medium">
                                Over capacity by {(drawn - supply).toFixed(1)}W
                              </p>
                            )}
                            <div className="text-right text-xs text-[#4a5a6a]">
                              {(supply - drawn).toFixed(1)}W available
                            </div>
                          </>
                        ) : (
                          <p className="text-[#4a5a6a] text-xs">Enter supply capacity above to track budget.</p>
                        )}
                        {connectedDevicesDerived.length > 0 ? (
                          <div className="bg-[#0F1C2E] rounded-lg border border-[#2a3d55] divide-y divide-[#2a3d55]/50">
                            {connectedDevicesDerived.map(d => (
                              <div key={d.id} className="flex justify-between px-2.5 py-1.5 text-xs">
                                <span className="text-[#8A9AB0] truncate">{d.device_address || d.global_products?.name || 'Device'}</span>
                                <span className="text-yellow-400/80 font-mono ml-2 flex-shrink-0">
                                  {(d.watts_override ?? d.global_products?.specs?.power_watts ?? 0)}W draw
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[#4a5a6a] text-xs">No devices assigned yet — open a device and set "Powered by" to this switch.</p>
                        )}
                      </div>
                    </>
                  )
                })()
              ) : (
                /* Device view (camera, reader, IoT): how much it draws + what powers it */
                <>
                  <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide mb-2">Power Draw</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#8A9AB0]">This device draws</span>
                      <span className="text-yellow-400 font-mono font-semibold">
                        {form.watts_override || product.specs?.power_watts
                          ? `${form.watts_override || product.specs?.power_watts}W`
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <label className={labelClass}>Watts draw <span className="text-[#4a5a6a]">(override product default)</span></label>
                      <input
                        type="number" step="0.1" min="0"
                        value={form.watts_override}
                        onChange={e => update('watts_override', e.target.value)}
                        placeholder={product.specs?.power_watts ? `Default: ${product.specs.power_watts}W` : 'e.g. 7.5'}
                        className={`${inputClass} w-32`}
                      />
                    </div>
                    {sheetSwitches.length > 0 && (
                      <div>
                        <label className={labelClass}>Powered by</label>
                        <select
                          value={form.switch_placement_id || ''}
                          onChange={e => update('switch_placement_id', e.target.value || null)}
                          className={inputClass}
                        >
                          <option value="">— Not assigned —</option>
                          {sheetSwitches.map(sw => (
                            <option key={sw.id} value={sw.id}>
                              {sw.device_address
                                ? `${sw.device_address} · ${sw.global_products?.name || sw.global_products?.category}`
                                : sw.global_products?.name || sw.global_products?.category || 'Switch'}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {sheetSwitches.length === 0 && (
                      <p className="text-[#4a5a6a] text-xs">Place a switch, NVR, or UPS on this sheet to assign a power source.</p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* FOV settings — cameras only */}
            {[...CAMERA_CATEGORIES, 'Motion Sensor'].includes(product.category) && (
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

            {/* DORI Calculator lives in the DORI tab — see below */}
            {false && (() => {
              // Compute effective HFoV and resolution
              let effHfov = null
              let effResH = mpToResH(doriMp)
              if (doriMode === 'hfov') {
                effHfov = parseFloat(doriHfov) || null
              } else {
                const focal = parseFloat(doriFocal)
                const sw    = SENSOR_WIDTHS[doriSensor]
                if (focal > 0 && sw) effHfov = 2 * Math.atan(sw / (2 * focal)) * (180 / Math.PI)
              }
              const doriResult = (effHfov > 0 && effResH > 0)
                ? DORI_THRESHOLDS.map(t => {
                    const rad    = effHfov * Math.PI / 180
                    const meters = effResH / (t.ppm * 2 * Math.tan(rad / 2))
                    return { ...t, meters, feet: meters * 3.28084 }
                  })
                : null

              return (
                <div className="border-t border-[#2a3d55] pt-3">
                  <button
                    onClick={() => setShowDori(s => !s)}
                    className="flex items-center justify-between w-full text-left mb-2"
                  >
                    <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide">DORI Calculator</p>
                    <svg className={`w-3 h-3 text-[#8A9AB0] transition-transform ${showDori ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                    </svg>
                  </button>

                  {showDori && (
                    <div className="space-y-3">
                      {/* Mode toggle */}
                      <div className="flex rounded-lg bg-[#0F1C2E] border border-[#2a3d55] p-0.5">
                        <button
                          onClick={() => setDoriMode('hfov')}
                          className={`flex-1 text-xs py-1.5 rounded-md transition-colors font-medium ${
                            doriMode === 'hfov' ? 'bg-[#C8622A] text-white' : 'text-[#8A9AB0] hover:text-white'
                          }`}
                        >
                          HFoV + Resolution
                        </button>
                        <button
                          onClick={() => setDoriMode('focal')}
                          className={`flex-1 text-xs py-1.5 rounded-md transition-colors font-medium ${
                            doriMode === 'focal' ? 'bg-[#C8622A] text-white' : 'text-[#8A9AB0] hover:text-white'
                          }`}
                        >
                          Focal + Sensor
                        </button>
                      </div>

                      {/* Inputs */}
                      {doriMode === 'hfov' ? (
                        <div className="space-y-2">
                          <div>
                            <label className={labelClass}>Horizontal FoV (°)</label>
                            <input type="number" min="1" max="360"
                              value={doriHfov}
                              onChange={e => setDoriHfov(e.target.value)}
                              placeholder="e.g. 90"
                              className={`${inputClass} w-28`} />
                          </div>
                          <div>
                            <label className={labelClass}>Megapixels (MP)</label>
                            <input type="number" min="0.1" step="0.1"
                              value={doriMp}
                              onChange={e => setDoriMp(e.target.value)}
                              placeholder="e.g. 4"
                              className={`${inputClass} w-32`} />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div>
                            <label className={labelClass}>Focal Length (mm)</label>
                            <input type="number" min="0.1" step="0.1"
                              value={doriFocal}
                              onChange={e => setDoriFocal(e.target.value)}
                              placeholder="e.g. 2.8"
                              className={`${inputClass} w-28`} />
                          </div>
                          <div>
                            <label className={labelClass}>Sensor Size</label>
                            <select value={doriSensor} onChange={e => setDoriSensor(e.target.value)} className={inputClass}>
                              {Object.keys(SENSOR_WIDTHS).map(s => (
                                <option key={s} value={s}>{s} ({SENSOR_WIDTHS[s].toFixed(2)}mm)</option>
                              ))}
                            </select>
                          </div>
                          {effHfov && (
                            <p className="text-[#8A9AB0] text-xs">
                              Calculated HFoV: <span className="text-white font-mono">{effHfov.toFixed(1)}°</span>
                            </p>
                          )}
                          <div>
                            <label className={labelClass}>Megapixels (MP)</label>
                            <input type="number" min="0.1" step="0.1"
                              value={doriMp}
                              onChange={e => setDoriMp(e.target.value)}
                              placeholder="e.g. 4"
                              className={`${inputClass} w-32`} />
                          </div>
                        </div>
                      )}

                      {/* Results */}
                      {doriResult ? (() => {
                        const W = 252, H = 112
                        const cx = 18, cy = H / 2
                        const halfDeg = Math.min((effHfov || 90) / 2, 72)
                        const halfRad = halfDeg * Math.PI / 180
                        const maxD = doriResult[0].feet
                        const scale = (W - cx - 6) / maxD
                        const xOf = d => cx + d * scale
                        const tOf = d => Math.max(3, cy - d * Math.tan(halfRad))
                        const bOf = d => Math.min(H - 3, cy + d * Math.tan(halfRad))
                        const distances = doriResult.map(r => r.feet)
                        const zoneFills   = ['#22c55e28','#3b82f628','#eab30828','#ef444428']
                        const zoneStrokes = ['#22c55e',  '#3b82f6',  '#eab308',  '#ef4444'  ]
                        const abbr        = ['D','O','R','I']

                        return (
                          <>
                            {/* Zone diagram */}
                            <div className="bg-[#060d18] rounded-lg border border-[#2a3d55] overflow-hidden">
                              <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 92 }}>
                                {/* Zones drawn farthest → nearest so red sits on top */}
                                {distances.map((d, i) => {
                                  const prevD = i < distances.length - 1 ? distances[i + 1] : 0
                                  const pts = prevD === 0
                                    ? `${cx},${cy} ${xOf(d)},${tOf(d)} ${xOf(d)},${bOf(d)}`
                                    : `${xOf(prevD)},${tOf(prevD)} ${xOf(d)},${tOf(d)} ${xOf(d)},${bOf(d)} ${xOf(prevD)},${bOf(prevD)}`
                                  return <polygon key={i} points={pts} fill={zoneFills[i]} />
                                })}

                                {/* Fan outline */}
                                <line x1={cx} y1={cy} x2={xOf(maxD)} y2={tOf(maxD)} stroke="#22c55e" strokeWidth={0.7} opacity={0.35} />
                                <line x1={cx} y1={cy} x2={xOf(maxD)} y2={bOf(maxD)} stroke="#22c55e" strokeWidth={0.7} opacity={0.35} />

                                {/* Zone boundary lines + abbreviation labels */}
                                {distances.map((d, i) => (
                                  <g key={i}>
                                    <line x1={xOf(d)} y1={tOf(d)} x2={xOf(d)} y2={bOf(d)}
                                      stroke={zoneStrokes[i]} strokeWidth={1} opacity={0.75} />
                                    <text x={xOf(d) - 2} y={tOf(d) - 2}
                                      textAnchor="end" fontSize={7.5} fill={zoneStrokes[i]}
                                      fontFamily="ui-monospace,monospace" fontWeight="bold">
                                      {abbr[i]}
                                    </text>
                                    <text x={xOf(d)} y={H - 3}
                                      textAnchor="middle" fontSize={6.5} fill={zoneStrokes[i]}
                                      fontFamily="ui-monospace,monospace" opacity={0.8}>
                                      {d.toFixed(0)}ft
                                    </text>
                                  </g>
                                ))}

                                {/* Camera body */}
                                <rect x={2} y={cy - 8} width={14} height={16} rx={2} fill="#C8622A" />
                                <circle cx={9} cy={cy} r={5} fill="#060d18" stroke="#C8622A" strokeWidth={1} />
                                <circle cx={9} cy={cy} r={2} fill="#2a3d55" />
                              </svg>
                            </div>

                            {/* Results table */}
                            <div className="bg-[#0F1C2E] rounded-lg border border-[#2a3d55] overflow-hidden">
                              <div className="px-3 py-1.5 border-b border-[#2a3d55] flex justify-between text-xs text-[#4a5a6a]">
                                <span>Level</span>
                                <span>PPM</span>
                                <span>Distance</span>
                              </div>
                              <div className="divide-y divide-[#2a3d55]/50">
                                {doriResult.map(({ label, ppm, meters, feet, color }) => (
                                  <div key={label} className="flex items-center px-3 py-2 gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${color}`} />
                                    <span className="text-white text-xs font-medium flex-1">{label}</span>
                                    <span className="text-[#8A9AB0] text-xs w-10 text-center">{ppm}</span>
                                    <span className="text-white text-xs font-mono text-right">
                                      {feet.toFixed(0)}ft <span className="text-[#4a5a6a]">/ {meters.toFixed(0)}m</span>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )
                      })() : (
                        <p className="text-[#4a5a6a] text-xs">
                          {doriMode === 'hfov'
                            ? 'Enter HFoV and resolution to calculate distances.'
                            : 'Enter focal length, sensor size, and resolution.'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

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

        {/* ── Labor ── */}
        {laborEnabled && (() => {
          const defs = laborDefaults.filter(d => d.category === product.category)
          if (!defs.length) return null
          const qty      = parseInt(form.quantity) || 1
          const overrides = form.labor_overrides || {}
          const totalHrs = defs.reduce((sum, d) => {
            const hrs = parseFloat(overrides[d.labor_role] ?? d.hours_per_unit ?? 1)
            return sum + hrs * qty
          }, 0)
          return (
            <div className="border-t border-[#2a3d55] pt-3">
              <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                Labor
              </p>
              <div className="bg-[#0F1C2E] rounded-lg border border-[#2a3d55] divide-y divide-[#2a3d55]">
                {defs.map(def => {
                  const defaultHrs = def.hours_per_unit ?? 1
                  const val = overrides[def.labor_role] ?? defaultHrs
                  return (
                    <div key={def.labor_role} className="flex items-center justify-between px-3 py-2 gap-2">
                      <span className="text-white text-xs font-medium truncate flex-1">{def.labor_role}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <input
                          type="number" min="0.25" step="0.25"
                          value={val}
                          onChange={e => {
                            const next = { ...overrides, [def.labor_role]: parseFloat(e.target.value) || defaultHrs }
                            update('labor_overrides', next)
                          }}
                          className="w-14 bg-[#1a2d45] text-white border border-[#2a3d55] rounded px-1.5 py-0.5 text-xs text-center focus:outline-none focus:border-[#C8622A]"
                        />
                        <span className="text-[#8A9AB0] text-xs">hr</span>
                      </div>
                    </div>
                  )
                })}
                <div className="flex justify-between px-3 py-2 text-xs">
                  <span className="text-[#8A9AB0]">Total{qty > 1 ? ` (×${qty})` : ''}</span>
                  <span className="text-[#C8622A] font-bold">{totalHrs.toFixed(2)}h</span>
                </div>
                <div className="px-3 py-1.5">
                  <p className="text-[#4a5a6a] text-xs">Rates applied when pushed to proposal</p>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── Components ── */}
        <ComponentsSection placementId={placement.id} orgId={placement.org_id} category={product.category} product={product} />

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

      {/* ── DORI tab panel ── */}
      {activeTab === 'dori' && CAMERA_CATEGORIES.includes(product.category) && (() => {
        let effHfov = null
        let effResH = mpToResH(doriMp)
        if (doriMode === 'hfov') {
          effHfov = parseFloat(doriHfov) || null
        } else {
          const focal = parseFloat(doriFocal)
          const sw    = SENSOR_WIDTHS[doriSensor]
          if (focal > 0 && sw) effHfov = 2 * Math.atan(sw / (2 * focal)) * (180 / Math.PI)
        }
        const doriError = effHfov >= 180
          ? 'HFoV must be less than 180° for the standard DORI formula. For fisheye or multi-sensor cameras, enter the individual lens HFoV.'
          : null
        const doriResult = (!doriError && effHfov > 0 && effResH > 0)
          ? DORI_THRESHOLDS.map(t => {
              const rad    = effHfov * Math.PI / 180
              const meters = effResH / (t.ppm * 2 * Math.tan(rad / 2))
              return { ...t, meters, feet: meters * 3.28084 }
            })
          : null

        return (
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* Mode toggle */}
            <div className="flex rounded-lg bg-[#0F1C2E] border border-[#2a3d55] p-0.5">
              {[['hfov', 'HFoV + Resolution'], ['focal', 'Focal + Sensor']].map(([id, label]) => (
                <button key={id} onClick={() => setDoriMode(id)}
                  className={`flex-1 text-xs py-2 rounded-md transition-colors font-medium ${
                    doriMode === id ? 'bg-[#C8622A] text-white' : 'text-[#8A9AB0] hover:text-white'
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Inputs */}
            {doriMode === 'hfov' ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[#8A9AB0] text-xs mb-1 block">Horizontal FoV (°)</label>
                    <input type="number" min="1" max="360" value={doriHfov}
                      onChange={e => setDoriHfov(e.target.value)}
                      placeholder="e.g. 90"
                      className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#C8622A] placeholder-[#4a5a6a]" />
                  </div>
                  <div>
                    <label className="text-[#8A9AB0] text-xs mb-1 block">Megapixels (MP)</label>
                    <input type="number" min="0.1" step="0.1" value={doriMp}
                      onChange={e => setDoriMp(e.target.value)}
                      placeholder="e.g. 4"
                      className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#C8622A] placeholder-[#4a5a6a]" />
                  </div>
                </div>
                {effResH && <p className="text-[#4a5a6a] text-xs">≈ {effResH.toLocaleString()}px horizontal (16:9)</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[#8A9AB0] text-xs mb-1 block">Focal Length (mm)</label>
                    <input type="number" min="0.1" step="0.1" value={doriFocal}
                      onChange={e => setDoriFocal(e.target.value)}
                      placeholder="e.g. 2.8"
                      className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#C8622A] placeholder-[#4a5a6a]" />
                  </div>
                  <div>
                    <label className="text-[#8A9AB0] text-xs mb-1 block">Megapixels (MP)</label>
                    <input type="number" min="0.1" step="0.1" value={doriMp}
                      onChange={e => setDoriMp(e.target.value)}
                      placeholder="e.g. 4"
                      className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#C8622A] placeholder-[#4a5a6a]" />
                  </div>
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Sensor Size</label>
                  <select value={doriSensor} onChange={e => setDoriSensor(e.target.value)}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]">
                    {Object.keys(SENSOR_WIDTHS).map(s => (
                      <option key={s} value={s}>{s} ({SENSOR_WIDTHS[s].toFixed(2)}mm)</option>
                    ))}
                  </select>
                </div>
                {(effHfov || effResH) && (
                  <p className="text-[#4a5a6a] text-xs">
                    {effHfov ? <>HFoV: <span className="text-white font-mono">{effHfov.toFixed(1)}°</span></> : null}
                    {effHfov && effResH ? '  ·  ' : null}
                    {effResH ? <>≈ {effResH.toLocaleString()}px horizontal</> : null}
                  </p>
                )}
              </div>
            )}

            {/* Diagram + table */}
            {doriError ? (
              <div className="bg-[#0F1C2E] rounded-xl border border-yellow-500/30 p-4 flex gap-3">
                <svg className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                </svg>
                <p className="text-yellow-400 text-xs leading-relaxed">{doriError}</p>
              </div>
            ) : doriResult ? (() => {
              const W = 280, H = 160
              const cx = 22, cy = H / 2
              const halfDeg = Math.min((effHfov || 90) / 2, 72)
              const halfRad = halfDeg * Math.PI / 180
              const maxD = doriResult[0].feet
              const scale = (W - cx - 8) / maxD
              const xOf = d => cx + d * scale
              const tOf = d => Math.max(4, cy - d * Math.tan(halfRad))
              const bOf = d => Math.min(H - 14, cy + d * Math.tan(halfRad))
              const distances = doriResult.map(r => r.feet)
              const zoneFills   = ['#22c55e28','#3b82f628','#eab30828','#ef444428']
              const zoneStrokes = ['#22c55e',  '#3b82f6',  '#eab308',  '#ef4444'  ]
              const abbr = ['Detection','Observation','Recognition','Identification']
              const abbrShort = ['D','O','R','I']

              return (
                <>
                  <div className="bg-[#060d18] rounded-xl border border-[#2a3d55] overflow-hidden">
                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 150 }}>
                      {/* Zones */}
                      {distances.map((d, i) => {
                        const prevD = i < distances.length - 1 ? distances[i + 1] : 0
                        const pts = prevD === 0
                          ? `${cx},${cy} ${xOf(d)},${tOf(d)} ${xOf(d)},${bOf(d)}`
                          : `${xOf(prevD)},${tOf(prevD)} ${xOf(d)},${tOf(d)} ${xOf(d)},${bOf(d)} ${xOf(prevD)},${bOf(prevD)}`
                        return <polygon key={i} points={pts} fill={zoneFills[i]} />
                      })}
                      {/* Fan outline */}
                      <line x1={cx} y1={cy} x2={xOf(maxD)} y2={tOf(maxD)} stroke="#22c55e" strokeWidth={0.8} opacity={0.3} />
                      <line x1={cx} y1={cy} x2={xOf(maxD)} y2={bOf(maxD)} stroke="#22c55e" strokeWidth={0.8} opacity={0.3} />
                      {/* Zone boundaries + labels */}
                      {distances.map((d, i) => (
                        <g key={i}>
                          <line x1={xOf(d)} y1={tOf(d)} x2={xOf(d)} y2={bOf(d)}
                            stroke={zoneStrokes[i]} strokeWidth={1} opacity={0.8} />
                          <text x={xOf(d)} y={H - 4}
                            textAnchor="middle" fontSize={7} fill={zoneStrokes[i]}
                            fontFamily="ui-monospace,monospace">
                            {abbrShort[i]} {distances[i].toFixed(0)}ft
                          </text>
                          <text x={xOf(d) - 3} y={tOf(d) - 3}
                            textAnchor="end" fontSize={7} fill={zoneStrokes[i]}
                            fontFamily="ui-monospace,monospace" fontWeight="bold" opacity={0.7}>
                            {abbrShort[i]}
                          </text>
                        </g>
                      ))}
                      {/* Camera */}
                      <rect x={3} y={cy - 9} width={16} height={18} rx={3} fill="#C8622A" />
                      <circle cx={11} cy={cy} r={6} fill="#060d18" stroke="#C8622A" strokeWidth={1.5} />
                      <circle cx={11} cy={cy} r={2.5} fill="#2a3d55" />
                    </svg>
                  </div>

                  {/* Results table */}
                  <div className="bg-[#0F1C2E] rounded-xl border border-[#2a3d55] overflow-hidden">
                    <div className="px-3 py-2 border-b border-[#2a3d55] flex justify-between text-xs text-[#4a5a6a] uppercase tracking-wide font-semibold">
                      <span>Level</span>
                      <span>PPM</span>
                      <span>Distance</span>
                    </div>
                    {doriResult.map(({ label, ppm, meters, feet, color }) => (
                      <div key={label} className="flex items-center px-3 py-2.5 gap-2 border-b border-[#2a3d55]/40 last:border-0">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
                        <span className="text-white text-xs font-medium flex-1">{label}</span>
                        <span className="text-[#8A9AB0] text-xs w-10 text-center font-mono">{ppm}</span>
                        <span className="text-white text-sm font-bold font-mono text-right">
                          {feet.toFixed(0)}<span className="text-[#8A9AB0] text-xs font-normal">ft</span>
                          <span className="text-[#4a5a6a] text-xs font-normal ml-1">/ {meters.toFixed(0)}m</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )
            })() : !doriError ? (
              <div className="bg-[#0F1C2E] rounded-xl border border-[#2a3d55] p-6 text-center">
                <p className="text-[#4a5a6a] text-xs">
                  {doriMode === 'hfov'
                    ? 'Enter the camera HFoV and resolution above to calculate DORI distances.'
                    : 'Enter focal length, sensor size, and resolution to calculate DORI distances.'}
                </p>
              </div>
            ) : null}
          </div>
        )
      })()}

      {/* Save button */}
      <div className="px-3 py-2 border-t border-[#2a3d55] flex-shrink-0 text-center">
        <span className={`text-xs transition-opacity ${saved ? 'text-green-400 opacity-100' : 'text-[#4a5a6a] opacity-60'}`}>
          {saved ? '✓ Saved' : 'Changes save automatically'}
        </span>
      </div>

      {/* ── Bulk Apply Modal ── */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-5 py-4 border-b border-[#2a3d55]">
              <h3 className="text-white font-bold text-base">Apply to Similar Devices</h3>
              <p className="text-[#8A9AB0] text-xs mt-0.5">
                {product.category} · {bulkCount} other device{bulkCount !== 1 ? 's' : ''} in this project
              </p>
            </div>

            <div className="p-5 space-y-4">
              {/* What gets applied */}
              <div>
                <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">What to apply</p>
                <div className="bg-[#0F1C2E] rounded-xl p-3 border border-[#2a3d55] space-y-1.5 text-xs">
                  {form.part_number_override && (
                    <div className="flex justify-between">
                      <span className="text-[#8A9AB0]">Part Number</span>
                      <span className="text-white font-mono">{form.part_number_override}</span>
                    </div>
                  )}
                  {form.manufacturer_override && (
                    <div className="flex justify-between">
                      <span className="text-[#8A9AB0]">Manufacturer</span>
                      <span className="text-white">{form.manufacturer_override}</span>
                    </div>
                  )}
                  {form.description_override && (
                    <div className="flex justify-between">
                      <span className="text-[#8A9AB0]">Description</span>
                      <span className="text-white">{form.description_override}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 border-t border-[#2a3d55]">
                    <span className="text-[#4a5a6a]">FOV / marker color / labels</span>
                    <span className="text-[#4a5a6a]">not changed</span>
                  </div>
                </div>
              </div>

              {/* Include components toggle */}
              {sourceComponents.length > 0 && (
                <div className="bg-[#0F1C2E] rounded-xl border border-[#2a3d55] p-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox"
                      checked={includeComponents}
                      onChange={e => setIncludeComponents(e.target.checked)}
                      className="accent-[#C8622A]" />
                    <div className="flex-1">
                      <p className="text-white text-xs font-medium">Include components</p>
                      <p className="text-[#8A9AB0] text-xs mt-0.5">
                        Copy {sourceComponents.length} component{sourceComponents.length !== 1 ? 's' : ''} to selected devices
                        ({sourceComponents.map(c => c.component_type).join(', ')})
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {/* Device checklist */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">Select devices to update</p>
                  <button onClick={() => {
                    if (bulkSelected.size === similarDevices.length) setBulkSelected(new Set())
                    else setBulkSelected(new Set(similarDevices.map(d => d.id)))
                  }} className="text-xs text-[#C8622A] hover:text-white transition-colors">
                    {bulkSelected.size === similarDevices.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="bg-[#0F1C2E] rounded-xl border border-[#2a3d55] divide-y divide-[#2a3d55]/50 max-h-48 overflow-y-auto">
                  {similarDevices.map(d => {
                    const sheetName = sheets.find(s => s.id === d.drawing_sheet_id)?.name || 'Unknown sheet'
                    return (
                      <label key={d.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-[#1a2d45] transition-colors">
                        <input type="checkbox"
                          checked={bulkSelected.has(d.id)}
                          onChange={() => {
                            setBulkSelected(prev => {
                              const next = new Set(prev)
                              if (next.has(d.id)) next.delete(d.id)
                              else next.add(d.id)
                              return next
                            })
                          }}
                          className="accent-[#C8622A] flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-white text-xs font-medium">{d.device_address || 'Unlabeled'}</span>
                          <span className="text-[#8A9AB0] text-xs ml-2">{sheetName}</span>
                        </div>
                        {(d.part_number_override || d.description_override) && (
                          <span className="text-xs text-[#4a5a6a] truncate max-w-24">{d.part_number_override || d.description_override}</span>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-[#2a3d55]">
              <button onClick={() => setShowBulkModal(false)}
                className="flex-1 py-2 text-sm text-[#8A9AB0] border border-[#2a3d55] rounded-lg hover:text-white transition-colors">
                Cancel
              </button>
              <button
                disabled={bulkApplying || bulkSelected.size === 0 || (!form.part_number_override && !form.manufacturer_override && !form.description_override)}
                onClick={async () => {
                  setBulkApplying(true)
                  try {
                    if (bulkSelected.size === 0) return
                    const selectedIds = [...bulkSelected]

                    // Update device data
                    const { error } = await supabase
                      .from('drawing_placements')
                      .update({
                        part_number_override:  form.part_number_override  || null,
                        manufacturer_override: form.manufacturer_override || null,
                        description_override:  form.description_override  || null,
                      })
                      .in('id', selectedIds)

                    // Copy components if checked
                    if (includeComponents && sourceComponents.length > 0 && !error) {
                      for (const placementId of selectedIds) {
                        // Delete existing components
                        await supabase
                          .from('placement_components')
                          .delete()
                          .eq('placement_id', placementId)

                        // Insert source components
                        await supabase
                          .from('placement_components')
                          .insert(sourceComponents.map(c => ({
                            org_id:         c.org_id,
                            placement_id:   placementId,
                            component_type: c.component_type,
                            name:           c.name,
                            part_number:    c.part_number,
                            manufacturer:   c.manufacturer,
                            quantity:       c.quantity,
                            notes:          c.notes,
                          })))
                      }
                    }
                    if (!error) {
                      setBulkDone(true)
                      setShowBulkModal(false)
                      onSaved?.()
                    }
                  } finally {
                    setBulkApplying(false)
                  }
                }}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  bulkApplying || (!form.part_number_override && !form.manufacturer_override && !form.description_override)
                    ? 'bg-[#2a3d55] text-[#8A9AB0] cursor-not-allowed'
                    : 'bg-[#C8622A] text-white hover:bg-[#b5571f]'
                }`}>
                {bulkApplying ? 'Applying...' : `Apply to ${bulkSelected.size} device${bulkSelected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
