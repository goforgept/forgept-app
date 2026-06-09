import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'

const INDUSTRY_LABELS = {
  all:         'All',
  security:    'Security',
  fire_alarm:  'Fire Alarm',
  av:          'AV',
  hvac:        'HVAC',
  electrical:  'Electrical',
  low_voltage: 'Low Voltage',
}

export default function SymbolPicker({ selectedSymbol, onSelect, orgId }) {
  const [industry,      setIndustry]      = useState('all')
  const [manufacturer,  setManufacturer]  = useState('Generic')
  const [category,      setCategory]      = useState(null)
  const [search,        setSearch]        = useState('')
  const [manufacturers, setManufacturers] = useState([])
  const [categories,    setCategories]    = useState([])
  const [symbols,       setSymbols]       = useState([])
  const [loading,       setLoading]       = useState(false)
  const [allProducts,   setAllProducts]   = useState([])

  // Load global + org products on mount
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true)
      const [{ data: global }, { data: org }] = await Promise.all([
        supabase.from('global_products').select('*').eq('is_active', true).order('category').order('name'),
        orgId ? supabase.from('org_products').select('*').eq('org_id', orgId).eq('is_active', true).order('name') : Promise.resolve({ data: [] }),
      ])
      setAllProducts([...(global || []), ...(org || []).map(p => ({ ...p, is_custom: true }))])
      setLoading(false)
    }
    loadAll()
  }, [])

  // Derive manufacturers from allProducts client-side
  useEffect(() => {
    const filtered = industry === 'all' ? allProducts : allProducts.filter(p => p.industry === industry)
    const unique = [...new Set(filtered.map(r => r.manufacturer))].sort()
    setManufacturers(['Generic', ...unique.filter(m => m !== 'Generic')])
    setManufacturer('Generic')
    setCategory(null)
  }, [industry, allProducts])

  // Derive categories client-side
  useEffect(() => {
    const filtered = allProducts.filter(p => {
      if (industry !== 'all' && p.industry !== industry) return false
      if (manufacturer && p.manufacturer !== manufacturer) return false
      return true
    })
    setCategories([...new Set(filtered.map(r => r.category))].sort())
    setCategory(null)
  }, [manufacturer, industry, allProducts])

  // Derive symbols client-side
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

  return (
    <div className="flex flex-col h-full bg-[#0F1C2E]">

      {/* Industry */}
      <div className="px-3 pt-3 pb-2 border-b border-[#2a3d55]">
        <p className="text-xs font-medium text-[#8A9AB0] mb-2">Industry</p>
        <div className="flex flex-wrap gap-1">
          {Object.entries(INDUSTRY_LABELS).map(([key, label]) => (
            <button key={key} onClick={() => setIndustry(key)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                industry === key ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Manufacturer */}
      <div className="px-3 py-2 border-b border-[#2a3d55]">
        <p className="text-xs font-medium text-[#8A9AB0] mb-2">Manufacturer</p>
        <select value={manufacturer} onChange={e => setManufacturer(e.target.value)}
          className="w-full text-xs border border-[#2a3d55] rounded-lg px-2 py-1.5 bg-[#1a2d45] text-white focus:outline-none focus:border-[#C8622A]">
          {manufacturers.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Category — only show when a specific industry is selected */}
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

      {/* Search */}
      <div className="px-3 py-2 border-b border-[#2a3d55]">
        <input type="text" placeholder="Search name or part #..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full text-xs border border-[#2a3d55] rounded-lg px-2 py-1.5 bg-[#1a2d45] text-white placeholder-[#8A9AB0] focus:outline-none focus:border-[#C8622A]" />
      </div>

      {/* Symbol grid */}
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
                onSelect={() => onSelect(selectedSymbol?.id === symbol.id ? null : symbol)} />
            ))}
          </div>
        )}
      </div>

      {/* Selected info */}
      {selectedSymbol && (
        <div className="px-3 py-2 border-t border-[#2a3d55] bg-[#C8622A]/10">
          <p className="text-xs font-medium text-[#C8622A] truncate">{selectedSymbol.name}</p>
          <p className="text-xs text-[#C8622A]/70 font-mono truncate">{selectedSymbol.part_number}</p>
          <p className="text-xs text-[#8A9AB0] mt-0.5">Click floor plan to place</p>
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
    default:
      return <svg {...props}><rect x="10" y="10" width="20" height="20" rx="4" strokeWidth="1.5"/><circle cx="20" cy="20" r="4" strokeWidth="1.5"/></svg>
  }
}