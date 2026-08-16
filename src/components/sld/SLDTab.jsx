import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Position,
  Handle,
  Panel,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { supabase } from '../../supabase'
import { CategoryIcon } from '../drawing/SymbolPicker'

// Maps SLD category names → SymbolPicker CategoryIcon category names
const CATEGORY_ICON_MAP = {
  'Camera':                   'Dome Camera',
  'NVR':                      'NVR',
  'DVR':                      'NVR',
  'Network Switch':           'Network',
  'Router':                   'Network',
  'Internet / ISP':           'Point to Point',
  'PoE Injector':             'Power Box',
  'Patch Panel':              'Network',
  'Access Control Panel':     'Controller',
  'Access Control Enclosure': 'Cabinet System',
  'Door Reader':              'Access Reader',
  'Door Contact':             'Door Contact',
  'Request to Exit':          'PIR Detector',
  'Electric Lock':            'Door Operator',
  'Video Intercom':           'Video Conference',
  'Alarm Panel':              'Alarm Panel',
  'Motion Sensor':            'Motion Sensor',
  'Smoke Detector':           'Interior Siren',
  'UPS / Battery Backup':     'UPS',
  'Power Supply':             'Power Box',
  'Wireless Access Point':    'Point to Point',
  'Server':                   'Head End',
  'Fiber Converter':          'Fiber Node',
  'Speaker':                  'Speaker',
  'Monitor / Display':        'Display',
  'Other':                    'Other',
}

// Traditional SLD uses muted, print-safe colors — not web UI colors
const CATEGORY_COLORS = {
  'Camera':                   '#1e40af',
  'NVR':                      '#1e3a5f',
  'DVR':                      '#1e3a5f',
  'Network Switch':           '#065f46',
  'Router':                   '#065f46',
  'Internet / ISP':           '#1e3a5f',
  'PoE Injector':             '#064e3b',
  'Patch Panel':              '#374151',
  'Access Control Panel':     '#78350f',
  'Access Control Enclosure': '#78350f',
  'Door Reader':              '#92400e',
  'Door Contact':             '#991b1b',
  'Request to Exit':          '#991b1b',
  'Electric Lock':            '#4c1d95',
  'Video Intercom':           '#1e40af',
  'Alarm Panel':              '#7f1d1d',
  'Motion Sensor':            '#7f1d1d',
  'Smoke Detector':           '#7f1d1d',
  'UPS / Battery Backup':     '#064e3b',
  'Power Supply':             '#064e3b',
  'Wireless Access Point':    '#1e40af',
  'Server':                   '#1e3a5f',
  'Fiber Converter':          '#065f46',
  'Speaker':                  '#4c1d95',
  'Monitor / Display':        '#1e3a5f',
  'Other':                    '#374151',
}

const QUICK_ADD_CATEGORIES = [
  // Network / Infrastructure
  'Internet / ISP', 'Router', 'Network Switch', 'Wireless Access Point', 'Patch Panel', 'PoE Injector',
  // Video
  'Camera', 'NVR', 'DVR', 'Server',
  // Access Control
  'Access Control Panel', 'Access Control Enclosure', 'Door Reader', 'Door Contact', 'Request to Exit', 'Electric Lock',
  // Other
  'Video Intercom', 'Alarm Panel', 'Motion Sensor', 'Power Supply', 'UPS / Battery Backup', 'Fiber Converter', 'Other',
]

const WIRE_TYPES = [
  { value: 'default',  label: 'Default' },
  { value: 'network',  label: 'CAT6/Network' },
  { value: 'power',    label: 'Power' },
  { value: 'fiber',    label: 'Fiber' },
  { value: 'wireless', label: 'Wireless' },
  { value: 'rs485',    label: 'RS-485' },
]

// Traditional SLD wire colors — dark, print-safe
const WIRE_COLORS = {
  default:  '#111827',
  network:  '#1e3a8a',
  power:    '#7f1d1d',
  fiber:    '#14532d',
  wireless: '#4a044e',
  rs485:    '#78350f',
}

const WIRE_DASH = {
  default:  'none',
  network:  'none',
  power:    '6 2',
  fiber:    '10 4',
  wireless: '3 4',
  rs485:    '6 2 2 2',
}

const WIRE_STROKE_WIDTH = {
  default:  1.5,
  network:  1.5,
  power:    2.5,
  fiber:    1.5,
  wireless: 1.5,
  rs485:    1.5,
}

// Short cable-type labels shown next to each wire on the canvas and PDF
const WIRE_LABELS = {
  default:  'CAT6',
  network:  'CAT6',
  power:    'Power',
  fiber:    'Fiber',
  wireless: 'Wireless',
  rs485:    'RS-485',
}

// ─── Pre-built installation typicals ─────────────────────────────────────────
const BUILT_IN_TYPICALS = [
  {
    id: 'builtin-single-door',
    name: 'Typical Single Door',
    description: 'Card reader, REX, door contact + electric lock wired to an access control panel',
    sld_typical_nodes: [
      { id: 'n1', label: 'Card Reader',         node_type: 'device', position_x: 0,   position_y: 0,   data: { category: 'Door Reader',          quantity: 1 } },
      { id: 'n2', label: 'REX',                 node_type: 'device', position_x: 200, position_y: 0,   data: { category: 'Request to Exit',      quantity: 1 } },
      { id: 'n3', label: 'Door Contact',        node_type: 'device', position_x: 400, position_y: 0,   data: { category: 'Door Contact',         quantity: 1 } },
      { id: 'n4', label: 'Electric Lock',       node_type: 'device', position_x: 600, position_y: 0,   data: { category: 'Electric Lock',        quantity: 1 } },
      { id: 'n5', label: 'Access Control Panel',node_type: 'device', position_x: 200, position_y: 220, data: { category: 'Access Control Panel', quantity: 1 } },
    ],
    sld_typical_edges: [
      { id: 'e1', source_node_id: 'n1', target_node_id: 'n5', wire_type: 'rs485' },
      { id: 'e2', source_node_id: 'n2', target_node_id: 'n5', wire_type: 'rs485' },
      { id: 'e3', source_node_id: 'n3', target_node_id: 'n5', wire_type: 'default' },
      { id: 'e4', source_node_id: 'n4', target_node_id: 'n5', wire_type: 'power' },
    ],
  },
  {
    id: 'builtin-double-door',
    name: 'Typical Double Door',
    description: 'Two readers, two REX, two contacts + two locks into one access control panel',
    sld_typical_nodes: [
      { id: 'n1', label: 'Card Reader A',       node_type: 'device', position_x: 0,   position_y: 0,   data: { category: 'Door Reader',          quantity: 1 } },
      { id: 'n2', label: 'REX A',               node_type: 'device', position_x: 200, position_y: 0,   data: { category: 'Request to Exit',      quantity: 1 } },
      { id: 'n3', label: 'Door Contact A',      node_type: 'device', position_x: 400, position_y: 0,   data: { category: 'Door Contact',         quantity: 1 } },
      { id: 'n4', label: 'Electric Lock A',     node_type: 'device', position_x: 600, position_y: 0,   data: { category: 'Electric Lock',        quantity: 1 } },
      { id: 'n5', label: 'Card Reader B',       node_type: 'device', position_x: 0,   position_y: 200, data: { category: 'Door Reader',          quantity: 1 } },
      { id: 'n6', label: 'REX B',               node_type: 'device', position_x: 200, position_y: 200, data: { category: 'Request to Exit',      quantity: 1 } },
      { id: 'n7', label: 'Door Contact B',      node_type: 'device', position_x: 400, position_y: 200, data: { category: 'Door Contact',         quantity: 1 } },
      { id: 'n8', label: 'Electric Lock B',     node_type: 'device', position_x: 600, position_y: 200, data: { category: 'Electric Lock',        quantity: 1 } },
      { id: 'n9', label: 'Access Control Panel',node_type: 'device', position_x: 200, position_y: 420, data: { category: 'Access Control Panel', quantity: 1 } },
    ],
    sld_typical_edges: [
      { id: 'e1', source_node_id: 'n1', target_node_id: 'n9', wire_type: 'rs485' },
      { id: 'e2', source_node_id: 'n2', target_node_id: 'n9', wire_type: 'rs485' },
      { id: 'e3', source_node_id: 'n3', target_node_id: 'n9', wire_type: 'default' },
      { id: 'e4', source_node_id: 'n4', target_node_id: 'n9', wire_type: 'power' },
      { id: 'e5', source_node_id: 'n5', target_node_id: 'n9', wire_type: 'rs485' },
      { id: 'e6', source_node_id: 'n6', target_node_id: 'n9', wire_type: 'rs485' },
      { id: 'e7', source_node_id: 'n7', target_node_id: 'n9', wire_type: 'default' },
      { id: 'e8', source_node_id: 'n8', target_node_id: 'n9', wire_type: 'power' },
    ],
  },
  {
    id: 'builtin-ip-camera',
    name: 'Typical IP Camera',
    description: 'Camera on a PoE network switch, feeding an NVR',
    sld_typical_nodes: [
      { id: 'n1', label: 'Camera',        node_type: 'device', position_x: 0, position_y: 0,   data: { category: 'Camera',         quantity: 1 } },
      { id: 'n2', label: 'Network Switch',node_type: 'device', position_x: 0, position_y: 220, data: { category: 'Network Switch',  quantity: 1 } },
      { id: 'n3', label: 'NVR',           node_type: 'device', position_x: 0, position_y: 440, data: { category: 'NVR',            quantity: 1 } },
    ],
    sld_typical_edges: [
      { id: 'e1', source_node_id: 'n1', target_node_id: 'n2', wire_type: 'network' },
      { id: 'e2', source_node_id: 'n2', target_node_id: 'n3', wire_type: 'network' },
    ],
  },
  {
    id: 'builtin-network-closet',
    name: 'Typical Network Closet',
    description: 'Internet/ISP into router, then switch, with UPS backup power',
    sld_typical_nodes: [
      { id: 'n1', label: 'Internet / ISP', node_type: 'device', position_x: 0,   position_y: 0,   data: { category: 'Internet / ISP',       quantity: 1 } },
      { id: 'n2', label: 'Router',         node_type: 'device', position_x: 0,   position_y: 220, data: { category: 'Router',               quantity: 1 } },
      { id: 'n3', label: 'Network Switch', node_type: 'device', position_x: 0,   position_y: 440, data: { category: 'Network Switch',       quantity: 1 } },
      { id: 'n4', label: 'UPS',            node_type: 'device', position_x: 220, position_y: 440, data: { category: 'UPS / Battery Backup', quantity: 1 } },
    ],
    sld_typical_edges: [
      { id: 'e1', source_node_id: 'n1', target_node_id: 'n2', wire_type: 'network' },
      { id: 'e2', source_node_id: 'n2', target_node_id: 'n3', wire_type: 'network' },
      { id: 'e3', source_node_id: 'n4', target_node_id: 'n3', wire_type: 'power' },
    ],
  },
  {
    id: 'builtin-video-intercom',
    name: 'Typical Video Intercom',
    description: 'Video intercom at entry point wired to access control panel and network switch',
    sld_typical_nodes: [
      { id: 'n1', label: 'Video Intercom',      node_type: 'device', position_x: 0,   position_y: 0,   data: { category: 'Video Intercom',       quantity: 1 } },
      { id: 'n2', label: 'Access Control Panel',node_type: 'device', position_x: 220, position_y: 0,   data: { category: 'Access Control Panel', quantity: 1 } },
      { id: 'n3', label: 'Network Switch',      node_type: 'device', position_x: 110, position_y: 220, data: { category: 'Network Switch',       quantity: 1 } },
    ],
    sld_typical_edges: [
      { id: 'e1', source_node_id: 'n1', target_node_id: 'n3', wire_type: 'network' },
      { id: 'e2', source_node_id: 'n2', target_node_id: 'n3', wire_type: 'network' },
    ],
  },
]

// ─── Draggable device button (desktop drag + tablet touch) ───────────────────

function DraggableDeviceButton({ category, name, globalProductId, onClick, children }) {
  const touchStartRef  = useRef(null)
  const ghostRef       = useRef(null)
  const isDraggingRef  = useRef(false)
  const btnRef         = useRef(null)

  useEffect(() => {
    return () => { if (ghostRef.current) { ghostRef.current.remove(); ghostRef.current = null } }
  }, [])

  useEffect(() => {
    const el = btnRef.current
    if (!el) return
    const onMove = (e) => {
      if (!touchStartRef.current) return
      const t = e.touches[0]
      const dx = t.clientX - touchStartRef.current.x
      const dy = t.clientY - touchStartRef.current.y
      if (isDraggingRef.current || Math.sqrt(dx * dx + dy * dy) > 8) e.preventDefault()
    }
    el.addEventListener('touchmove', onMove, { passive: false })
    return () => el.removeEventListener('touchmove', onMove)
  }, [])

  const handleDragStart = (e) => {
    e.dataTransfer.setData('application/sld-device', JSON.stringify({ category, name, globalProductId }))
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleTouchStart = (e) => {
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY }
    isDraggingRef.current = false
  }

  const handleTouchMove = (e) => {
    if (!touchStartRef.current) return
    const t = e.touches[0]
    const dx = t.clientX - touchStartRef.current.x
    const dy = t.clientY - touchStartRef.current.y
    if (Math.sqrt(dx * dx + dy * dy) > 8 && !isDraggingRef.current) {
      isDraggingRef.current = true
      const ghost = document.createElement('div')
      ghost.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;background:#0F1923;border:1.5px solid #C8622A;border-radius:6px;padding:4px 10px;color:white;font-size:12px;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.6);transform:translate(-50%,-120%);'
      ghost.textContent = name || category
      document.body.appendChild(ghost)
      ghostRef.current = ghost
    }
    if (ghostRef.current) {
      ghostRef.current.style.left = `${t.clientX}px`
      ghostRef.current.style.top  = `${t.clientY}px`
    }
  }

  const handleTouchEnd = (e) => {
    if (ghostRef.current) { ghostRef.current.remove(); ghostRef.current = null }
    if (isDraggingRef.current) {
      e.preventDefault()
      const t = e.changedTouches[0]
      window.dispatchEvent(new CustomEvent('forgept-sld-drop', {
        detail: { category, name, globalProductId, clientX: t.clientX, clientY: t.clientY },
      }))
    } else {
      onClick?.()
    }
    touchStartRef.current = null
    isDraggingRef.current = false
  }

  return (
    <button
      ref={btnRef}
      draggable
      onDragStart={handleDragStart}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onClick={onClick}
      className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-[#8A9AB0] hover:text-white hover:bg-[#2a3d55] transition-colors text-xs cursor-grab active:cursor-grabbing"
    >
      {children}
    </button>
  )
}

// ─── Handle + canvas styles ───────────────────────────────────────────────────
const CANVAS_STYLE = `
  /* Handles: small dark squares at node edges, orange on hover */
  .react-flow__handle {
    width: 12px !important;
    height: 12px !important;
    border-radius: 2px !important;
    border: 1.5px solid #374151 !important;
    background: #ffffff !important;
    transition: background 0.12s, border-color 0.12s !important;
    z-index: 10 !important;
  }
  .react-flow__handle:hover,
  .react-flow__handle.connecting {
    background: #C8622A !important;
    border-color: #C8622A !important;
    cursor: crosshair !important;
  }
  .react-flow__handle-top    { top: -6px !important; }
  .react-flow__handle-bottom { bottom: -6px !important; }

  /* Edge labels readable on white canvas */
  .react-flow__edge-textwrapper text {
    fill: #374151 !important;
    font-size: 10px !important;
    font-family: monospace !important;
  }
  .react-flow__edge-textbg { fill: #f9fafb !important; }

  /* Controls sit over the light canvas */
  .react-flow__controls { box-shadow: 0 1px 4px rgba(0,0,0,0.15) !important; border-radius: 4px !important; }
  .react-flow__controls-button { background: #ffffff !important; border-color: #d1d5db !important; fill: #374151 !important; }
  .react-flow__controls-button:hover { background: #f3f4f6 !important; }
  .react-flow__minimap { border: 1px solid #d1d5db !important; border-radius: 4px !important; }
`

// ─── Custom Node — traditional SLD style ─────────────────────────────────────

function DeviceNode({ data, selected }) {
  const color   = CATEGORY_COLORS[data.category] || '#374151'
  const iconCat = CATEGORY_ICON_MAP[data.category] || data.category || 'Other'
  return (
    <div
      className="select-none"
      style={{
        background: '#ffffff',
        border: selected ? '2px solid #C8622A' : '1.5px solid #374151',
        borderTop: selected ? '2px solid #C8622A' : `3px solid ${color}`,
        boxShadow: selected ? '0 0 0 2px rgba(200,98,42,0.25)' : '0 1px 3px rgba(0,0,0,0.12)',
        width: 160,
        fontFamily: 'sans-serif',
      }}
    >
      <Handle type="target" position={Position.Top} title="Drop connection here" />

      {/* Symbol + category row */}
      <div style={{ padding: '8px 10px 4px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ color, flexShrink: 0, opacity: 0.85 }}>
          <CategoryIcon category={iconCat} size={28} />
        </div>
        <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.2 }}>
          {data.category || 'Device'}
        </span>
      </div>

      {/* Device label */}
      <div style={{ padding: '5px 10px 7px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#111827', lineHeight: 1.3, margin: 0 }}>{data.label}</p>
        {(data.quantity > 1 || data.notes) && (
          <p style={{ fontSize: 10, color: '#6b7280', margin: '2px 0 0', lineHeight: 1.2 }}>
            {data.quantity > 1 && `×${data.quantity}`}{data.quantity > 1 && data.notes && '  '}{data.notes}
          </p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} title="Drag to connect" />
    </div>
  )
}

const nodeTypes = { device: DeviceNode }

// ─── SLDTab ───────────────────────────────────────────────────────────────────

export default function SLDTab({ proposalId, orgId }) {
  const [diagramId, setDiagramId]           = useState(null)
  const [sheets, setSheets]                 = useState([])
  const [activeSheetId, setActiveSheetId]   = useState(null)
  const [nodes, setNodes, onNodesChange]    = useNodesState([])
  const [edges, setEdges, onEdgesChange]    = useEdgesState([])
  const [loading, setLoading]               = useState(true)
  const [selectedNode, setSelectedNode]     = useState(null)
  const [selectedEdge, setSelectedEdge]     = useState(null)
  const [showDevicePanel, setShowDevicePanel] = useState(true)
  const [deviceSearch, setDeviceSearch]     = useState('')
  const [globalProducts, setGlobalProducts] = useState([])
  const [autoBuilding, setAutoBuilding]     = useState(false)
  const [renaming, setRenaming]             = useState(null)
  const [newSheetName, setNewSheetName]     = useState('')
  const [edgeWireType, setEdgeWireType]     = useState('default')
  const [exporting, setExporting]           = useState(false)
  const [diagramName, setDiagramName]       = useState('Single Line Diagram')
  const [typicals, setTypicals]             = useState([])
  const [pickerTab, setPickerTab]           = useState('quick')   // 'quick' | 'library' | 'typicals'
  const [selectedNodeIds, setSelectedNodeIds] = useState(new Set())
  const [saveTypicalModal, setSaveTypicalModal] = useState(false)
  const [typicalName, setTypicalName]       = useState('')
  const [stampModal, setStampModal]         = useState(null)   // typical object to stamp
  const [stampPrefix, setStampPrefix]       = useState('')
  const [savingTypical, setSavingTypical]   = useState(false)
  const [stamping, setStamping]             = useState(false)
  const [rfInstance, setRfInstance]         = useState(null)

  useEffect(() => { init() }, [proposalId])
  useEffect(() => { if (activeSheetId) loadSheet(activeSheetId) }, [activeSheetId])

  const init = async () => {
    setLoading(true)
    try {
      // Find or create diagram for this proposal
      let { data: existing } = await supabase
        .from('sld_diagrams')
        .select('id, name, sld_sheets(id, name, sort_order)')
        .eq('proposal_id', proposalId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!existing) {
        const { data: created } = await supabase
          .from('sld_diagrams')
          .insert({ org_id: orgId, proposal_id: proposalId, name: 'Single Line Diagram' })
          .select('id')
          .single()
        if (created) {
          const { data: sheet } = await supabase
            .from('sld_sheets')
            .insert({ diagram_id: created.id, name: 'Sheet 1', sort_order: 0 })
            .select('id, name, sort_order')
            .single()
          existing = { id: created.id, sld_sheets: sheet ? [sheet] : [] }
        }
      }

      if (existing) {
        const sorted = (existing.sld_sheets || []).sort((a, b) => a.sort_order - b.sort_order)
        setDiagramId(existing.id)
        setDiagramName(existing.name || 'Single Line Diagram')
        setSheets(sorted)
        if (sorted.length > 0) setActiveSheetId(sorted[0].id)
      }

      // Load global products for device picker
      const { data: gp } = await supabase
        .from('global_products')
        .select('id, name, category, manufacturer')
        .order('category').order('name')
      setGlobalProducts(gp || [])

      // Load typicals for this org
      if (orgId) await loadTypicals(orgId)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const loadTypicals = async (oid) => {
    const { data } = await supabase
      .from('sld_typicals')
      .select(`
        id, name, description,
        sld_typical_nodes(id, label, node_type, position_x, position_y, data, global_product_id),
        sld_typical_edges(id, source_node_id, target_node_id, label, wire_type)
      `)
      .eq('org_id', oid || orgId)
      .order('name')
    setTypicals(data || [])
  }

  const saveAsTypical = async () => {
    if (!typicalName.trim() || selectedNodeIds.size === 0 || !orgId) return
    setSavingTypical(true)
    try {
      const selNodes = nodes.filter(n => selectedNodeIds.has(n.id))
      const selEdges = edges.filter(e => selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target))

      // Normalize positions to start at 0,0
      const minX = Math.min(...selNodes.map(n => n.position.x))
      const minY = Math.min(...selNodes.map(n => n.position.y))

      const { data: typical } = await supabase
        .from('sld_typicals')
        .insert({ org_id: orgId, name: typicalName.trim() })
        .select('id').single()
      if (!typical) return

      const nodeInserts = selNodes.map(n => ({
        typical_id: typical.id,
        global_product_id: n.data.global_product_id || null,
        label: n.data.label,
        node_type: 'device',
        position_x: n.position.x - minX,
        position_y: n.position.y - minY,
        data: { category: n.data.category, quantity: n.data.quantity },
      }))
      const { data: insertedNodes } = await supabase
        .from('sld_typical_nodes').insert(nodeInserts).select('id')

      const nodeIdMap = {}
      selNodes.forEach((n, i) => { nodeIdMap[n.id] = insertedNodes?.[i]?.id })

      const edgeInserts = selEdges
        .filter(e => nodeIdMap[e.source] && nodeIdMap[e.target])
        .map(e => ({
          typical_id: typical.id,
          source_node_id: nodeIdMap[e.source],
          target_node_id: nodeIdMap[e.target],
          label: e.label || null,
          wire_type: e.data?.wire_type || 'default',
        }))
      if (edgeInserts.length > 0) await supabase.from('sld_typical_edges').insert(edgeInserts)

      setSaveTypicalModal(false)
      setTypicalName('')
      await loadTypicals()
      setPickerTab('typicals')
    } catch (err) {
      console.error(err)
    } finally {
      setSavingTypical(false)
    }
  }

  const stampTypical = async (typical, prefix) => {
    if (!activeSheetId || stamping) return
    setStamping(true)
    try {
      // Offset to the right of the rightmost existing node
      const offsetX = nodes.length > 0
        ? Math.max(...nodes.map(n => n.position.x + 180)) + 60
        : 80
      const offsetY = 80

      const nodeInserts = (typical.sld_typical_nodes || []).map(tn => ({
        sheet_id: activeSheetId,
        global_product_id: tn.global_product_id || null,
        label: prefix ? `${prefix} - ${tn.label}` : tn.label,
        node_type: 'device',
        position_x: tn.position_x + offsetX,
        position_y: tn.position_y + offsetY,
        data: { ...(tn.data || {}), quantity: tn.data?.quantity || 1 },
      }))

      const { data: insertedNodes } = await supabase
        .from('sld_nodes').insert(nodeInserts).select('id, position_x, position_y, label, data')

      const nodeIdMap = {}
      ;(typical.sld_typical_nodes || []).forEach((tn, i) => {
        nodeIdMap[tn.id] = insertedNodes?.[i]?.id
      })

      const edgeInserts = (typical.sld_typical_edges || [])
        .filter(te => nodeIdMap[te.source_node_id] && nodeIdMap[te.target_node_id])
        .map(te => ({
          sheet_id: activeSheetId,
          source_node_id: nodeIdMap[te.source_node_id],
          target_node_id: nodeIdMap[te.target_node_id],
          label: te.label || null,
          wire_type: te.wire_type || 'default',
        }))
      if (edgeInserts.length > 0) await supabase.from('sld_edges').insert(edgeInserts)

      await loadSheet(activeSheetId)
      setStampModal(null)
      setStampPrefix('')
    } catch (err) {
      console.error(err)
    } finally {
      setStamping(false)
    }
  }

  const deleteTypical = async (typicalId) => {
    if (!confirm('Delete this typical? It will not affect diagrams already stamped from it.')) return
    await supabase.from('sld_typicals').delete().eq('id', typicalId)
    setTypicals(t => t.filter(t => t.id !== typicalId))
  }

  const loadSheet = async (sheetId) => {
    try {
      const [{ data: sldNodes }, { data: sldEdges }] = await Promise.all([
        supabase.from('sld_nodes').select('*').eq('sheet_id', sheetId),
        supabase.from('sld_edges').select('*').eq('sheet_id', sheetId),
      ])

      setNodes((sldNodes || []).map(n => ({
        id: n.id,
        type: 'device',
        position: { x: n.position_x, y: n.position_y },
        data: { label: n.label, category: n.data?.category, quantity: n.data?.quantity, notes: n.data?.notes, global_product_id: n.global_product_id },
      })))

      setEdges((sldEdges || []).map(e => {
        const wt = e.wire_type || 'default'
        return {
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
          label: e.label || WIRE_LABELS[wt] || wt,
          type: 'smoothstep',
          style: { stroke: WIRE_COLORS[wt], strokeDasharray: WIRE_DASH[wt] || 'none', strokeWidth: WIRE_STROKE_WIDTH[wt] || 1.5 },
          data: { wire_type: wt },
          markerEnd: { type: MarkerType.ArrowClosed, color: WIRE_COLORS[wt], width: 12, height: 12 },
        }
      }))

      setSelectedNode(null)
      setSelectedEdge(null)
    } catch (err) {
      console.error(err)
    }
  }

  const onConnect = useCallback(async (params) => {
    const wt = edgeWireType
    const { data: newEdge } = await supabase.from('sld_edges').insert({
      sheet_id: activeSheetId,
      source_node_id: params.source,
      target_node_id: params.target,
      wire_type: wt,
    }).select('id').single()
    if (!newEdge) return

    setEdges(eds => addEdge({
      ...params,
      id: newEdge.id,
      label: WIRE_LABELS[wt] || wt,
      type: 'smoothstep',
      style: { stroke: WIRE_COLORS[wt], strokeDasharray: WIRE_DASH[wt] || 'none', strokeWidth: WIRE_STROKE_WIDTH[wt] || 1.5 },
      data: { wire_type: wt },
      markerEnd: { type: MarkerType.ArrowClosed, color: WIRE_COLORS[wt], width: 12, height: 12 },
    }, eds))
  }, [activeSheetId, edgeWireType])

  const handleNodeDragStop = useCallback(async (_, node) => {
    await supabase.from('sld_nodes').update({ position_x: node.position.x, position_y: node.position.y }).eq('id', node.id)
  }, [])

  const addDevice = async (category, name, globalProductId = null, position = null) => {
    if (!activeSheetId) return
    const px = position?.x ?? (80 + Math.random() * 300)
    const py = position?.y ?? (80 + Math.random() * 200)
    const { data: newNode } = await supabase.from('sld_nodes').insert({
      sheet_id: activeSheetId,
      label: name || category,
      node_type: 'device',
      position_x: px,
      position_y: py,
      global_product_id: globalProductId || null,
      data: { category, quantity: 1 },
    }).select('id, position_x, position_y').single()

    if (!newNode) return
    setNodes(ns => [...ns, {
      id: newNode.id,
      type: 'device',
      position: { x: newNode.position_x, y: newNode.position_y },
      data: { label: name || category, category, quantity: 1, global_product_id: globalProductId },
    }])
  }

  // ─── Canvas drop handlers (desktop drag + touch) ──────────────────────────

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    if (!rfInstance) return
    const raw = e.dataTransfer.getData('application/sld-device')
    if (!raw) return
    try {
      const { category, name, globalProductId } = JSON.parse(raw)
      const position = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      addDevice(category, name, globalProductId, position)
    } catch {}
  }, [rfInstance, activeSheetId])

  const onTouchDrop = useCallback((e) => {
    if (!rfInstance) return
    const { category, name, globalProductId, clientX, clientY } = e.detail
    const position = rfInstance.screenToFlowPosition({ x: clientX, y: clientY })
    addDevice(category, name, globalProductId, position)
  }, [rfInstance, activeSheetId])

  const deleteSelected = useCallback(async () => {
    if (selectedNode) {
      await supabase.from('sld_nodes').delete().eq('id', selectedNode.id)
      setNodes(ns => ns.filter(n => n.id !== selectedNode.id))
      setEdges(es => es.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id))
      setSelectedNode(null)
    }
    if (selectedEdge) {
      await supabase.from('sld_edges').delete().eq('id', selectedEdge.id)
      setEdges(es => es.filter(e => e.id !== selectedEdge.id))
      setSelectedEdge(null)
    }
  }, [selectedNode, selectedEdge])

  const updateNodeData = async (field, value) => {
    if (!selectedNode) return
    const updated = { ...selectedNode, data: { ...selectedNode.data, [field]: value } }
    setSelectedNode(updated)
    setNodes(ns => ns.map(n => n.id === selectedNode.id ? updated : n))
    await supabase.from('sld_nodes').update(
      field === 'label' ? { label: value } : { data: { ...selectedNode.data, [field]: value } }
    ).eq('id', selectedNode.id)
  }

  const updateEdgeType = async (wt) => {
    if (!selectedEdge) return
    const updated = {
      ...selectedEdge,
      label: WIRE_LABELS[wt] || wt,
      style: { stroke: WIRE_COLORS[wt], strokeDasharray: WIRE_DASH[wt] || 'none', strokeWidth: WIRE_STROKE_WIDTH[wt] || 1.5 },
      data: { ...selectedEdge.data, wire_type: wt },
      markerEnd: { type: MarkerType.ArrowClosed, color: WIRE_COLORS[wt], width: 12, height: 12 },
    }
    setSelectedEdge(updated)
    setEdges(es => es.map(e => e.id === selectedEdge.id ? updated : e))
    await supabase.from('sld_edges').update({ wire_type: wt }).eq('id', selectedEdge.id)
  }

  // ─── Sheets ─────────────────────────────────────────────────────────────────

  const addSheet = async () => {
    if (!diagramId) return
    const name = `Sheet ${sheets.length + 1}`
    const { data: sheet } = await supabase.from('sld_sheets').insert({
      diagram_id: diagramId, name, sort_order: sheets.length,
    }).select('id, name, sort_order').single()
    if (!sheet) return
    setSheets(s => [...s, sheet])
    setActiveSheetId(sheet.id)
  }

  const deleteSheet = async (sheetId) => {
    if (sheets.length <= 1) return
    if (!confirm('Delete this sheet and all its nodes?')) return
    await supabase.from('sld_sheets').delete().eq('id', sheetId)
    const remaining = sheets.filter(s => s.id !== sheetId)
    setSheets(remaining)
    if (activeSheetId === sheetId) setActiveSheetId(remaining[0].id)
  }

  const renameSheet = async (sheetId, name) => {
    await supabase.from('sld_sheets').update({ name }).eq('id', sheetId)
    setSheets(s => s.map(sh => sh.id === sheetId ? { ...sh, name } : sh))
    setRenaming(null)
  }

  // ─── Auto-Build ──────────────────────────────────────────────────────────────

  const autoBuild = async () => {
    if (!confirm('Auto-Build will generate nodes from floor plan placements. Existing nodes on this sheet will be replaced. Continue?')) return
    setAutoBuilding(true)
    try {
      const { data: placements } = await supabase
        .from('drawing_placements')
        .select('id, label, device_type, drawing_sheets!inner(proposal_id)')
        .eq('drawing_sheets.proposal_id', proposalId)

      if (!placements || placements.length === 0) {
        alert('No floor plan devices found. Add devices in the Drawing tab first.')
        return
      }

      const { data: cableRuns } = await supabase
        .from('cable_runs')
        .select('id, source_placement_id, target_placement_id, cable_type')
        .eq('proposal_id', proposalId)

      await supabase.from('sld_nodes').delete().eq('sheet_id', activeSheetId)
      await supabase.from('sld_edges').delete().eq('sheet_id', activeSheetId)

      const dagre = (await import('dagre')).default
      const g = new dagre.graphlib.Graph()
      g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 50 })
      g.setDefaultEdgeLabel(() => ({}))
      placements.forEach(p => g.setNode(p.id, { width: 160, height: 70 }))

      const runs = cableRuns || []
      if (runs.length > 0) {
        runs.forEach(r => {
          if (r.source_placement_id && r.target_placement_id) {
            g.setEdge(r.source_placement_id, r.target_placement_id)
          }
        })
      } else {
        // Category-rule inference
        const byCategory = {}
        placements.forEach(p => {
          const cat = p.device_type || 'Other'
          if (!byCategory[cat]) byCategory[cat] = []
          byCategory[cat].push(p.id)
        })
        const parentMap = {
          'Camera': ['NVR', 'DVR', 'Network Switch'],
          'Door Reader': ['Access Control Panel', 'Access Control Enclosure'],
          'Door Contact': ['Access Control Panel', 'Access Control Enclosure'],
          'Request to Exit': ['Access Control Panel', 'Access Control Enclosure'],
          'Electric Lock': ['Access Control Panel', 'Access Control Enclosure'],
          'Motion Sensor': ['Alarm Panel'],
          'Smoke Detector': ['Alarm Panel'],
          'Wireless Access Point': ['Network Switch', 'Server'],
        }
        Object.entries(parentMap).forEach(([child, parentCats]) => {
          const childIds = byCategory[child] || []
          const parentIds = parentCats.flatMap(pc => byCategory[pc] || [])
          if (parentIds.length > 0) childIds.forEach(cId => g.setEdge(cId, parentIds[0]))
        })
      }

      dagre.layout(g)

      const nodeInserts = placements.map(p => {
        const pos = g.node(p.id)
        return {
          sheet_id: activeSheetId,
          label: p.label || p.device_type || 'Device',
          node_type: 'device',
          position_x: pos ? pos.x - 80 : Math.random() * 400,
          position_y: pos ? pos.y - 35 : Math.random() * 400,
          data: { category: p.device_type || 'Other', quantity: 1 },
        }
      })

      const { data: insertedNodes } = await supabase.from('sld_nodes').insert(nodeInserts).select('id')
      const placementToNode = {}
      placements.forEach((p, i) => { placementToNode[p.id] = insertedNodes?.[i]?.id })

      const edgeInserts = runs
        .filter(r => placementToNode[r.source_placement_id] && placementToNode[r.target_placement_id])
        .map(r => ({
          sheet_id: activeSheetId,
          source_node_id: placementToNode[r.source_placement_id],
          target_node_id: placementToNode[r.target_placement_id],
          wire_type: r.cable_type === 'fiber' ? 'fiber' : 'network',
        }))

      if (edgeInserts.length > 0) await supabase.from('sld_edges').insert(edgeInserts)
      await loadSheet(activeSheetId)
    } catch (err) {
      console.error('Auto-build error:', err)
      alert('Auto-build failed.')
    } finally {
      setAutoBuilding(false)
    }
  }

  // ─── PDF Export ──────────────────────────────────────────────────────────────

  const exportPDF = async () => {
    if (nodes.length === 0) { alert('Add some devices first.'); return }
    setExporting(true)
    try {
      const jsPDF = (await import('jspdf')).default

      const NODE_W = 160
      const NODE_H = 75
      const PAD    = 30

      const xs = nodes.map(n => n.position.x)
      const ys = nodes.map(n => n.position.y)
      const minX = Math.min(...xs) - PAD
      const minY = Math.min(...ys) - PAD
      const maxX = Math.max(...xs) + NODE_W + PAD
      const maxY = Math.max(...ys) + NODE_H + PAD

      const diagW = maxX - minX
      const diagH = maxY - minY

      // A3 landscape gives plenty of room
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
      const PW = 420, PH = 297
      const HEADER = 18, FOOTER = 14

      const usableW = PW - 20
      const usableH = PH - HEADER - FOOTER
      const scale = Math.min(usableW / diagW, usableH / diagH, 0.45)

      const tx = x => 10 + (x - minX) * scale
      const ty = y => HEADER + (y - minY) * scale
      const sw = NODE_W * scale
      const sh = NODE_H * scale

      // Header
      pdf.setFillColor(15, 28, 46)
      pdf.rect(0, 0, PW, HEADER - 2, 'F')
      pdf.setTextColor(200, 98, 42)
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'bold')
      pdf.text('ForgePt · Single Line Diagram', 10, 8)
      pdf.setTextColor(138, 154, 176)
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      pdf.text(diagramName, 10, 13)
      const activeSheet = sheets.find(s => s.id === activeSheetId)
      if (activeSheet) pdf.text(activeSheet.name, PW / 2, 13, { align: 'center' })
      pdf.text(new Date().toLocaleDateString(), PW - 10, 13, { align: 'right' })

      // Draw edges first (behind nodes)
      edges.forEach(edge => {
        const src = nodes.find(n => n.id === edge.source)
        const tgt = nodes.find(n => n.id === edge.target)
        if (!src || !tgt) return

        const x1 = tx(src.position.x + NODE_W / 2)
        const y1 = ty(src.position.y + NODE_H)
        const x2 = tx(tgt.position.x + NODE_W / 2)
        const y2 = ty(tgt.position.y)

        const wt  = edge.data?.wire_type || 'default'
        const hex = WIRE_COLORS[wt] || '#9CA3AF'
        const r   = parseInt(hex.slice(1, 3), 16)
        const g   = parseInt(hex.slice(3, 5), 16)
        const b   = parseInt(hex.slice(5, 7), 16)

        pdf.setDrawColor(r, g, b)
        pdf.setLineWidth(0.4)

        if (wt === 'fiber')    pdf.setLineDashPattern([2, 1.5], 0)
        else if (wt === 'wireless') pdf.setLineDashPattern([1.5, 1.5], 0)
        else if (wt === 'rs485')    pdf.setLineDashPattern([0.8, 0.8], 0)
        else pdf.setLineDashPattern([], 0)

        // Simple orthogonal: down from source, up to target
        const midY = (y1 + y2) / 2
        pdf.lines([[0, midY - y1], [x2 - x1, 0], [0, y2 - midY]], x1, y1)

        if (edge.label) {
          pdf.setFontSize(5)
          pdf.setTextColor(r, g, b)
          pdf.text(edge.label, (x1 + x2) / 2, (y1 + y2) / 2 - 1, { align: 'center' })
        }
      })

      // Draw nodes
      nodes.forEach(node => {
        const x = tx(node.position.x)
        const y = ty(node.position.y)
        const cat   = node.data.category || 'Other'
        const hex   = CATEGORY_COLORS[cat] || '#6B7280'
        const r     = parseInt(hex.slice(1, 3), 16)
        const g     = parseInt(hex.slice(3, 5), 16)
        const b     = parseInt(hex.slice(5, 7), 16)

        // Node background (white) with colored border
        pdf.setLineDashPattern([], 0)
        pdf.setFillColor(255, 255, 255)
        pdf.setDrawColor(r, g, b)
        pdf.setLineWidth(0.5)
        pdf.roundedRect(x, y, sw, sh, 1.5, 1.5, 'FD')

        // Category header strip
        pdf.setFillColor(r, g, b)
        pdf.setGState(pdf.GState({ opacity: 0.12 }))
        pdf.rect(x + 0.5, y + 0.5, sw - 1, sh * 0.38, 'F')
        pdf.setGState(pdf.GState({ opacity: 1 }))

        // Category label
        pdf.setTextColor(r, g, b)
        pdf.setFontSize(5.5)
        pdf.setFont('helvetica', 'bold')
        pdf.text(cat, x + 3, y + sh * 0.22)

        // Device label
        pdf.setTextColor(30, 30, 40)
        pdf.setFontSize(6.5)
        pdf.setFont('helvetica', 'normal')
        const label = node.data.label || ''
        pdf.text(label, x + 3, y + sh * 0.58, { maxWidth: sw - 6 })

        if ((node.data.quantity || 1) > 1) {
          pdf.setFontSize(5)
          pdf.setTextColor(100, 100, 100)
          pdf.text(`×${node.data.quantity}`, x + sw - 4, y + sh - 3, { align: 'right' })
        }
      })

      // Footer — wire type legend
      const legendY = PH - FOOTER + 3
      pdf.setLineDashPattern([], 0)
      pdf.setDrawColor(200, 200, 210)
      pdf.setLineWidth(0.2)
      pdf.line(10, legendY - 2, PW - 10, legendY - 2)

      const legendItems = WIRE_TYPES.filter(wt => edges.some(e => (e.data?.wire_type || 'default') === wt.value))
      let lx = 12
      legendItems.forEach(wt => {
        const hex = WIRE_COLORS[wt.value] || '#9CA3AF'
        const r = parseInt(hex.slice(1, 3), 16)
        const g = parseInt(hex.slice(3, 5), 16)
        const b = parseInt(hex.slice(5, 7), 16)
        pdf.setDrawColor(r, g, b)
        pdf.setLineWidth(0.5)
        if (wt.value === 'fiber')    pdf.setLineDashPattern([2, 1.5], 0)
        else if (wt.value === 'wireless') pdf.setLineDashPattern([1.5, 1.5], 0)
        else if (wt.value === 'rs485')    pdf.setLineDashPattern([0.8, 0.8], 0)
        else pdf.setLineDashPattern([], 0)
        pdf.line(lx, legendY + 3, lx + 10, legendY + 3)
        pdf.setTextColor(60, 60, 60)
        pdf.setFontSize(6)
        pdf.setFont('helvetica', 'normal')
        pdf.text(wt.label, lx + 12, legendY + 4.5)
        lx += 40
      })

      pdf.save(`${diagramName.replace(/[^a-z0-9]/gi, '_')}.pdf`)
    } catch (err) {
      console.error('PDF export error:', err)
      alert('Export failed.')
    } finally {
      setExporting(false)
    }
  }

  // ─── Keyboard delete ─────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.matches('input, textarea, select')) {
        e.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteSelected])

  useEffect(() => {
    window.addEventListener('forgept-sld-drop', onTouchDrop)
    return () => window.removeEventListener('forgept-sld-drop', onTouchDrop)
  }, [onTouchDrop])

  // ─── Device picker ───────────────────────────────────────────────────────────

  const filteredProducts = globalProducts.filter(p =>
    p.name?.toLowerCase().includes(deviceSearch.toLowerCase()) ||
    p.category?.toLowerCase().includes(deviceSearch.toLowerCase())
  )
  const productsByCategory = {}
  filteredProducts.forEach(p => {
    const cat = p.category || 'Other'
    if (!productsByCategory[cat]) productsByCategory[cat] = []
    productsByCategory[cat].push(p)
  })

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: '#0F1923' }}>
        <svg className="w-8 h-8 animate-spin text-[#C8622A]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ background: '#0F1923' }}>
      <style>{CANVAS_STYLE}</style>

      {/* SLD toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a3d55] bg-[#1a2d45] flex-shrink-0">

        {/* Sheet tabs */}
        <div className="flex items-center gap-1 flex-1 overflow-x-auto">
          {sheets.map(sheet => (
            <div key={sheet.id} className="flex items-center gap-0.5 flex-shrink-0">
              {renaming === sheet.id ? (
                <input
                  autoFocus
                  value={newSheetName}
                  onChange={e => setNewSheetName(e.target.value)}
                  onBlur={() => renameSheet(sheet.id, newSheetName || sheet.name)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') renameSheet(sheet.id, newSheetName || sheet.name)
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                  className="text-xs border border-[#C8622A] rounded px-2 py-0.5 focus:outline-none w-24"
                  style={{ background: '#0F1923', color: '#E8EEF5' }}
                />
              ) : (
                <button
                  onClick={() => setActiveSheetId(sheet.id)}
                  onDoubleClick={() => { setRenaming(sheet.id); setNewSheetName(sheet.name) }}
                  className={`text-xs px-3 py-1 rounded-md transition-colors ${
                    activeSheetId === sheet.id
                      ? 'bg-[#C8622A] text-white'
                      : 'text-[#8A9AB0] hover:text-white hover:bg-[#2a3d55]'
                  }`}
                >
                  {sheet.name}
                </button>
              )}
              {sheets.length > 1 && activeSheetId === sheet.id && (
                <button onClick={() => deleteSheet(sheet.id)} className="text-[#8A9AB0] hover:text-red-400 transition-colors p-0.5">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addSheet}
            className="flex-shrink-0 flex items-center gap-1 text-xs text-[#8A9AB0] hover:text-white px-2 py-1 rounded-md hover:bg-[#2a3d55] transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Add Sheet
          </button>
        </div>

        {/* Wire type */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs text-[#8A9AB0]">Wire:</span>
          <select
            value={edgeWireType}
            onChange={e => setEdgeWireType(e.target.value)}
            className="text-xs border border-[#2a3d55] rounded px-2 py-1 focus:outline-none focus:border-[#C8622A]"
            style={{ background: '#0F1923', color: '#E8EEF5' }}
          >
            {WIRE_TYPES.map(wt => <option key={wt.value} value={wt.value}>{wt.label}</option>)}
          </select>
        </div>

        {/* Auto-Build */}
        <button
          onClick={autoBuild}
          disabled={autoBuilding}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-[#2a3d55] text-[#8A9AB0] text-xs font-medium rounded-lg hover:border-[#C8622A]/60 hover:text-white transition-colors disabled:opacity-50 flex-shrink-0"
          style={{ background: '#0F1923' }}
        >
          {autoBuilding ? (
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          )}
          Auto-Build
        </button>

        {/* Save as Typical — visible when 2+ nodes selected */}
        {selectedNodeIds.size >= 2 && (
          <button
            onClick={() => setSaveTypicalModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#C8622A]/60 text-[#C8622A] hover:bg-[#C8622A] hover:text-white transition-colors flex-shrink-0"
            style={{ background: '#0F1923' }}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
            </svg>
            Save as Typical ({selectedNodeIds.size})
          </button>
        )}

        {/* Device panel toggle */}
        <button
          onClick={() => setShowDevicePanel(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors flex-shrink-0 ${
            showDevicePanel
              ? 'bg-[#C8622A] text-white border-[#C8622A]'
              : 'border-[#2a3d55] text-[#8A9AB0] hover:text-white'
          }`}
          style={!showDevicePanel ? { background: '#0F1923' } : {}}
        >
          Devices
        </button>

        {/* Export PDF */}
        <button
          onClick={exportPDF}
          disabled={exporting || nodes.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#2a3d55] text-[#8A9AB0] hover:text-white transition-colors disabled:opacity-40 flex-shrink-0"
          style={{ background: '#0F1923' }}
          title="Export as PDF"
        >
          {exporting ? (
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            </svg>
          )}
          Export PDF
        </button>
      </div>

      {/* Connection hint bar */}
      <div className="flex items-center gap-2 px-3 py-1 border-b border-[#2a3d55] flex-shrink-0" style={{ background: '#1a2d45' }}>
        <svg className="w-3 h-3 flex-shrink-0" style={{ color: '#8A9AB0' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span className="text-xs" style={{ color: '#8A9AB0' }}>
          To connect: hover a node → drag from the <strong style={{ color: '#C8622A' }}>bottom connector</strong> to the <strong style={{ color: '#C8622A' }}>top connector</strong> of another node. Click a line to change wire type.
        </span>
      </div>

      {/* Canvas + panels */}
      <div className="flex flex-1 overflow-hidden">

        {/* Device picker */}
        {showDevicePanel && (
          <div className="w-56 flex-shrink-0 flex flex-col overflow-hidden border-r border-[#2a3d55]" style={{ background: '#1a2d45' }}>
            {/* Picker tabs */}
            <div className="flex border-b border-[#2a3d55] flex-shrink-0">
              {[
                { id: 'quick',    label: 'Devices' },
                { id: 'typicals', label: `Typicals (${BUILT_IN_TYPICALS.length + typicals.length})` },
              ].map(t => (
                <button key={t.id} onClick={() => setPickerTab(t.id)}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                    pickerTab === t.id ? 'border-b-2 border-[#C8622A] text-white' : 'text-[#8A9AB0] hover:text-white'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Quick Add / Library tab */}
            {pickerTab === 'quick' && (
              <>
                <div className="p-2 border-b border-[#2a3d55]">
                  <input
                    type="text"
                    placeholder="Search devices..."
                    value={deviceSearch}
                    onChange={e => setDeviceSearch(e.target.value)}
                    className="w-full text-xs border border-[#2a3d55] rounded px-2 py-1.5 focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]"
                    style={{ background: '#0F1923', color: '#E8EEF5' }}
                  />
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {deviceSearch === '' ? (
                    <div className="space-y-0.5">
                      <p className="text-xs text-[#8A9AB0] font-medium uppercase tracking-wide px-1 mb-2">Quick Add</p>
                      {QUICK_ADD_CATEGORIES.map(cat => (
                        <DraggableDeviceButton key={cat} category={cat} name={cat} onClick={() => addDevice(cat, cat)}>
                          <span style={{ color: CATEGORY_COLORS[cat] || '#6B7280', flexShrink: 0 }}>
                            <CategoryIcon category={CATEGORY_ICON_MAP[cat] || cat} size={16} />
                          </span>
                          <span className="truncate">{cat}</span>
                        </DraggableDeviceButton>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(productsByCategory).map(([cat, products]) => (
                        <div key={cat}>
                          <p className="text-xs text-[#8A9AB0] font-medium uppercase tracking-wide px-1 mb-1">{cat}</p>
                          {products.map(p => (
                            <DraggableDeviceButton key={p.id} category={cat} name={p.name} globalProductId={p.id} onClick={() => addDevice(cat, p.name, p.id)}>
                              <span style={{ color: CATEGORY_COLORS[cat] || '#6B7280', flexShrink: 0 }}>
                                <CategoryIcon category={CATEGORY_ICON_MAP[cat] || cat} size={16} />
                              </span>
                              <span className="truncate">{p.name}</span>
                            </DraggableDeviceButton>
                          ))}
                        </div>
                      ))}
                      {Object.keys(productsByCategory).length === 0 && (
                        <p className="text-xs text-[#8A9AB0] text-center py-4">No devices found</p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Typicals tab */}
            {pickerTab === 'typicals' && (
              <div className="flex-1 overflow-y-auto">
                <div className="p-2 space-y-2">
                  {/* Built-in typicals */}
                  <p className="text-xs text-[#8A9AB0] font-medium uppercase tracking-wide px-1 pt-1">Built-in</p>
                  {BUILT_IN_TYPICALS.map(typ => (
                    <div key={typ.id} className="rounded-lg border border-[#2a3d55] overflow-hidden">
                      <div className="px-3 py-2" style={{ background: '#0F1923' }}>
                        <p className="text-xs font-semibold text-white truncate">{typ.name}</p>
                        <p className="text-xs text-[#8A9AB0] mt-0.5 leading-relaxed">{typ.description}</p>
                      </div>
                      <div className="flex border-t border-[#2a3d55]">
                        <button
                          onClick={() => { setStampModal(typ); setStampPrefix('') }}
                          className="flex-1 text-xs py-1.5 text-[#C8622A] hover:bg-[#C8622A]/10 transition-colors font-medium"
                        >
                          Stamp
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* User-saved typicals */}
                  <p className="text-xs text-[#8A9AB0] font-medium uppercase tracking-wide px-1 pt-2">Custom</p>
                  {typicals.length === 0 ? (
                    <p className="text-xs text-[#8A9AB0] px-1 pb-2 leading-relaxed">
                      Select 2+ nodes and click <strong className="text-white">Save as Typical</strong> to save a custom template.
                    </p>
                  ) : typicals.map(typ => (
                    <div key={typ.id} className="rounded-lg border border-[#2a3d55] overflow-hidden">
                      <div className="px-3 py-2" style={{ background: '#0F1923' }}>
                        <p className="text-xs font-semibold text-white truncate">{typ.name}</p>
                        <p className="text-xs text-[#8A9AB0] mt-0.5">
                          {(typ.sld_typical_nodes || []).length} device{(typ.sld_typical_nodes || []).length !== 1 ? 's' : ''}
                          {(typ.sld_typical_edges || []).length > 0 && `, ${(typ.sld_typical_edges || []).length} wire${(typ.sld_typical_edges || []).length !== 1 ? 's' : ''}`}
                        </p>
                      </div>
                      <div className="flex border-t border-[#2a3d55]">
                        <button
                          onClick={() => { setStampModal(typ); setStampPrefix('') }}
                          className="flex-1 text-xs py-1.5 text-[#C8622A] hover:bg-[#C8622A]/10 transition-colors font-medium"
                        >
                          Stamp
                        </button>
                        <div className="w-px bg-[#2a3d55]" />
                        <button
                          onClick={() => deleteTypical(typ.id)}
                          className="px-3 text-xs py-1.5 text-[#8A9AB0] hover:text-red-400 transition-colors"
                        >✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* React Flow */}
        <div className="flex-1 relative" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            onInit={setRfInstance}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={handleNodeDragStop}
            onNodeClick={(_, node) => { setSelectedNode(node); setSelectedEdge(null) }}
            onEdgeClick={(_, edge) => { setSelectedEdge(edge); setSelectedNode(null) }}
            onPaneClick={() => { setSelectedNode(null); setSelectedEdge(null); setSelectedNodeIds(new Set()) }}
            onSelectionChange={({ nodes: sel }) => setSelectedNodeIds(new Set(sel.map(n => n.id)))}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode={null}
            style={{ background: '#f8f9fa' }}
          >
            <Background color="#e5e7eb" gap={24} size={1} variant="dots" />
            <Controls />
            <MiniMap
              nodeColor={n => CATEGORY_COLORS[n.data?.category] || '#374151'}
              nodeStrokeColor={() => '#374151'}
              nodeStrokeWidth={1}
              style={{ background: '#ffffff', border: '1px solid #d1d5db' }}
            />
            {nodes.length === 0 && (
              <Panel position="top-center">
                <div className="mt-10 text-center">
                  <p className="text-sm" style={{ color: '#6b7280' }}>
                    Click a device type to add it, then drag from the <strong style={{ color: '#374151' }}>bottom connector</strong> to the <strong style={{ color: '#374151' }}>top connector</strong> of another device to wire them.
                  </p>
                  <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
                    Or use <strong style={{ color: '#374151' }}>Auto-Build</strong> to generate from the Drawing tab.
                  </p>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {/* Properties panel */}
        {(selectedNode || selectedEdge) && (
          <div className="w-52 flex-shrink-0 flex flex-col overflow-y-auto border-l border-[#2a3d55]" style={{ background: '#1a2d45' }}>
            <div className="p-3 border-b border-[#2a3d55] flex items-center justify-between">
              <p className="text-xs font-semibold" style={{ color: '#E8EEF5' }}>
                {selectedNode ? 'Node' : 'Connection'}
              </p>
              <button onClick={() => { setSelectedNode(null); setSelectedEdge(null) }} className="text-[#8A9AB0] hover:text-white">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {selectedNode && (
              <div className="p-3 space-y-3">
                <div>
                  <label className="text-xs block mb-1" style={{ color: '#8A9AB0' }}>Label</label>
                  <input
                    value={selectedNode.data.label || ''}
                    onChange={e => updateNodeData('label', e.target.value)}
                    className="w-full text-xs border border-[#2a3d55] rounded px-2 py-1.5 focus:outline-none focus:border-[#C8622A]"
                    style={{ background: '#0F1923', color: '#E8EEF5' }}
                  />
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: '#8A9AB0' }}>Category</label>
                  <select
                    value={selectedNode.data.category || 'Other'}
                    onChange={e => updateNodeData('category', e.target.value)}
                    className="w-full text-xs border border-[#2a3d55] rounded px-2 py-1.5 focus:outline-none focus:border-[#C8622A]"
                    style={{ background: '#0F1923', color: '#E8EEF5' }}
                  >
                    {QUICK_ADD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: '#8A9AB0' }}>Quantity</label>
                  <input
                    type="number" min={1}
                    value={selectedNode.data.quantity || 1}
                    onChange={e => updateNodeData('quantity', parseInt(e.target.value) || 1)}
                    className="w-full text-xs border border-[#2a3d55] rounded px-2 py-1.5 focus:outline-none focus:border-[#C8622A]"
                    style={{ background: '#0F1923', color: '#E8EEF5' }}
                  />
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: '#8A9AB0' }}>Notes</label>
                  <textarea
                    value={selectedNode.data.notes || ''}
                    onChange={e => updateNodeData('notes', e.target.value)}
                    rows={2}
                    className="w-full text-xs border border-[#2a3d55] rounded px-2 py-1.5 focus:outline-none focus:border-[#C8622A] resize-none"
                    style={{ background: '#0F1923', color: '#E8EEF5' }}
                  />
                </div>
                <button
                  onClick={deleteSelected}
                  className="w-full text-xs text-red-400 hover:text-red-300 border border-red-900/50 hover:border-red-400/50 rounded-md py-1.5 transition-colors"
                >
                  Delete Node
                </button>
              </div>
            )}

            {selectedEdge && (
              <div className="p-3 space-y-3">
                <div>
                  <label className="text-xs block mb-1" style={{ color: '#8A9AB0' }}>Wire Type</label>
                  <select
                    value={selectedEdge.data?.wire_type || 'default'}
                    onChange={e => updateEdgeType(e.target.value)}
                    className="w-full text-xs border border-[#2a3d55] rounded px-2 py-1.5 focus:outline-none focus:border-[#C8622A]"
                    style={{ background: '#0F1923', color: '#E8EEF5' }}
                  >
                    {WIRE_TYPES.map(wt => <option key={wt.value} value={wt.value}>{wt.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: '#8A9AB0' }}>Label</label>
                  <input
                    value={selectedEdge.label || ''}
                    onChange={async e => {
                      const label = e.target.value
                      const updated = { ...selectedEdge, label }
                      setSelectedEdge(updated)
                      setEdges(es => es.map(ed => ed.id === selectedEdge.id ? updated : ed))
                      await supabase.from('sld_edges').update({ label }).eq('id', selectedEdge.id)
                    }}
                    className="w-full text-xs border border-[#2a3d55] rounded px-2 py-1.5 focus:outline-none focus:border-[#C8622A]"
                    style={{ background: '#0F1923', color: '#E8EEF5' }}
                  />
                </div>
                <button
                  onClick={deleteSelected}
                  className="w-full text-xs text-red-400 hover:text-red-300 border border-red-900/50 hover:border-red-400/50 rounded-md py-1.5 transition-colors"
                >
                  Delete Connection
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Save as Typical modal ── */}
      {saveTypicalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-xl border border-[#2a3d55] p-6 w-80 shadow-2xl" style={{ background: '#1a2d45' }}>
            <h3 className="text-white font-semibold text-sm mb-1">Save as Typical</h3>
            <p className="text-[#8A9AB0] text-xs mb-4">
              Saving {selectedNodeIds.size} selected device{selectedNodeIds.size !== 1 ? 's' : ''} as a reusable typical.
            </p>
            <label className="block text-xs text-[#8A9AB0] mb-1">Typical Name</label>
            <input
              autoFocus
              value={typicalName}
              onChange={e => setTypicalName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveAsTypical()}
              placeholder="e.g. Typical Access Control Door"
              className="w-full text-sm border border-[#2a3d55] rounded-lg px-3 py-2 focus:outline-none focus:border-[#C8622A] mb-4"
              style={{ background: '#0F1923', color: '#E8EEF5' }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setSaveTypicalModal(false); setTypicalName('') }}
                className="flex-1 py-2 text-sm text-[#8A9AB0] border border-[#2a3d55] rounded-lg hover:text-white transition-colors"
                style={{ background: '#0F1923' }}
              >
                Cancel
              </button>
              <button
                onClick={saveAsTypical}
                disabled={savingTypical || !typicalName.trim()}
                className="flex-1 py-2 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-50"
                style={{ background: '#C8622A' }}
              >
                {savingTypical ? 'Saving…' : 'Save Typical'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stamp typical modal ── */}
      {stampModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-xl border border-[#2a3d55] p-6 w-80 shadow-2xl" style={{ background: '#1a2d45' }}>
            <h3 className="text-white font-semibold text-sm mb-1">Stamp: {stampModal.name}</h3>
            <p className="text-[#8A9AB0] text-xs mb-4">
              {(stampModal.sld_typical_nodes || []).length} device{(stampModal.sld_typical_nodes || []).length !== 1 ? 's' : ''} will be placed on the current sheet.
            </p>
            <label className="block text-xs text-[#8A9AB0] mb-1">Label Prefix <span className="text-[#4A5568]">(optional)</span></label>
            <input
              autoFocus
              value={stampPrefix}
              onChange={e => setStampPrefix(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && stampTypical(stampModal, stampPrefix)}
              placeholder="e.g. Door 101"
              className="w-full text-sm border border-[#2a3d55] rounded-lg px-3 py-2 focus:outline-none focus:border-[#C8622A] mb-1"
              style={{ background: '#0F1923', color: '#E8EEF5' }}
            />
            <p className="text-xs text-[#4A5568] mb-4">Labels will read: "Door 101 - Door Reader", "Door 101 - REX", etc.</p>
            <div className="flex gap-2">
              <button
                onClick={() => { setStampModal(null); setStampPrefix('') }}
                className="flex-1 py-2 text-sm text-[#8A9AB0] border border-[#2a3d55] rounded-lg hover:text-white transition-colors"
                style={{ background: '#0F1923' }}
              >
                Cancel
              </button>
              <button
                onClick={() => stampTypical(stampModal, stampPrefix)}
                disabled={stamping}
                className="flex-1 py-2 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-50"
                style={{ background: '#C8622A' }}
              >
                {stamping ? 'Placing…' : 'Stamp'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
