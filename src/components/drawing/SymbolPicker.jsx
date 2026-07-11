import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'

const INDUSTRY_LABELS = {
  all:         'All',
  security:    'Security',
  fire_alarm:  'Fire Alarm',
  av:          'AV',
  hvac:        'HVAC',
  electrical:  'Electrical',
  das:         'DAS',
  low_voltage: 'Low Voltage',
}

const CABLE_TYPES = [
  'Cat6', 'Cat6A', 'Cat5e', 'Fiber SM', 'Fiber MM',
  'Coax RG59', 'Coax RG6', 'Speaker 16/2', 'Speaker 14/2',
  '18/2', '22/4', '22/6', 'Composite', 'HDMI', 'HDBaseT',
  'Power', 'Plenum Cat6', 'Plenum 22/4',
]

export const PATHWAY_DEFS = [
  { type: 'EMT',             color: '#4a90d9', label: 'EMT Conduit',      dash: [] },
  { type: 'Rigid',           color: '#9ca3af', label: 'Rigid Conduit',    dash: [] },
  { type: 'PVC',             color: '#d1d5db', label: 'PVC Conduit',      dash: [8, 4] },
  { type: 'Flex',            color: '#eab308', label: 'Flex Conduit',     dash: [4, 4] },
  { type: 'J-hook',          color: '#3b82f6', label: 'J-Hook',           dash: [6, 6] },
  { type: 'Cable Tray',      color: '#f59e0b', label: 'Cable Tray',       dash: [] },
  { type: 'Wireway',         color: '#22c55e', label: 'Wireway',          dash: [] },
  { type: 'Surface Raceway', color: '#06b6d4', label: 'Surface Raceway',  dash: [] },
]

export default function SymbolPicker({ selectedSymbol, onSelect, orgId, allowedManufacturers, activeTool, onToolSelect }) {
  const [tab,           setTab]           = useState('devices')
  const [industry,      setIndustry]      = useState('all')
  const [manufacturer,  setManufacturer]  = useState('Generic')
  const [category,      setCategory]      = useState(null)
  const [search,        setSearch]        = useState('')
  const [manufacturers, setManufacturers] = useState([])
  const [categories,    setCategories]    = useState([])
  const [symbols,       setSymbols]       = useState([])
  const [loading,       setLoading]       = useState(false)
  const [allProducts,   setAllProducts]   = useState([])

  // Sync tab with active tool type
  useEffect(() => {
    if (activeTool?.type === 'cable')   setTab('cable')
    if (activeTool?.type === 'pathway') setTab('pathways')
    if (activeTool?.type === 'room')    setTab('rooms')
  }, [activeTool?.type])

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true)
      const [{ data: global }, { data: org }] = await Promise.all([
        supabase.from('global_products').select('*').eq('is_active', true).order('category').order('name'),
        orgId ? supabase.from('org_products').select('*').eq('org_id', orgId).eq('is_active', true).order('name') : Promise.resolve({ data: [] }),
      ])
      const globalFiltered = allowedManufacturers?.length
        ? (global || []).filter(p => p.manufacturer === 'Generic' || allowedManufacturers.includes(p.manufacturer))
        : (global || [])
      setAllProducts([...globalFiltered, ...(org || []).map(p => ({ ...p, is_custom: true }))])
      setLoading(false)
    }
    loadAll()
  }, [])

  useEffect(() => {
    const filtered = industry === 'all' ? allProducts : allProducts.filter(p => p.industry === industry)
    const unique = [...new Set(filtered.map(r => r.manufacturer))].sort()
    setManufacturers(['Generic', ...unique.filter(m => m !== 'Generic')])
    setManufacturer('Generic')
    setCategory(null)
  }, [industry, allProducts])

  useEffect(() => {
    const filtered = allProducts.filter(p => {
      if (industry !== 'all' && p.industry !== industry) return false
      if (manufacturer && p.manufacturer !== manufacturer) return false
      return true
    })
    setCategories([...new Set(filtered.map(r => r.category))].sort())
    setCategory(null)
  }, [manufacturer, industry, allProducts])

  useEffect(() => {
    const filtered = allProducts.filter(p => {
      if (!p.is_active) return false
      if (industry !== 'all' && p.industry !== industry) return false
      if (manufacturer && p.manufacturer !== manufacturer) return false
      if (category && p.category !== category) return false
      return true
    })
    setSymbols(filtered)
  }, [category, industry, manufacturer, allProducts])

  const filtered = search.trim()
    ? symbols.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.part_number.toLowerCase().includes(search.toLowerCase()) ||
        s.model_number?.toLowerCase().includes(search.toLowerCase())
      )
    : symbols

  const handleTabChange = (newTab) => {
    setTab(newTab)
    if (newTab === 'devices') onToolSelect?.(null)
    if (newTab === 'rooms' && activeTool?.type !== 'room') onToolSelect?.({ type: 'room' })
    if (newTab !== 'rooms' && activeTool?.type === 'room') onToolSelect?.(null)
  }

  return (
    <div className="flex flex-col h-full bg-[#0F1C2E]">

      {/* Tab bar */}
      <div className="flex border-b border-[#2a3d55] flex-shrink-0">
        {[
          { id: 'devices',   label: 'Devices' },
          { id: 'cable',     label: 'Cable' },
          { id: 'pathways',  label: 'Pathways' },
          { id: 'rooms',     label: 'Rooms' },
        ].map(t => (
          <button key={t.id} onClick={() => handleTabChange(t.id)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === t.id
                ? 'text-white border-b-2 border-[#C8622A]'
                : 'text-[#8A9AB0] hover:text-white'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* DEVICES tab */}
      {tab === 'devices' && (
        <>
          <div className="px-3 pt-3 pb-2 border-b border-[#2a3d55]">
            <p className="text-xs font-medium text-[#8A9AB0] mb-2">Industry</p>
            <select value={industry} onChange={e => setIndustry(e.target.value)}
              className="w-full text-xs border border-[#2a3d55] rounded-lg px-2 py-1.5 bg-[#1a2d45] text-white focus:outline-none focus:border-[#C8622A] cursor-pointer">
              {Object.entries(INDUSTRY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          <div className="px-3 py-2 border-b border-[#2a3d55]">
            <p className="text-xs font-medium text-[#8A9AB0] mb-2">Manufacturer</p>
            <select value={manufacturer} onChange={e => setManufacturer(e.target.value)}
              className="w-full text-xs border border-[#2a3d55] rounded-lg px-2 py-1.5 bg-[#1a2d45] text-white focus:outline-none focus:border-[#C8622A]">
              {manufacturers.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {industry !== 'all' && categories.length > 0 && (
            <div className="px-3 py-2 border-b border-[#2a3d55]">
              <p className="text-xs font-medium text-[#8A9AB0] mb-2">Category</p>
              <select
                value={category || ''}
                onChange={e => setCategory(e.target.value || null)}
                className="w-full text-xs border border-[#2a3d55] rounded-lg px-2 py-1.5 bg-[#1a2d45] text-white focus:outline-none focus:border-[#C8622A]"
              >
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          )}

          <div className="px-3 py-2 border-b border-[#2a3d55]">
            <input type="text" placeholder="Search name or part #..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full text-xs border border-[#2a3d55] rounded-lg px-2 py-1.5 bg-[#1a2d45] text-white placeholder-[#8A9AB0] focus:outline-none focus:border-[#C8622A]" />
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="flex items-center justify-center h-24 text-xs text-[#8A9AB0]">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-xs text-[#8A9AB0]">No symbols found</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filtered.map(symbol => (
                  <SymbolCard key={symbol.id} symbol={symbol}
                    isSelected={selectedSymbol?.id === symbol.id}
                    onSelect={() => {
                      onToolSelect?.(null)
                      onSelect(selectedSymbol?.id === symbol.id ? null : symbol)
                    }} />
                ))}
              </div>
            )}
          </div>

          {selectedSymbol && (
            <div className="px-3 py-2 border-t border-[#2a3d55] bg-[#C8622A]/10 flex-shrink-0">
              <p className="text-xs font-medium text-[#C8622A] truncate">{selectedSymbol.name}</p>
              <p className="text-xs text-[#C8622A]/70 font-mono truncate">{selectedSymbol.part_number}</p>
              <p className="text-xs text-[#8A9AB0] mt-0.5">Click floor plan to place</p>
            </div>
          )}
        </>
      )}

      {/* CABLE tab */}
      {tab === 'cable' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="px-3 pt-3 pb-2">
            <p className="text-xs text-[#8A9AB0]">Select a cable type then click the canvas to draw. Double-click to finish.</p>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            <div className="flex flex-col gap-1">
              {CABLE_TYPES.map(t => {
                const isActive = activeTool?.type === 'cable' && activeTool.cableType === t
                return (
                  <button key={t}
                    onClick={() => onToolSelect?.(isActive ? null : { type: 'cable', cableType: t })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-colors ${
                      isActive
                        ? 'bg-blue-500/20 border border-blue-400 text-blue-300'
                        : 'bg-[#1a2d45] border border-[#2a3d55] text-white hover:border-blue-400/50 hover:bg-blue-500/5'
                    }`}>
                    <svg className="w-4 h-4 flex-shrink-0 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16M4 12l4-4M4 12l4 4"/>
                    </svg>
                    {t}
                    {isActive && <span className="ml-auto text-blue-400 text-xs">Active</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {activeTool?.type === 'cable' && (
            <div className="px-3 py-2 border-t border-blue-500/30 bg-blue-500/10 flex-shrink-0">
              <p className="text-xs text-blue-300 font-medium">Drawing {activeTool.cableType}</p>
              <p className="text-xs text-blue-400/70 mt-0.5">Click to add points · Double-click to finish</p>
              <button onClick={() => onToolSelect?.(null)}
                className="mt-1.5 text-xs text-[#8A9AB0] hover:text-white underline">
                Exit drawing mode
              </button>
            </div>
          )}
        </div>
      )}

      {/* PATHWAYS tab */}
      {tab === 'pathways' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="px-3 pt-3 pb-2">
            <p className="text-xs text-[#8A9AB0]">Select a pathway type then click the canvas to draw. Double-click to finish.</p>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            <div className="flex flex-col gap-1">
              {PATHWAY_DEFS.map(p => {
                const isActive = activeTool?.type === 'pathway' && activeTool.pathwayType === p.type
                return (
                  <button key={p.type}
                    onClick={() => onToolSelect?.(isActive ? null : { type: 'pathway', pathwayType: p.type })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-colors ${
                      isActive
                        ? 'border text-white'
                        : 'bg-[#1a2d45] border border-[#2a3d55] text-white hover:border-white/20'
                    }`}
                    style={isActive ? { backgroundColor: p.color + '22', borderColor: p.color } : {}}>
                    <span className="w-6 h-0.5 flex-shrink-0 rounded"
                      style={{ backgroundColor: p.color, ...(p.dash.length ? { opacity: 0.8 } : {}) }}/>
                    <span>{p.label}</span>
                    {isActive && <span className="ml-auto text-xs font-medium" style={{ color: p.color }}>Active</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {activeTool?.type === 'pathway' && (() => {
            const def = PATHWAY_DEFS.find(d => d.type === activeTool.pathwayType)
            return (
              <div className="px-3 py-2 border-t flex-shrink-0" style={{ borderColor: def?.color + '55', backgroundColor: def?.color + '15' }}>
                <p className="text-xs font-medium" style={{ color: def?.color }}>{def?.label}</p>
                <p className="text-xs mt-0.5" style={{ color: def?.color + 'aa' }}>Click to add points · Double-click to finish</p>
                <button onClick={() => onToolSelect?.(null)}
                  className="mt-1.5 text-xs text-[#8A9AB0] hover:text-white underline">
                  Exit drawing mode
                </button>
              </div>
            )
          })()}
        </div>
      )}

      {/* ROOMS tab */}
      {tab === 'rooms' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="px-3 pt-3 pb-2">
            <p className="text-xs text-[#8A9AB0]">Click on the floor plan to drop a room marker (MDF, IDF, Headend, etc). Then click the marker to build racks inside it.</p>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            <button
              onClick={() => onToolSelect?.(activeTool?.type === 'room' ? null : { type: 'room' })}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-colors ${
                activeTool?.type === 'room'
                  ? 'bg-emerald-500/15 border-emerald-400/60 text-emerald-300'
                  : 'bg-[#1a2d45] border-[#2a3d55] text-white hover:border-emerald-400/40 hover:bg-emerald-500/5'
              }`}>
              <svg className="w-5 h-5 flex-shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
              </svg>
              <div>
                <p className="text-xs font-semibold">Place Room Marker</p>
                <p className="text-xs mt-0.5" style={{ color: activeTool?.type === 'room' ? '#6ee7b7' : '#4a6080' }}>
                  {activeTool?.type === 'room' ? 'Click canvas to place — Active' : 'MDF · IDF · Headend · Electrical · AV'}
                </p>
              </div>
              {activeTool?.type === 'room' && <span className="ml-auto text-emerald-400 text-xs font-semibold">Active</span>}
            </button>
          </div>
          {activeTool?.type === 'room' && (
            <div className="px-3 py-2 border-t flex-shrink-0" style={{ borderColor: '#34d39955', backgroundColor: '#34d39915' }}>
              <p className="text-xs font-medium text-emerald-400">Placing Room Marker</p>
              <p className="text-xs mt-0.5 text-emerald-600">Click anywhere on the floor plan</p>
              <button onClick={() => onToolSelect?.(null)} className="mt-1.5 text-xs text-[#8A9AB0] hover:text-white underline">
                Exit placement mode
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SymbolCard({ symbol, isSelected, onSelect }) {
  const handleDragStart = (e) => {
    e.dataTransfer.setData('application/json', JSON.stringify(symbol))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <button
      onClick={onSelect}
      draggable={true}
      onDragStart={handleDragStart}
      title={`${symbol.name}\n${symbol.part_number}\nDrag to place on canvas`}
      className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-center transition-all cursor-grab active:cursor-grabbing ${
        isSelected
          ? 'border-[#C8622A]/60 bg-[#C8622A]/10'
          : 'border-[#2a3d55] bg-[#1a2d45] hover:border-[#C8622A]/40 hover:bg-[#C8622A]/5'
      }`}>
      <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${isSelected ? 'text-[#C8622A]' : 'text-[#8A9AB0]'}`}>
        <CategoryIcon category={symbol.category} />
      </div>
      <span className="text-xs text-white leading-tight line-clamp-2">{symbol.name}</span>
      <span className="text-xs font-mono text-[#8A9AB0] truncate w-full text-center">{symbol.part_number}</span>
    </button>
  )
}

function CategoryIcon({ category }) {
  const props = { className: 'w-10 h-10', fill: 'none', stroke: 'currentColor', viewBox: '0 0 40 40' }
  switch (category) {
    case 'Dome Camera':
      return <svg {...props}><ellipse cx="20" cy="24" rx="14" ry="6" strokeWidth="1.5"/><path d="M6 24 Q6 10 20 10 Q34 10 34 24" strokeWidth="1.5" fill="none"/><circle cx="20" cy="20" r="4" strokeWidth="1.5"/></svg>
    case 'Bullet Camera':
      return <svg {...props}><rect x="8" y="16" width="20" height="8" rx="2" strokeWidth="1.5"/><path d="M28 18 L34 16 L34 24 L28 22 Z" strokeWidth="1.5" fill="none"/><circle cx="13" cy="20" r="2" strokeWidth="1.5"/></svg>
    case 'PTZ Camera':
      return <svg {...props}><circle cx="20" cy="20" r="10" strokeWidth="1.5"/><circle cx="20" cy="20" r="4" strokeWidth="1.5"/><path d="M20 8 L20 4 M20 36 L20 32 M8 20 L4 20 M36 20 L32 20" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'Access Reader':
      return <svg {...props}><rect x="10" y="8" width="20" height="24" rx="3" strokeWidth="1.5"/><rect x="15" y="13" width="10" height="7" rx="1" strokeWidth="1.5"/><circle cx="20" cy="26" r="2" strokeWidth="1.5"/></svg>
    case 'Controller':
      return <svg {...props}><rect x="6" y="12" width="28" height="16" rx="2" strokeWidth="1.5"/><circle cx="13" cy="20" r="2" fill="currentColor"/><circle cx="20" cy="20" r="2" fill="currentColor"/><circle cx="27" cy="20" r="2" fill="currentColor"/></svg>
    case 'Motion Sensor':
      return <svg {...props}><path d="M20 20 L8 10 M20 20 L8 30 M20 20 L32 20" strokeWidth="1.5" strokeLinecap="round"/><circle cx="20" cy="20" r="3" strokeWidth="1.5"/><path d="M26 14 Q32 20 26 26" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
    case 'Turret Camera':
      return <svg {...props}><ellipse cx="20" cy="26" rx="12" ry="5" strokeWidth="1.5"/><path d="M8 26 Q8 16 20 14 Q32 16 32 26" strokeWidth="1.5"/><circle cx="20" cy="20" r="5" strokeWidth="1.5"/><circle cx="20" cy="20" r="2" fill="currentColor"/><path d="M14 30 L12 36 M26 30 L28 36" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'Cabinet System':
      return <svg {...props}><rect x="8" y="4" width="24" height="32" rx="2" strokeWidth="1.5"/><path d="M8 10 L32 10 M8 30 L32 30" strokeWidth="1.5"/><rect x="12" y="13" width="16" height="8" rx="1" strokeWidth="1"/><circle cx="28" cy="34" r="1.5" fill="currentColor"/><circle cx="12" cy="34" r="1.5" fill="currentColor"/></svg>
    case 'Cabinet Solar System':
      return <svg {...props}><rect x="8" y="14" width="20" height="22" rx="2" strokeWidth="1.5"/><path d="M8 20 L28 20 M8 30 L28 30" strokeWidth="1.5"/><rect x="11" y="22" width="14" height="6" rx="1" strokeWidth="1"/><rect x="4" y="4" width="32" height="8" rx="1" strokeWidth="1.5"/><path d="M10 4 L10 12 M16 4 L16 12 M22 4 L22 12 M28 4 L28 12" strokeWidth="1"/><path d="M18 12 L18 14" strokeLinecap="round" strokeWidth="1.5"/></svg>
    case 'Video Encoder':
      return <svg {...props}><rect x="4" y="12" width="24" height="16" rx="2" strokeWidth="1.5"/><path d="M28 16 L36 12 L36 28 L28 24 Z" strokeWidth="1.5"/><circle cx="10" cy="18" r="1.5" fill="currentColor"/><circle cx="10" cy="22" r="1.5" fill="currentColor"/><path d="M14 17 L22 17 M14 20 L22 20 M14 23 L20 23" strokeLinecap="round" strokeWidth="1"/></svg>
    case 'NVR':
      return <svg {...props}><rect x="6" y="10" width="28" height="20" rx="2" strokeWidth="1.5"/><rect x="10" y="14" width="8" height="6" rx="1" strokeWidth="1.5"/><rect x="22" y="14" width="8" height="6" rx="1" strokeWidth="1.5"/></svg>
    case 'Display':
      return <svg {...props}><rect x="6" y="8" width="28" height="20" rx="2" strokeWidth="1.5"/><path d="M16 32 L24 32 M20 28 L20 32" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'Speaker':
      return <svg {...props}><circle cx="20" cy="20" r="12" strokeWidth="1.5"/><circle cx="20" cy="20" r="5" strokeWidth="1.5"/><circle cx="20" cy="20" r="2" fill="currentColor"/></svg>
    case 'Network':
      return <svg {...props}><rect x="8" y="14" width="24" height="12" rx="2" strokeWidth="1.5"/><path d="M20 10 Q14 14 14 18 M20 10 Q26 14 26 18" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
    case 'Thermostat':
      return <svg {...props}><circle cx="20" cy="20" r="12" strokeWidth="1.5"/><path d="M20 14 L20 20 L24 24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="20" cy="20" r="2" fill="currentColor"/></svg>
    case 'Diffuser':
      return <svg {...props}><rect x="8" y="8" width="24" height="24" rx="2" strokeWidth="1.5"/><path d="M14 14 L26 14 M14 20 L26 20 M14 26 L26 26" strokeWidth="1" strokeDasharray="2 2"/><path d="M14 14 L14 26 M20 14 L20 26 M26 14 L26 26" strokeWidth="1" strokeDasharray="2 2"/></svg>
    case 'Outlet':
      return <svg {...props}><rect x="10" y="8" width="20" height="24" rx="3" strokeWidth="1.5"/><path d="M17 16 L17 20 M23 16 L23 20" strokeWidth="2" strokeLinecap="round"/><path d="M17 24 Q20 27 23 24" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
    case 'Panel':
      return <svg {...props}><rect x="10" y="6" width="20" height="28" rx="2" strokeWidth="1.5"/><path d="M14 12 L26 12 M14 16 L26 16 M14 20 L26 20 M14 24 L26 24 M14 28 L22 28" strokeWidth="1" strokeLinecap="round"/></svg>
    case 'Lighting':
      return <svg {...props}><circle cx="20" cy="18" r="8" strokeWidth="1.5"/><path d="M17 26 L23 26 M18 29 L22 29" strokeWidth="1.5" strokeLinecap="round"/><path d="M20 6 L20 4 M28 10 L30 8 M32 18 L34 18 M12 10 L10 8 M8 18 L6 18" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'Projector':
      return <svg {...props}><rect x="6" y="14" width="22" height="12" rx="2" strokeWidth="1.5"/><circle cx="22" cy="20" r="4" strokeWidth="1.5"/><circle cx="22" cy="20" r="1.5" fill="currentColor"/><path d="M28 17 L36 13 L36 27 L28 23" strokeWidth="1.5" fill="none"/><circle cx="10" cy="18" r="1" fill="currentColor"/><circle cx="10" cy="22" r="1" fill="currentColor"/></svg>
    case 'Projection Screen':
      return <svg {...props}><path d="M4 8 L36 8" strokeLinecap="round" strokeWidth="2"/><rect x="8" y="8" width="24" height="20" rx="1" strokeWidth="1.5"/><path d="M16 28 L16 36 M24 28 L24 36" strokeLinecap="round" strokeWidth="1.5"/></svg>
    case 'Touch Panel':
      return <svg {...props}><rect x="8" y="4" width="24" height="32" rx="3" strokeWidth="1.5"/><rect x="11" y="8" width="18" height="20" rx="1" strokeWidth="1.5"/><circle cx="20" cy="32" r="2" strokeWidth="1.5"/><path d="M20 14 L20 18 M18 16 L22 16" strokeLinecap="round" strokeWidth="1"/></svg>
    case 'Control Processor':
      return <svg {...props}><rect x="4" y="10" width="32" height="20" rx="2" strokeWidth="1.5"/><rect x="8" y="14" width="10" height="8" rx="1" strokeWidth="1.5"/><circle cx="26" cy="17" r="2" fill="currentColor"/><circle cx="32" cy="17" r="2" fill="currentColor"/><path d="M22 24 L36 24 M8 26 L18 26" strokeWidth="1" strokeLinecap="round"/></svg>
    case 'Ceiling Speaker':
      return <svg {...props}><circle cx="20" cy="20" r="14" strokeWidth="1.5"/><circle cx="20" cy="20" r="8" strokeWidth="1.5"/><circle cx="20" cy="20" r="3" fill="currentColor"/><path d="M20 6 L20 2 M34 20 L38 20 M20 34 L20 38 M6 20 L2 20" strokeLinecap="round" strokeWidth="1"/></svg>
    case 'Subwoofer':
      return <svg {...props}><rect x="6" y="8" width="28" height="24" rx="2" strokeWidth="1.5"/><circle cx="20" cy="20" r="9" strokeWidth="1.5"/><circle cx="20" cy="20" r="4" strokeWidth="1.5"/><circle cx="20" cy="20" r="1.5" fill="currentColor"/></svg>
    case 'Microphone':
      return <svg {...props}><rect x="14" y="4" width="12" height="18" rx="6" strokeWidth="1.5"/><path d="M8 20 Q8 30 20 30 Q32 30 32 20" strokeLinecap="round" strokeWidth="1.5" fill="none"/><path d="M20 30 L20 36 M14 36 L26 36" strokeLinecap="round" strokeWidth="1.5"/></svg>
    case 'Wireless Mic':
      return <svg {...props}><rect x="14" y="14" width="12" height="20" rx="6" strokeWidth="1.5"/><ellipse cx="20" cy="14" rx="6" ry="4" strokeWidth="1.5"/><path d="M28 12 Q32 17 28 22" strokeLinecap="round" strokeWidth="1" fill="none"/><path d="M31 9 Q37 17 31 25" strokeLinecap="round" strokeWidth="1" fill="none"/></svg>
    case 'Video Conference':
      return <svg {...props}><rect x="4" y="10" width="28" height="18" rx="2" strokeWidth="1.5"/><path d="M32 14 L38 11 L38 29 L32 26 Z" strokeWidth="1.5" fill="none"/><path d="M14 28 L14 34 M26 28 L26 34 M10 34 L30 34" strokeLinecap="round" strokeWidth="1.5"/></svg>
    case 'Media Player':
      return <svg {...props}><rect x="4" y="14" width="32" height="12" rx="3" strokeWidth="1.5"/><path d="M17 17 L17 23 L23 20 Z" fill="currentColor"/><circle cx="30" cy="20" r="2" fill="currentColor"/></svg>
    case 'HDMI Extender':
      return <svg {...props}><rect x="2" y="14" width="12" height="12" rx="2" strokeWidth="1.5"/><rect x="26" y="14" width="12" height="12" rx="2" strokeWidth="1.5"/><path d="M14 20 L26 20" strokeDasharray="2 2" strokeWidth="1.5"/><path d="M8 17 L8 23 M32 17 L32 23" strokeLinecap="round" strokeWidth="1.5"/></svg>
    case 'AV Receiver':
      return <svg {...props}><rect x="4" y="12" width="32" height="16" rx="2" strokeWidth="1.5"/><rect x="8" y="16" width="10" height="8" rx="1" strokeWidth="1.5"/><circle cx="26" cy="20" r="4" strokeWidth="1.5"/><circle cx="26" cy="20" r="1.5" fill="currentColor"/></svg>
    case 'Clock':
      return <svg {...props}><circle cx="20" cy="20" r="14" strokeWidth="1.5"/><path d="M20 10 L20 20 L26 26" strokeLinecap="round" strokeWidth="1.5"/><circle cx="20" cy="20" r="1.5" fill="currentColor"/><path d="M20 8 L20 6 M32 20 L34 20 M20 32 L20 34 M8 20 L6 20" strokeWidth="1"/></svg>
    case 'Document Camera':
      return <svg {...props}><rect x="6" y="30" width="28" height="6" rx="2" strokeWidth="1.5"/><path d="M20 30 L20 16 M20 16 L30 10" strokeLinecap="round" strokeWidth="1.5"/><circle cx="32" cy="10" r="4" strokeWidth="1.5"/><circle cx="32" cy="10" r="1.5" fill="currentColor"/></svg>
    case 'Streaming Encoder':
      return <svg {...props}><rect x="4" y="12" width="32" height="16" rx="2" strokeWidth="1.5"/><path d="M10 22 Q13 16 16 22 Q19 28 22 22 Q24 18 26 22" strokeLinecap="round" strokeWidth="1.5" fill="none"/><circle cx="32" cy="18" r="2" fill="currentColor"/></svg>
    case 'Digital Signage':
      return <svg {...props}><rect x="4" y="6" width="32" height="22" rx="2" strokeWidth="1.5"/><path d="M15 32 L25 32 M20 28 L20 32" strokeLinecap="round" strokeWidth="1.5"/><path d="M9 11 L31 11 M9 15 L24 15 M9 19 L20 19" strokeLinecap="round" strokeWidth="1"/></svg>
    case 'Wall Plate':
      return <svg {...props}><rect x="10" y="6" width="20" height="28" rx="2" strokeWidth="1.5"/><rect x="14" y="11" width="12" height="7" rx="1" strokeWidth="1.5"/><rect x="14" y="22" width="12" height="7" rx="1" strokeWidth="1.5"/></svg>
    case 'Alarm Keypad':
      return <svg {...props}><rect x="10" y="4" width="20" height="32" rx="2" strokeWidth="1.5"/><rect x="13" y="7" width="14" height="8" rx="1" strokeWidth="1.5"/><circle cx="15" cy="20" r="1.5" fill="currentColor"/><circle cx="20" cy="20" r="1.5" fill="currentColor"/><circle cx="25" cy="20" r="1.5" fill="currentColor"/><circle cx="15" cy="25" r="1.5" fill="currentColor"/><circle cx="20" cy="25" r="1.5" fill="currentColor"/><circle cx="25" cy="25" r="1.5" fill="currentColor"/><circle cx="15" cy="30" r="1.5" fill="currentColor"/><circle cx="20" cy="30" r="1.5" fill="currentColor"/><circle cx="25" cy="30" r="1.5" fill="currentColor"/></svg>
    case 'Alarm Panel':
      return <svg {...props}><rect x="4" y="6" width="32" height="28" rx="2" strokeWidth="1.5"/><rect x="8" y="10" width="16" height="10" rx="1" strokeWidth="1.5"/><circle cx="30" cy="13" r="2" fill="currentColor"/><circle cx="30" cy="19" r="2" fill="currentColor"/><path d="M8 24 L24 24 M8 28 L18 28" strokeLinecap="round" strokeWidth="1"/></svg>
    case 'Door Contact':
      return <svg {...props}><rect x="5" y="8" width="11" height="24" rx="2" strokeWidth="1.5"/><rect x="24" y="8" width="11" height="24" rx="2" strokeWidth="1.5"/><path d="M16 14 L24 14 M16 26 L24 26" strokeWidth="1" strokeDasharray="2 2"/></svg>
    case 'PIR Detector':
      return <svg {...props}><path d="M6 32 Q6 14 20 10 Q34 14 34 32 Z" strokeWidth="1.5" fill="none"/><path d="M12 26 Q12 18 20 16 Q28 18 28 26" strokeWidth="1" strokeDasharray="2 2" fill="none"/><circle cx="20" cy="30" r="2" fill="currentColor"/></svg>
    case 'Dual Tech Detector':
      return <svg {...props}><rect x="6" y="12" width="28" height="16" rx="2" strokeWidth="1.5"/><path d="M12 20 Q16 15 20 20 Q24 25 28 20" strokeLinecap="round" strokeWidth="1.5" fill="none"/><path d="M6 32 L10 28 M34 32 L30 28" strokeLinecap="round" strokeWidth="1"/></svg>
    case 'Glass Break':
      return <svg {...props}><circle cx="20" cy="20" r="13" strokeWidth="1.5"/><path d="M20 7 L17 14 L22 14 L16 22 M22 14 L26 19" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/><circle cx="20" cy="20" r="2" fill="currentColor"/></svg>
    case 'Interior Siren':
      return <svg {...props}><rect x="12" y="12" width="16" height="16" rx="2" strokeWidth="1.5"/><path d="M8 15 Q5 20 8 25" strokeLinecap="round" strokeWidth="1.5" fill="none"/><path d="M32 15 Q35 20 32 25" strokeLinecap="round" strokeWidth="1.5" fill="none"/><path d="M5 12 Q2 20 5 28" strokeLinecap="round" strokeWidth="1" fill="none"/><path d="M35 12 Q38 20 35 28" strokeLinecap="round" strokeWidth="1" fill="none"/></svg>
    case 'Exterior Siren':
      return <svg {...props}><rect x="10" y="8" width="20" height="14" rx="2" strokeWidth="1.5"/><circle cx="20" cy="30" r="6" strokeWidth="1.5"/><circle cx="20" cy="30" r="2.5" fill="currentColor"/><path d="M7 11 Q4 15 7 19" strokeLinecap="round" strokeWidth="1.5" fill="none"/><path d="M33 11 Q36 15 33 19" strokeLinecap="round" strokeWidth="1.5" fill="none"/></svg>
    case 'Panic Button':
      return <svg {...props}><rect x="6" y="12" width="28" height="16" rx="8" strokeWidth="1.5"/><circle cx="20" cy="20" r="5" fill="currentColor"/></svg>
    case 'Shock Sensor':
      return <svg {...props}><circle cx="20" cy="20" r="8" strokeWidth="1.5"/><path d="M9 11 Q6 9 8 6 M31 11 Q34 9 32 6 M9 29 Q6 31 8 34 M31 29 Q34 31 32 34" strokeLinecap="round" strokeWidth="1"/><circle cx="20" cy="20" r="3" fill="currentColor"/></svg>
    case 'Door Operator':
      return <svg {...props}><path d="M6 6 L6 32" strokeWidth="1.5" strokeLinecap="round"/><path d="M6 32 A26 26 0 0 0 32 6" strokeDasharray="3 3" strokeWidth="1"/><rect x="28" y="2" width="10" height="8" rx="1" strokeWidth="1.5"/><circle cx="33" cy="6" r="2" fill="currentColor" stroke="none"/></svg>
    case 'Point to Point':
      return <svg {...props}><rect x="2" y="15" width="8" height="10" rx="1" strokeWidth="1.5"/><path d="M10 18 L15 20 L10 22 Z" fill="currentColor" stroke="none"/><path d="M15 20 L25 20" strokeDasharray="2 2" strokeWidth="1.5" strokeLinecap="round"/><path d="M30 18 L25 20 L30 22 Z" fill="currentColor" stroke="none"/><rect x="30" y="15" width="8" height="10" rx="1" strokeWidth="1.5"/><path d="M6 25 L6 38" strokeWidth="1.5" strokeLinecap="round"/><path d="M34 25 L34 38" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'Power Box':
      return <svg {...props}><rect x="4" y="6" width="32" height="26" rx="3" strokeWidth="1.5"/><path d="M4 14 L36 14" strokeWidth="1.5"/><path d="M21 18 L17 24 L20 24 L20 29 L24 23 L21 23 Z" fill="currentColor" stroke="none"/><rect x="6" y="27" width="4" height="3" rx="0.5" strokeWidth="1"/><rect x="12" y="27" width="4" height="3" rx="0.5" strokeWidth="1"/><circle cx="31" cy="24" r="2.5" strokeWidth="1.2"/><path d="M29 24 L29 21 Q29 19 31 19 Q33 19 33 21 L33 24" strokeWidth="1.2"/></svg>
    // ── HVAC ──────────────────────────────────────────────────────────────────
    case 'Air Handler':
      return <svg {...props}><rect x="4" y="10" width="32" height="20" rx="2" strokeWidth="1.5"/><circle cx="20" cy="20" r="6" strokeWidth="1.5"/><path d="M20 14 L20 26 M14 20 L26 20 M15.5 15.5 L24.5 24.5 M24.5 15.5 L15.5 24.5" strokeWidth="1" strokeLinecap="round"/><path d="M4 14 L0 14 M4 26 L0 26 M36 14 L40 14 M36 26 L40 26" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'VAV Box':
      return <svg {...props}><rect x="4" y="12" width="32" height="16" rx="2" strokeWidth="1.5"/><path d="M10 20 L16 14 M16 14 L22 26 M22 26 L28 14 M28 14 L34 20" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" fill="none"/><path d="M4 20 L0 20 M36 20 L40 20" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'Fan Coil Unit':
      return <svg {...props}><rect x="4" y="8" width="32" height="24" rx="2" strokeWidth="1.5"/><circle cx="14" cy="20" r="6" strokeWidth="1.5"/><path d="M14 14 L14 26 M8 20 L20 20" strokeWidth="1" strokeLinecap="round"/><path d="M24 13 L32 13 M24 17 L32 17 M24 21 L32 21 M24 25 L32 25" strokeWidth="1.2" strokeLinecap="round"/></svg>
    case 'Exhaust Fan':
      return <svg {...props}><circle cx="20" cy="20" r="14" strokeWidth="1.5"/><circle cx="20" cy="20" r="3" strokeWidth="1.5"/><path d="M20 17 Q26 14 26 20" strokeLinecap="round" strokeWidth="1.5" fill="none"/><path d="M20 23 Q14 26 14 20" strokeLinecap="round" strokeWidth="1.5" fill="none"/><path d="M23 20 Q26 26 20 26" strokeLinecap="round" strokeWidth="1.5" fill="none"/><path d="M17 20 Q14 14 20 14" strokeLinecap="round" strokeWidth="1.5" fill="none"/></svg>
    case 'Damper':
      return <svg {...props}><rect x="4" y="8" width="32" height="24" rx="2" strokeWidth="1.5"/><path d="M8 32 L32 8" strokeWidth="2" strokeLinecap="round"/><path d="M8 26 L26 8 M14 32 L32 14" strokeWidth="1" strokeLinecap="round" opacity="0.5"/></svg>
    case 'CO2 Sensor':
      return <svg {...props}><rect x="8" y="8" width="24" height="24" rx="3" strokeWidth="1.5"/><path d="M12 24 Q12 20 14 18 Q16 16 18 18 Q20 20 20 20" strokeLinecap="round" strokeWidth="1.5" fill="none"/><path d="M22 16 Q24 14 26 16 Q28 18 28 20 Q28 22 26 24 Q24 26 22 24 Q20 22 20 20" strokeLinecap="round" strokeWidth="1.5" fill="none"/></svg>
    case 'VRF Indoor Unit':
      return <svg {...props}><rect x="4" y="14" width="32" height="12" rx="6" strokeWidth="1.5"/><path d="M10 17 L10 23 M14 16 L14 24 M18 15 L18 25 M22 15 L22 25 M26 16 L26 24 M30 17 L30 23" strokeWidth="1" strokeLinecap="round" opacity="0.6"/><path d="M8 10 Q20 6 32 10" strokeLinecap="round" strokeWidth="1.5" fill="none"/></svg>
    case 'VRF Outdoor Unit':
      return <svg {...props}><rect x="4" y="8" width="32" height="28" rx="2" strokeWidth="1.5"/><circle cx="20" cy="24" r="8" strokeWidth="1.5"/><path d="M20 18 L20 30 M14 24 L26 24 M15.8 19.8 L24.2 28.2 M24.2 19.8 L15.8 28.2" strokeWidth="1" strokeLinecap="round"/><path d="M8 8 L8 4 M14 8 L14 4 M20 8 L20 4 M26 8 L26 4 M32 8 L32 4" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'Chiller':
      return <svg {...props}><ellipse cx="20" cy="22" rx="14" ry="10" strokeWidth="1.5"/><ellipse cx="20" cy="16" rx="14" ry="6" strokeWidth="1.5"/><path d="M6 22 L6 16 M34 22 L34 16" strokeWidth="1.5"/><path d="M20 8 L20 4 M16 30 L16 36 M24 30 L24 36" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'Boiler':
      return <svg {...props}><rect x="8" y="10" width="24" height="22" rx="12" strokeWidth="1.5"/><path d="M14 22 Q16 18 18 22 Q20 26 22 22 Q24 18 26 22" strokeLinecap="round" strokeWidth="1.5" fill="none"/><path d="M14 8 L14 10 M20 6 L20 10 M26 8 L26 10" strokeWidth="1.5" strokeLinecap="round"/><path d="M14 32 L14 36 M26 32 L26 36" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'BACnet Controller':
      return <svg {...props}><rect x="4" y="10" width="32" height="20" rx="2" strokeWidth="1.5"/><rect x="8" y="14" width="8" height="6" rx="1" strokeWidth="1.5"/><circle cx="24" cy="16" r="1.5" fill="currentColor"/><circle cx="29" cy="16" r="1.5" fill="currentColor"/><circle cx="24" cy="22" r="1.5" fill="currentColor"/><circle cx="29" cy="22" r="1.5" fill="currentColor"/><path d="M4 20 L0 20 M36 17 L40 17 M36 23 L40 23" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'Zone Controller':
      return <svg {...props}><rect x="6" y="8" width="28" height="24" rx="2" strokeWidth="1.5"/><path d="M6 20 L34 20" strokeWidth="1" strokeDasharray="3 2"/><rect x="10" y="12" width="8" height="5" rx="1" strokeWidth="1"/><rect x="22" y="12" width="8" height="5" rx="1" strokeWidth="1"/><rect x="10" y="23" width="8" height="5" rx="1" strokeWidth="1"/><rect x="22" y="23" width="8" height="5" rx="1" strokeWidth="1"/></svg>
    case 'Humidifier':
      return <svg {...props}><path d="M20 6 Q28 16 28 22 Q28 30 20 34 Q12 30 12 22 Q12 16 20 6 Z" strokeWidth="1.5" fill="none"/><path d="M14 24 Q16 20 18 24 M20 22 Q22 18 24 22" strokeLinecap="round" strokeWidth="1.5" fill="none"/></svg>
    // ── Electrical ─────────────────────────────────────────────────────────────
    case 'Sub Panel':
      return <svg {...props}><rect x="12" y="4" width="16" height="32" rx="2" strokeWidth="1.5"/><path d="M16 10 L24 10 M16 14 L24 14 M16 18 L24 18 M16 22 L24 22 M16 26 L22 26" strokeWidth="1" strokeLinecap="round"/><path d="M12 20 L8 20 M28 20 L32 20" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'Transformer':
      return <svg {...props}><circle cx="14" cy="20" r="8" strokeWidth="1.5" fill="none"/><circle cx="26" cy="20" r="8" strokeWidth="1.5" fill="none"/><path d="M4 20 L6 20 M34 20 L36 20 M4 14 L4 26 M36 14 L36 26" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'UPS':
      return <svg {...props}><rect x="4" y="10" width="32" height="20" rx="2" strokeWidth="1.5"/><rect x="12" y="14" width="16" height="8" rx="1" strokeWidth="1.5"/><path d="M19 16 L17 20 L20 20 L21 24 L23 20 L20 20" fill="currentColor" strokeWidth="0.5"/><path d="M14 30 L14 34 M26 30 L26 34" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'Generator':
      return <svg {...props}><rect x="4" y="12" width="32" height="16" rx="2" strokeWidth="1.5"/><circle cx="20" cy="20" r="6" strokeWidth="1.5"/><circle cx="20" cy="20" r="2.5" fill="currentColor"/><path d="M8 15 L8 25 M32 15 L32 25" strokeWidth="1" strokeLinecap="round"/><path d="M14 8 L20 12 M26 8 L20 12" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'Transfer Switch':
      return <svg {...props}><path d="M8 12 L8 20" strokeWidth="2" strokeLinecap="round"/><path d="M32 28 L32 20" strokeWidth="2" strokeLinecap="round"/><circle cx="8" cy="10" r="3" strokeWidth="1.5"/><circle cx="32" cy="30" r="3" strokeWidth="1.5"/><path d="M8 20 L32 20" strokeDasharray="3 2" strokeWidth="1.5"/><path d="M8 20 L20 10 M32 20 L20 30" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'Junction Box':
      return <svg {...props}><rect x="8" y="8" width="24" height="24" rx="2" strokeWidth="1.5"/><path d="M8 20 L4 20 M32 20 L36 20 M20 8 L20 4 M20 32 L20 36" strokeWidth="1.5" strokeLinecap="round"/><circle cx="20" cy="20" r="3" strokeWidth="1.5"/></svg>
    case 'Light Switch':
      return <svg {...props}><rect x="10" y="6" width="20" height="28" rx="3" strokeWidth="1.5"/><rect x="16" y="10" width="8" height="12" rx="2" strokeWidth="1.5"/><circle cx="20" cy="28" r="2" strokeWidth="1.5"/></svg>
    case 'Dimmer':
      return <svg {...props}><rect x="10" y="6" width="20" height="28" rx="3" strokeWidth="1.5"/><path d="M14 20 L26 20" strokeWidth="2" strokeLinecap="round"/><circle cx="20" cy="20" r="3" strokeWidth="1.5" fill="white"/><path d="M15 14 Q20 10 25 14" strokeLinecap="round" strokeWidth="1.5" fill="none"/><circle cx="20" cy="28" r="1.5" strokeWidth="1.5"/></svg>
    case 'GFCI Outlet':
      return <svg {...props}><rect x="10" y="6" width="20" height="28" rx="3" strokeWidth="1.5"/><path d="M17 14 L17 18 M23 14 L23 18" strokeWidth="2" strokeLinecap="round"/><rect x="15" y="20" width="4" height="2.5" rx="0.5" strokeWidth="1"/><rect x="21" y="20" width="4" height="2.5" rx="0.5" strokeWidth="1"/><path d="M15 26 Q20 29 25 26" strokeLinecap="round" strokeWidth="1.5" fill="none"/></svg>
    case 'Circuit Breaker':
      return <svg {...props}><rect x="12" y="4" width="16" height="32" rx="2" strokeWidth="1.5"/><path d="M16 18 L24 18" strokeWidth="1.5" strokeLinecap="round"/><path d="M20 10 L20 18 M20 22 L20 30" strokeWidth="2" strokeLinecap="round"/><circle cx="20" cy="20" r="2" fill="currentColor"/></svg>
    case 'EV Charger':
      return <svg {...props}><rect x="8" y="6" width="24" height="28" rx="3" strokeWidth="1.5"/><path d="M18 12 L16 20 L20 20 L20 28 L24 20 L20 20" fill="currentColor" strokeWidth="0.5"/><path d="M12 30 L12 36 M28 30 L28 36" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'Disconnect':
      return <svg {...props}><path d="M20 8 L20 16" strokeWidth="2.5" strokeLinecap="round"/><path d="M20 24 L20 32" strokeWidth="2.5" strokeLinecap="round"/><path d="M20 16 L28 20" strokeWidth="2" strokeLinecap="round"/><circle cx="20" cy="16" r="2.5" fill="currentColor"/><circle cx="20" cy="24" r="2.5" fill="currentColor"/></svg>
    // ── DAS ────────────────────────────────────────────────────────────────────
    case 'BDA':
      return <svg {...props}><path d="M8 28 L18 20 L36 20" strokeWidth="0" fill="none"/><path d="M6 28 L18 14 L18 26 Z" strokeWidth="1.5" fill="none"/><rect x="18" y="16" width="16" height="8" rx="1" strokeWidth="1.5"/><path d="M34 20 L40 20" strokeWidth="1.5" strokeLinecap="round"/><path d="M6 20 L2 20" strokeWidth="1.5" strokeLinecap="round"/><path d="M38 17 L40 20 L38 23" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" fill="none"/></svg>
    case 'Donor Antenna':
      return <svg {...props}><path d="M20 36 L20 20" strokeWidth="2" strokeLinecap="round"/><path d="M12 28 Q20 20 28 28" strokeLinecap="round" strokeWidth="1.5" fill="none"/><path d="M8 22 Q20 10 32 22" strokeLinecap="round" strokeWidth="1.5" fill="none"/><path d="M4 16 Q20 0 36 16" strokeLinecap="round" strokeWidth="1.5" fill="none"/><circle cx="20" cy="36" r="2" fill="currentColor"/></svg>
    case 'Omni Antenna':
      return <svg {...props}><path d="M20 36 L20 10" strokeWidth="2" strokeLinecap="round"/><ellipse cx="20" cy="22" rx="8" ry="3" strokeWidth="1.5" fill="none"/><ellipse cx="20" cy="16" rx="5" ry="2" strokeWidth="1" fill="none"/><ellipse cx="20" cy="28" rx="5" ry="2" strokeWidth="1" fill="none"/><circle cx="20" cy="36" r="2" fill="currentColor"/></svg>
    case 'Directional Antenna':
      return <svg {...props}><path d="M10 20 L30 20" strokeWidth="2.5" strokeLinecap="round"/><path d="M10 14 L26 20 L10 26 Z" strokeWidth="1.5" fill="none"/><path d="M30 16 L36 16 M30 20 L38 20 M30 24 L36 24" strokeWidth="1.5" strokeLinecap="round"/><path d="M10 20 L6 20" strokeWidth="2" strokeLinecap="round"/></svg>
    case 'Splitter':
      return <svg {...props}><path d="M6 20 L20 20" strokeWidth="2" strokeLinecap="round"/><path d="M20 20 L34 12" strokeWidth="1.5" strokeLinecap="round"/><path d="M20 20 L34 28" strokeWidth="1.5" strokeLinecap="round"/><circle cx="6" cy="20" r="3" strokeWidth="1.5"/><circle cx="34" cy="12" r="2.5" strokeWidth="1.5"/><circle cx="34" cy="28" r="2.5" strokeWidth="1.5"/></svg>
    case 'Coupler':
      return <svg {...props}><rect x="12" y="12" width="16" height="16" rx="2" strokeWidth="1.5"/><path d="M4 16 L12 16 M4 24 L12 24 M28 16 L36 16 M28 24 L36 24" strokeWidth="1.5" strokeLinecap="round"/><path d="M16 16 L24 24" strokeWidth="1" strokeDasharray="2 2"/></svg>
    case 'Fiber Node':
      return <svg {...props}><circle cx="20" cy="20" r="7" strokeWidth="1.5"/><path d="M20 13 L20 6 M26.9 16.5 L33 12 M26.9 23.5 L33 28 M20 27 L20 34 M13.1 23.5 L7 28 M13.1 16.5 L7 12" strokeWidth="1.5" strokeLinecap="round"/><circle cx="20" cy="20" r="2.5" fill="currentColor"/></svg>
    case 'Remote Unit':
      return <svg {...props}><rect x="6" y="12" width="22" height="16" rx="2" strokeWidth="1.5"/><path d="M28 20 L36 16 M28 20 L36 24" strokeWidth="1.5" strokeLinecap="round"/><path d="M30 12 Q36 12 36 16" strokeLinecap="round" strokeWidth="1.2" fill="none"/><path d="M30 28 Q36 28 36 24" strokeLinecap="round" strokeWidth="1.2" fill="none"/><circle cx="14" cy="20" r="2" fill="currentColor"/><path d="M6 16 L6 24" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'Head End':
      return <svg {...props}><rect x="6" y="6" width="28" height="28" rx="2" strokeWidth="1.5"/><rect x="10" y="10" width="20" height="4" rx="1" strokeWidth="1"/><rect x="10" y="17" width="20" height="4" rx="1" strokeWidth="1"/><rect x="10" y="24" width="20" height="4" rx="1" strokeWidth="1"/><path d="M30 12 L34 12 M30 19 L34 19 M30 26 L34 26" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'Small Cell':
      return <svg {...props}><path d="M20 36 L20 20" strokeWidth="2" strokeLinecap="round"/><rect x="14" y="20" width="12" height="10" rx="2" strokeWidth="1.5"/><path d="M14 28 Q20 32 26 28" strokeLinecap="round" strokeWidth="1" fill="none"/><path d="M14 24 L10 22 M26 24 L30 22" strokeLinecap="round" strokeWidth="1.2"/><circle cx="20" cy="36" r="2" fill="currentColor"/></svg>
    case 'Attenuator':
      return <svg {...props}><path d="M4 20 L12 20" strokeWidth="2" strokeLinecap="round"/><rect x="12" y="14" width="16" height="12" rx="2" strokeWidth="1.5"/><path d="M28 20 L36 20" strokeWidth="2" strokeLinecap="round"/><path d="M16 24 L24 16" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'Terminator':
      return <svg {...props}><path d="M4 20 L20 20" strokeWidth="2" strokeLinecap="round"/><circle cx="26" cy="20" r="6" strokeWidth="1.5"/><path d="M22 24 L30 16 M22 16 L30 24" strokeWidth="1.5" strokeLinecap="round"/></svg>
    default:
      return <svg {...props}><rect x="10" y="10" width="20" height="20" rx="4" strokeWidth="1.5"/><circle cx="20" cy="20" r="4" strokeWidth="1.5"/></svg>
  }
}
