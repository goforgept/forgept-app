import { useState, useEffect, useCallback, useRef } from 'react'
import { savePdf } from '../../nativeDownload'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Position,
  Handle,
  Panel,
  MarkerType,
  NodeResizer,
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

// Default component labels for schematic nodes (user-editable)
const DEFAULT_COMPONENTS = {
  single_door: {
    panel:   'Access Control Panel',
    reader:  'Card Reader',
    rex:     'R.E.X.',
    contact: 'Door Contact',
    lock:    'Electric Lock',
  },
  double_door: {
    panel:    'Access Control Panel',
    readerA:  'Reader A',  readerB:  'Reader B',
    rexA:     'REX A',     rexB:     'REX B',
    contactA: 'Door Contact A', contactB: 'Door Contact B',
    lockA:    'Lock A',    lockB:    'Lock B',
  },
}

// Default positions of each component box within the schematic SVG (used when no override stored)
const COMP_DEFAULT_POS = {
  single_door: (key, lockType) => ({
    panel:   { x: 224, y: 8   },
    contact: { x: 84,  y: 8   },
    reader:  { x: 4,   y: 78  },
    lock:    lockType === 'mag' ? { x: 86, y: 24 } : { x: 54, y: 102 },
    rex:     { x: 216, y: 78  },
  }[key] || { x: 20, y: 20 }),
  double_door: (key, lockType) => ({
    panel:    { x: 326, y: 8   },
    contactA: { x: 82,  y: 14  },
    contactB: { x: 204, y: 14  },
    readerA:  { x: 4,   y: 58  },
    readerB:  { x: 4,   y: 94  },
    lockA:    lockType === 'mag' ? { x: 82,  y: 100 } : { x: 170, y: 90 },
    lockB:    lockType === 'mag' ? { x: 204, y: 100 } : { x: 200, y: 90 },
    rexA:     { x: 330, y: 58  },
    rexB:     { x: 330, y: 94  },
  }[key] || { x: 20, y: 20 }),
}

// Fixed box sizes for each component (width × height in SVG units)
const COMP_SIZE = {
  single_door: (key, lockType) => ({
    panel:   { w: 88, h: 50 },
    contact: { w: 44, h: 16 },
    reader:  { w: 58, h: 30 },
    lock:    lockType === 'mag' ? { w: 50, h: 10 } : { w: 24, h: 26 },
    rex:     { w: 58, h: 30 },
  }[key] || { w: 44, h: 20 }),
  double_door: (key, lockType) => {
    const isMag = lockType === 'mag'
    return ({
      panel:    { w: 72, h: 50 },
      contactA: { w: 40, h: 14 },
      contactB: { w: 40, h: 14 },
      readerA:  { w: 58, h: 28 },
      readerB:  { w: 58, h: 28 },
      lockA:    isMag ? { w: 40, h: 8 } : { w: 18, h: 22 },
      lockB:    isMag ? { w: 40, h: 8 } : { w: 18, h: 22 },
      rexA:     { w: 58, h: 28 },
      rexB:     { w: 58, h: 28 },
    }[key] || { w: 44, h: 20 })
  },
}

// Default wire runs shown in each schematic (stored in data.wires; undefined = use these defaults)
const DEFAULT_WIRES = {
  single_door: [
    { id: 'bus-v',      x1: 76,  y1: 22,  x2: 76,  y2: 130, stroke: '#374151', dash: null },
    { id: 'bus-h',      x1: 76,  y1: 20,  x2: 224, y2: 20,  stroke: '#374151', dash: null },
    { id: 'reader-run', x1: 62,  y1: 93,  x2: 76,  y2: 93,  stroke: '#1e3a8a', dash: null },
    { id: 'lock-power', x1: 54,  y1: 128, x2: 76,  y2: 128, stroke: '#7f1d1d', dash: '3,1.5' },
  ],
  double_door: [
    { id: 'bus-v',  x1: 64,  y1: 14, x2: 64,  y2: 140, stroke: '#374151', dash: null },
    { id: 'bus-h',  x1: 64,  y1: 14, x2: 326, y2: 14,  stroke: '#374151', dash: null },
    { id: 'lock-a', x1: 62,  y1: 101, x2: 76,  y2: 101, stroke: '#7f1d1d', dash: '3,1.5' },
    { id: 'lock-b', x1: 316, y1: 101, x2: 330, y2: 101, stroke: '#7f1d1d', dash: '3,1.5' },
  ],
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
    description: 'Reader, REX, door contact + electric lock — schematic installation diagram',
    sld_typical_nodes: [
      { id: 'n1', label: 'Single Door', node_type: 'schematic', position_x: 0, position_y: 0, data: { schematicType: 'single_door' } },
    ],
    sld_typical_edges: [],
  },
  {
    id: 'builtin-double-door',
    name: 'Typical Double Door',
    description: 'Two readers, two REX, two contacts + two locks — schematic installation diagram',
    sld_typical_nodes: [
      { id: 'n1', label: 'Double Door', node_type: 'schematic', position_x: 0, position_y: 0, data: { schematicType: 'double_door' } },
    ],
    sld_typical_edges: [],
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

function DraggableShapeButton({ shape, label, onClick, children }) {
  const touchStartRef = useRef(null)
  const ghostRef      = useRef(null)
  const isDraggingRef = useRef(false)
  const btnRef        = useRef(null)

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
    e.dataTransfer.setData('application/sld-shape', JSON.stringify({ shape }))
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
      ghost.textContent = label
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
      window.dispatchEvent(new CustomEvent('forgept-sld-shape-drop', {
        detail: { shape, clientX: t.clientX, clientY: t.clientY },
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

function DeviceNode({ id, data, selected }) {
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
        width: '100%',
        minWidth: 120,
        fontFamily: 'sans-serif',
        transform: data.rotation ? `rotate(${data.rotation}deg)` : undefined,
        transformOrigin: 'center center',
      }}
    >
      <NodeResizer
        minWidth={120}
        minHeight={55}
        isVisible={selected}
        color="#C8622A"
      />
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

// ─── Schematic node — visual installation diagram ────────────────────────────

// Helper: render a text label inside an SVG box, wrapping at spaces if needed
function SvgLabel({ x, y, text, fill, fontSize = 7, bold = false }) {
  const str = String(text || '').trim()
  const words = str.split(/\s+/)
  if (words.length <= 1 || str.length <= 9) {
    return <text x={x} y={y} textAnchor="middle" fontSize={fontSize} fill={fill} fontWeight={bold ? '700' : '400'} fontFamily="sans-serif">{str}</text>
  }
  const mid = Math.ceil(words.length / 2)
  const l1 = words.slice(0, mid).join(' ')
  const l2 = words.slice(mid).join(' ')
  return (
    <>
      <text x={x} y={y - 5} textAnchor="middle" fontSize={fontSize - 0.5} fill={fill} fontWeight={bold ? '700' : '400'} fontFamily="sans-serif">{l1}</text>
      <text x={x} y={y + 4} textAnchor="middle" fontSize={fontSize - 0.5} fill={fill} fontFamily="sans-serif">{l2}</text>
    </>
  )
}

function SingleDoorSVG({ components = {}, lockType = 'strike', positions = {}, sizes = {}, wires, hiddenComponents = [], onUpdate }) {
  const c      = { ...DEFAULT_COMPONENTS.single_door, ...components }
  const svgRef = useRef(null)
  const isMag  = lockType === 'mag'

  const [drag,      setDrag]      = useState(null)
  const [livePos,   setLivePos]   = useState({})
  const [liveWires, setLiveWires] = useState({})
  const [liveSizes, setLiveSizes] = useState({})
  const [selWire,   setSelWire]   = useState(null)
  const [selComp,   setSelComp]   = useState(null)
  const wireInteractionRef        = useRef(false)
  const compInteractionRef        = useRef(false)

  const srcWires   = wires !== undefined ? wires : DEFAULT_WIRES.single_door
  const activeWires = srcWires.map(w => ({ ...w, ...(liveWires[w.id] || {}) }))

  const getPos  = (key) => livePos[key] || positions[key] || COMP_DEFAULT_POS.single_door(key, lockType)
  const getSize = (key) => {
    const ov  = liveSizes[key] || sizes[key]
    const def = COMP_SIZE.single_door(key, lockType)
    return ov ? { w: ov.w ?? def.w, h: ov.h ?? def.h } : def
  }

  const getSvgScale = () => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    return { sx: 320 / rect.width, sy: 210 / rect.height, rect }
  }

  const startCompDrag = (e, key) => {
    e.stopPropagation(); e.preventDefault()
    const sc = getSvgScale(); if (!sc) return
    const { sx, sy, rect } = sc
    const cx = (e.clientX - rect.left) * sx
    const cy = (e.clientY - rect.top)  * sy
    const p  = getPos(key)
    svgRef.current.setPointerCapture(e.pointerId)
    setDrag({ type: 'comp', key, cx0: cx, cy0: cy, px0: p.x, py0: p.y, sx, sy, rect })
    setSelWire(null)
  }

  const startWireBodyDrag = (e, wire) => {
    e.stopPropagation(); e.preventDefault()
    const sc = getSvgScale(); if (!sc) return
    const { sx, sy, rect } = sc
    const cx = (e.clientX - rect.left) * sx
    const cy = (e.clientY - rect.top)  * sy
    svgRef.current.setPointerCapture(e.pointerId)
    wireInteractionRef.current = true
    setDrag({ type: 'wire-body', id: wire.id, cx0: cx, cy0: cy, wx0: wire.x1, wy0: wire.y1, wx2: wire.x2, wy2: wire.y2, sx, sy, rect })
    setSelWire(wire.id)
  }

  const startWireEndDrag = (e, wire, end) => {
    e.stopPropagation(); e.preventDefault()
    const sc = getSvgScale(); if (!sc) return
    const { sx, sy, rect } = sc
    const cx = (e.clientX - rect.left) * sx
    const cy = (e.clientY - rect.top)  * sy
    svgRef.current.setPointerCapture(e.pointerId)
    wireInteractionRef.current = true
    setDrag({ type: 'wire-end', id: wire.id, end, cx0: cx, cy0: cy, startX: end === 1 ? wire.x1 : wire.x2, startY: end === 1 ? wire.y1 : wire.y2, sx, sy, rect })
    setSelWire(wire.id)
  }

  const startResize = (e, key) => {
    e.stopPropagation(); e.preventDefault()
    const sc = getSvgScale(); if (!sc) return
    const { sx, sy, rect } = sc
    const cx = (e.clientX - rect.left) * sx
    const cy = (e.clientY - rect.top)  * sy
    const s  = getSize(key)
    svgRef.current.setPointerCapture(e.pointerId)
    setDrag({ type: 'resize', key, cx0: cx, cy0: cy, w0: s.w, h0: s.h, sx, sy, rect })
    setSelWire(null)
  }

  const onSvgMove = (e) => {
    if (!drag) return
    const { sx, sy, rect } = drag
    const ddx = (e.clientX - rect.left) * sx - drag.cx0
    const ddy = (e.clientY - rect.top)  * sy - drag.cy0

    if (drag.type === 'comp') {
      setLivePos(lp => ({ ...lp, [drag.key]: { x: drag.px0 + ddx, y: drag.py0 + ddy } }))
    } else if (drag.type === 'resize') {
      setLiveSizes(ls => ({ ...ls, [drag.key]: { w: Math.max(10, drag.w0 + ddx), h: Math.max(10, drag.h0 + ddy) } }))
    } else if (drag.type === 'wire-body') {
      setLiveWires(lws => ({ ...lws, [drag.id]: { x1: drag.wx0 + ddx, y1: drag.wy0 + ddy, x2: drag.wx2 + ddx, y2: drag.wy2 + ddy } }))
    } else if (drag.type === 'wire-end') {
      const nx = drag.startX + ddx, ny = drag.startY + ddy
      setLiveWires(lws => {
        const prev = lws[drag.id] || {}, base = activeWires.find(w => w.id === drag.id) || {}
        return drag.end === 1
          ? { ...lws, [drag.id]: { ...prev, x1: nx, y1: ny, x2: prev.x2 ?? base.x2, y2: prev.y2 ?? base.y2 } }
          : { ...lws, [drag.id]: { ...prev, x1: prev.x1 ?? base.x1, y1: prev.y1 ?? base.y1, x2: nx, y2: ny } }
      })
    }
  }

  const onSvgUp = () => {
    if (!drag) return
    if (drag.type === 'comp') {
      const fp = livePos[drag.key]
      if (fp) {
        onUpdate?.({ positions: { ...positions, [drag.key]: { x: Math.round(fp.x), y: Math.round(fp.y) } } })
        setLivePos(lp => { const n = { ...lp }; delete n[drag.key]; return n })
      } else {
        setSelComp(sc => sc === drag.key ? null : drag.key)
        compInteractionRef.current = true
      }
    } else if (drag.type === 'resize') {
      const fs = liveSizes[drag.key]
      if (fs) onUpdate?.({ sizes: { ...sizes, [drag.key]: { w: Math.round(fs.w), h: Math.round(fs.h) } } })
      setLiveSizes(ls => { const n = { ...ls }; delete n[drag.key]; return n })
    } else if (drag.type === 'wire-body' || drag.type === 'wire-end') {
      const lw = liveWires[drag.id]
      if (lw) {
        const base = srcWires.find(w => w.id === drag.id) || {}
        const newWires = srcWires.map(w => w.id === drag.id ? { ...base, ...lw } : w)
        onUpdate?.({ wires: newWires })
      }
      setLiveWires(lws => { const n = { ...lws }; delete n[drag.id]; return n })
    }
    setDrag(null)
  }

  const deleteWire = (e, wireId) => {
    e.stopPropagation()
    setSelWire(null)
    onUpdate?.({ wires: activeWires.filter(w => w.id !== wireId) })
  }

  const COLORS = { panel: '#78350f', contact: '#991b1b', reader: '#1e40af', lock: '#4c1d95', rex: '#92400e' }

  const renderBox = (key) => {
    if (hiddenComponents.includes(key)) return null
    const p = getPos(key), s = getSize(key), color = COLORS[key]
    const isLockMag = key === 'lock' && isMag
    const isSelComp = selComp === key
    return (
      <g key={key}>
        <g onPointerDown={e => startCompDrag(e, key)}
          style={{ cursor: drag?.type === 'comp' && drag.key === key ? 'grabbing' : 'grab' }}>
          <rect x={p.x} y={p.y} width={s.w} height={s.h}
            fill={isLockMag ? '#ede9fe' : '#fff'}
            stroke={isSelComp ? '#C8622A' : color} strokeWidth={isSelComp ? 2 : 1.5} rx={isLockMag ? 1 : 0}/>
          <SvgLabel x={p.x + s.w / 2} y={p.y + s.h / 2 + (s.h < 15 ? 2 : 3)}
            text={c[key]} fill={color} fontSize={isLockMag ? 5.5 : 7} bold />
        </g>
        <rect x={p.x + s.w - 5} y={p.y + s.h - 5} width={7} height={7}
          fill="#C8622A" rx={1} style={{ cursor: 'se-resize' }}
          onPointerDown={e => startResize(e, key)} />
        {isSelComp && (
          <g style={{ cursor: 'pointer' }}
            onPointerDown={e => { e.stopPropagation(); onUpdate({ hiddenComponents: [...hiddenComponents, key] }); setSelComp(null) }}>
            <circle cx={p.x + s.w} cy={p.y} r={5.5} fill="#ef4444" stroke="#fff" strokeWidth={1} />
            <text x={p.x + s.w} y={p.y + 3.5} textAnchor="middle" fontSize="7" fill="#fff" fontWeight="bold" pointerEvents="none">✕</text>
          </g>
        )}
      </g>
    )
  }

  const renderWire = (wire) => {
    const isSel = selWire === wire.id
    const mx = (wire.x1 + wire.x2) / 2, my = (wire.y1 + wire.y2) / 2
    return (
      <g key={wire.id}>
        <line x1={wire.x1} y1={wire.y1} x2={wire.x2} y2={wire.y2}
          stroke="transparent" strokeWidth={8} style={{ cursor: 'move' }}
          onPointerDown={e => startWireBodyDrag(e, wire)} />
        <line x1={wire.x1} y1={wire.y1} x2={wire.x2} y2={wire.y2}
          stroke={isSel ? '#C8622A' : wire.stroke} strokeWidth={isSel ? 1.5 : 1}
          strokeDasharray={wire.dash || 'none'} pointerEvents="none" />
        {isSel && <>
          <circle cx={wire.x1} cy={wire.y1} r={4} fill="#fff" stroke="#C8622A" strokeWidth={1.5}
            style={{ cursor: 'crosshair' }} onPointerDown={e => startWireEndDrag(e, wire, 1)} />
          <circle cx={wire.x2} cy={wire.y2} r={4} fill="#fff" stroke="#C8622A" strokeWidth={1.5}
            style={{ cursor: 'crosshair' }} onPointerDown={e => startWireEndDrag(e, wire, 2)} />
          <circle cx={mx} cy={my} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1}
            style={{ cursor: 'pointer' }} onPointerDown={e => deleteWire(e, wire.id)} />
          <text x={mx} y={my + 3.5} textAnchor="middle" fontSize="7" fill="#fff" fontWeight="bold" pointerEvents="none">✕</text>
        </>}
      </g>
    )
  }

  return (
    <svg ref={svgRef} width="320" height="210" viewBox="0 0 320 210"
      style={{ display: 'block', userSelect: 'none' }}
      onPointerMove={onSvgMove} onPointerUp={onSvgUp} onPointerLeave={onSvgUp}
      onClick={() => {
        if (wireInteractionRef.current) { wireInteractionRef.current = false; return }
        if (compInteractionRef.current) { compInteractionRef.current = false; return }
        setSelWire(null); setSelComp(null)
      }}>
      {/* Wall */}
      <rect x="68" y="0" width="16" height="210" fill="#d1d5db" stroke="#4b5563" strokeWidth="1.5"/>
      {/* Door panel */}
      <rect x="84" y="22" width="126" height="166" fill="#f3f4f6" stroke="#374151" strokeWidth="1.5"/>
      <path d="M84,188 Q210,188 210,22" fill="none" stroke="#e5e7eb" strokeWidth="1" strokeDasharray="5,3"/>
      <rect x="84" y="28" width="6" height="12" fill="#9ca3af"/>
      <rect x="84" y="160" width="6" height="12" fill="#9ca3af"/>
      <circle cx="192" cy="105" r="5" fill="none" stroke="#6b7280" strokeWidth="1.5"/>
      <line x1="192" y1="100" x2="192" y2="90" stroke="#6b7280" strokeWidth="1.5"/>
      {/* Interactive wire runs — click to select, drag to move, drag endpoints, click ✕ to delete */}
      {activeWires.map(renderWire)}
      {/* Legend */}
      <line x1="4" y1="200" x2="22" y2="200" stroke="#374151" strokeWidth="1"/>
      <text x="24" y="203" fontSize="5.5" fill="#6b7280" fontFamily="sans-serif">RS-485</text>
      <line x1="74" y1="200" x2="92" y2="200" stroke="#7f1d1d" strokeWidth="1" strokeDasharray="3,1.5"/>
      <text x="94" y="203" fontSize="5.5" fill="#6b7280" fontFamily="sans-serif">Power</text>
      <line x1="134" y1="200" x2="152" y2="200" stroke="#374151" strokeWidth="1" strokeDasharray="2,1.5"/>
      <text x="154" y="203" fontSize="5.5" fill="#6b7280" fontFamily="sans-serif">Data</text>
      {/* Draggable + resizable component boxes */}
      {['panel', 'contact', 'reader', 'lock', 'rex'].map(k => renderBox(k))}
    </svg>
  )
}

function DoubleDoorSVG({ components = {}, lockType = 'strike', positions = {}, sizes = {}, wires, hiddenComponents = [], onUpdate }) {
  const c      = { ...DEFAULT_COMPONENTS.double_door, ...components }
  const svgRef = useRef(null)
  const isMag  = lockType === 'mag'

  const [drag,      setDrag]      = useState(null)
  const [livePos,   setLivePos]   = useState({})
  const [liveWires, setLiveWires] = useState({})
  const [liveSizes, setLiveSizes] = useState({})
  const [selWire,   setSelWire]   = useState(null)
  const [selComp,   setSelComp]   = useState(null)
  const wireInteractionRef        = useRef(false)
  const compInteractionRef        = useRef(false)

  const srcWires    = wires !== undefined ? wires : DEFAULT_WIRES.double_door
  const activeWires = srcWires.map(w => ({ ...w, ...(liveWires[w.id] || {}) }))

  const getPos  = (key) => livePos[key] || positions[key] || COMP_DEFAULT_POS.double_door(key, lockType)
  const getSize = (key) => {
    const ov  = liveSizes[key] || sizes[key]
    const def = COMP_SIZE.double_door(key, lockType)
    return ov ? { w: ov.w ?? def.w, h: ov.h ?? def.h } : def
  }

  const getSvgScale = () => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    return { sx: 400 / rect.width, sy: 210 / rect.height, rect }
  }

  const startCompDrag = (e, key) => {
    e.stopPropagation(); e.preventDefault()
    const sc = getSvgScale(); if (!sc) return
    const { sx, sy, rect } = sc
    const cx = (e.clientX - rect.left) * sx
    const cy = (e.clientY - rect.top)  * sy
    const p  = getPos(key)
    svgRef.current.setPointerCapture(e.pointerId)
    setDrag({ type: 'comp', key, cx0: cx, cy0: cy, px0: p.x, py0: p.y, sx, sy, rect })
    setSelWire(null)
  }

  const startWireBodyDrag = (e, wire) => {
    e.stopPropagation(); e.preventDefault()
    const sc = getSvgScale(); if (!sc) return
    const { sx, sy, rect } = sc
    const cx = (e.clientX - rect.left) * sx
    const cy = (e.clientY - rect.top)  * sy
    svgRef.current.setPointerCapture(e.pointerId)
    wireInteractionRef.current = true
    setDrag({ type: 'wire-body', id: wire.id, cx0: cx, cy0: cy, wx0: wire.x1, wy0: wire.y1, wx2: wire.x2, wy2: wire.y2, sx, sy, rect })
    setSelWire(wire.id)
  }

  const startWireEndDrag = (e, wire, end) => {
    e.stopPropagation(); e.preventDefault()
    const sc = getSvgScale(); if (!sc) return
    const { sx, sy, rect } = sc
    const cx = (e.clientX - rect.left) * sx
    const cy = (e.clientY - rect.top)  * sy
    svgRef.current.setPointerCapture(e.pointerId)
    wireInteractionRef.current = true
    setDrag({ type: 'wire-end', id: wire.id, end, cx0: cx, cy0: cy, startX: end === 1 ? wire.x1 : wire.x2, startY: end === 1 ? wire.y1 : wire.y2, sx, sy, rect })
    setSelWire(wire.id)
  }

  const startResize = (e, key) => {
    e.stopPropagation(); e.preventDefault()
    const sc = getSvgScale(); if (!sc) return
    const { sx, sy, rect } = sc
    const cx = (e.clientX - rect.left) * sx
    const cy = (e.clientY - rect.top)  * sy
    const s  = getSize(key)
    svgRef.current.setPointerCapture(e.pointerId)
    setDrag({ type: 'resize', key, cx0: cx, cy0: cy, w0: s.w, h0: s.h, sx, sy, rect })
    setSelWire(null)
  }

  const onSvgMove = (e) => {
    if (!drag) return
    const { sx, sy, rect } = drag
    const ddx = (e.clientX - rect.left) * sx - drag.cx0
    const ddy = (e.clientY - rect.top)  * sy - drag.cy0

    if (drag.type === 'comp') {
      setLivePos(lp => ({ ...lp, [drag.key]: { x: drag.px0 + ddx, y: drag.py0 + ddy } }))
    } else if (drag.type === 'resize') {
      setLiveSizes(ls => ({ ...ls, [drag.key]: { w: Math.max(10, drag.w0 + ddx), h: Math.max(10, drag.h0 + ddy) } }))
    } else if (drag.type === 'wire-body') {
      setLiveWires(lws => ({ ...lws, [drag.id]: { x1: drag.wx0 + ddx, y1: drag.wy0 + ddy, x2: drag.wx2 + ddx, y2: drag.wy2 + ddy } }))
    } else if (drag.type === 'wire-end') {
      const nx = drag.startX + ddx, ny = drag.startY + ddy
      setLiveWires(lws => {
        const prev = lws[drag.id] || {}, base = activeWires.find(w => w.id === drag.id) || {}
        return drag.end === 1
          ? { ...lws, [drag.id]: { ...prev, x1: nx, y1: ny, x2: prev.x2 ?? base.x2, y2: prev.y2 ?? base.y2 } }
          : { ...lws, [drag.id]: { ...prev, x1: prev.x1 ?? base.x1, y1: prev.y1 ?? base.y1, x2: nx, y2: ny } }
      })
    }
  }

  const onSvgUp = () => {
    if (!drag) return
    if (drag.type === 'comp') {
      const fp = livePos[drag.key]
      if (fp) {
        onUpdate?.({ positions: { ...positions, [drag.key]: { x: Math.round(fp.x), y: Math.round(fp.y) } } })
        setLivePos(lp => { const n = { ...lp }; delete n[drag.key]; return n })
      } else {
        setSelComp(sc => sc === drag.key ? null : drag.key)
        compInteractionRef.current = true
      }
    } else if (drag.type === 'resize') {
      const fs = liveSizes[drag.key]
      if (fs) onUpdate?.({ sizes: { ...sizes, [drag.key]: { w: Math.round(fs.w), h: Math.round(fs.h) } } })
      setLiveSizes(ls => { const n = { ...ls }; delete n[drag.key]; return n })
    } else if (drag.type === 'wire-body' || drag.type === 'wire-end') {
      const lw = liveWires[drag.id]
      if (lw) {
        const base = srcWires.find(w => w.id === drag.id) || {}
        const newWires = srcWires.map(w => w.id === drag.id ? { ...base, ...lw } : w)
        onUpdate?.({ wires: newWires })
      }
      setLiveWires(lws => { const n = { ...lws }; delete n[drag.id]; return n })
    }
    setDrag(null)
  }

  const deleteWire = (e, wireId) => {
    e.stopPropagation()
    setSelWire(null)
    onUpdate?.({ wires: activeWires.filter(w => w.id !== wireId) })
  }

  const COLORS = {
    panel: '#78350f',
    contactA: '#991b1b', contactB: '#991b1b',
    readerA: '#1e40af',  readerB: '#1e40af',
    lockA: '#4c1d95',    lockB: '#4c1d95',
    rexA: '#92400e',     rexB: '#92400e',
  }

  const renderBox = (key) => {
    if (hiddenComponents.includes(key)) return null
    const p = getPos(key), s = getSize(key), color = COLORS[key] || '#374151'
    const isLockMag = (key === 'lockA' || key === 'lockB') && isMag
    const isSelComp = selComp === key
    return (
      <g key={key}>
        <g onPointerDown={e => startCompDrag(e, key)}
          style={{ cursor: drag?.type === 'comp' && drag.key === key ? 'grabbing' : 'grab' }}>
          <rect x={p.x} y={p.y} width={s.w} height={s.h}
            fill={isLockMag ? '#ede9fe' : '#fff'}
            stroke={isSelComp ? '#C8622A' : color} strokeWidth={isSelComp ? 2 : 1.5} rx={isLockMag ? 1 : 0}/>
          <SvgLabel x={p.x + s.w / 2} y={p.y + s.h / 2 + (s.h < 15 ? 2 : 3)}
            text={c[key]} fill={color} fontSize={isLockMag ? 5.5 : 6.5} bold />
        </g>
        <rect x={p.x + s.w - 5} y={p.y + s.h - 5} width={7} height={7}
          fill="#C8622A" rx={1} style={{ cursor: 'se-resize' }}
          onPointerDown={e => startResize(e, key)} />
        {isSelComp && (
          <g style={{ cursor: 'pointer' }}
            onPointerDown={e => { e.stopPropagation(); onUpdate({ hiddenComponents: [...hiddenComponents, key] }); setSelComp(null) }}>
            <circle cx={p.x + s.w} cy={p.y} r={5.5} fill="#ef4444" stroke="#fff" strokeWidth={1} />
            <text x={p.x + s.w} y={p.y + 3.5} textAnchor="middle" fontSize="7" fill="#fff" fontWeight="bold" pointerEvents="none">✕</text>
          </g>
        )}
      </g>
    )
  }

  const renderWire = (wire) => {
    const isSel = selWire === wire.id
    const mx = (wire.x1 + wire.x2) / 2, my = (wire.y1 + wire.y2) / 2
    return (
      <g key={wire.id}>
        <line x1={wire.x1} y1={wire.y1} x2={wire.x2} y2={wire.y2}
          stroke="transparent" strokeWidth={8} style={{ cursor: 'move' }}
          onPointerDown={e => startWireBodyDrag(e, wire)} />
        <line x1={wire.x1} y1={wire.y1} x2={wire.x2} y2={wire.y2}
          stroke={isSel ? '#C8622A' : wire.stroke} strokeWidth={isSel ? 1.5 : 1}
          strokeDasharray={wire.dash || 'none'} pointerEvents="none" />
        {isSel && <>
          <circle cx={wire.x1} cy={wire.y1} r={4} fill="#fff" stroke="#C8622A" strokeWidth={1.5}
            style={{ cursor: 'crosshair' }} onPointerDown={e => startWireEndDrag(e, wire, 1)} />
          <circle cx={wire.x2} cy={wire.y2} r={4} fill="#fff" stroke="#C8622A" strokeWidth={1.5}
            style={{ cursor: 'crosshair' }} onPointerDown={e => startWireEndDrag(e, wire, 2)} />
          <circle cx={mx} cy={my} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1}
            style={{ cursor: 'pointer' }} onPointerDown={e => deleteWire(e, wire.id)} />
          <text x={mx} y={my + 3.5} textAnchor="middle" fontSize="7" fill="#fff" fontWeight="bold" pointerEvents="none">✕</text>
        </>}
      </g>
    )
  }

  const compKeys = ['panel', 'contactA', 'contactB', 'readerA', 'readerB', 'lockA', 'lockB', 'rexA', 'rexB']

  return (
    <svg ref={svgRef} width="400" height="210" viewBox="0 0 400 210"
      style={{ display: 'block', userSelect: 'none' }}
      onPointerMove={onSvgMove} onPointerUp={onSvgUp} onPointerLeave={onSvgUp}
      onClick={() => {
        if (wireInteractionRef.current) { wireInteractionRef.current = false; return }
        if (compInteractionRef.current) { compInteractionRef.current = false; return }
        setSelWire(null); setSelComp(null)
      }}>
      {/* Left frame */}
      <rect x="68" y="0" width="8" height="196" fill="#9ca3af" stroke="#6b7280" strokeWidth="1"/>
      {/* Right frame */}
      <rect x="316" y="0" width="8" height="196" fill="#9ca3af" stroke="#6b7280" strokeWidth="1"/>
      {/* Top frame */}
      <rect x="68" y="0" width="256" height="12" fill="#9ca3af" stroke="#6b7280" strokeWidth="1"/>
      {/* Center mullion */}
      <rect x="192" y="12" width="8" height="184" fill="#9ca3af" stroke="#6b7280" strokeWidth="1"/>
      {/* Floor line */}
      <line x1="68" y1="196" x2="324" y2="196" stroke="#4b5563" strokeWidth="1.5"/>
      {/* Door A panel */}
      <rect x="76" y="12" width="116" height="184" fill="#f3f4f6" stroke="#374151" strokeWidth="1.5"/>
      {/* Door A glass (upper) */}
      <rect x="84" y="20" width="100" height="76" fill="#dbeafe" stroke="#93c5fd" strokeWidth="1"/>
      {/* Door A lower panel */}
      <rect x="84" y="104" width="100" height="84" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="1"/>
      {/* Door A hinges (on left frame) */}
      <rect x="68" y="26"  width="6" height="10" fill="#6b7280" rx="1"/>
      <rect x="68" y="96"  width="6" height="10" fill="#6b7280" rx="1"/>
      <rect x="68" y="166" width="6" height="10" fill="#6b7280" rx="1"/>
      {/* Door B panel */}
      <rect x="200" y="12" width="116" height="184" fill="#f3f4f6" stroke="#374151" strokeWidth="1.5"/>
      {/* Door B glass (upper) */}
      <rect x="208" y="20" width="100" height="76" fill="#dbeafe" stroke="#93c5fd" strokeWidth="1"/>
      {/* Door B lower panel */}
      <rect x="208" y="104" width="100" height="84" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="1"/>
      {/* Door B hinges (on right frame) */}
      <rect x="318" y="26"  width="6" height="10" fill="#6b7280" rx="1"/>
      <rect x="318" y="96"  width="6" height="10" fill="#6b7280" rx="1"/>
      <rect x="318" y="166" width="6" height="10" fill="#6b7280" rx="1"/>
      {/* Interactive wire runs */}
      {activeWires.map(renderWire)}
      {/* Legend */}
      <line x1="4" y1="204" x2="18" y2="204" stroke="#374151" strokeWidth="1"/>
      <text x="20" y="207" fontSize="5.5" fill="#6b7280" fontFamily="sans-serif">RS-485</text>
      <line x1="62" y1="204" x2="76" y2="204" stroke="#7f1d1d" strokeWidth="1" strokeDasharray="3,1.5"/>
      <text x="78" y="207" fontSize="5.5" fill="#6b7280" fontFamily="sans-serif">Power</text>
      {/* Draggable + resizable component boxes */}
      {compKeys.map(k => renderBox(k))}
    </svg>
  )
}

function SchematicNode({ id, data, selected }) {
  const { updateNodeData } = useReactFlow()
  const isDouble   = data.schematicType === 'double_door'
  const lockType   = data.lockType || 'strike'
  const components = { ...(DEFAULT_COMPONENTS[data.schematicType] || {}), ...(data.components || {}) }

  const handleUpdate = (updates) => {
    updateNodeData(id, updates)
    supabase.from('sld_nodes').update({
      data: {
        schematicType: data.schematicType,
        lockType,
        components: data.components || {},
        positions: data.positions || {},
        sizes: data.sizes || {},
        wires: data.wires,
        hiddenComponents: data.hiddenComponents || [],
        ...updates,
      }
    }).eq('id', id)
  }

  return (
    <div
      className="select-none"
      style={{
        background: '#ffffff',
        border: selected ? '2px solid #C8622A' : '1.5px solid #374151',
        borderTop: selected ? '2px solid #C8622A' : '3px solid #374151',
        boxShadow: selected ? '0 0 0 2px rgba(200,98,42,0.25)' : '0 1px 3px rgba(0,0,0,0.12)',
        width: isDouble ? 400 : 320,
        fontFamily: 'sans-serif',
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ padding: '5px 10px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'move' }}>
        <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280' }}>
          {isDouble ? 'Typical Double Door' : 'Typical Single Door'} · drag header to move
        </span>
        {data.label && <span style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>{data.label}</span>}
      </div>
      {isDouble
        ? <DoubleDoorSVG components={components} lockType={lockType} positions={data.positions || {}} sizes={data.sizes || {}} wires={data.wires} hiddenComponents={data.hiddenComponents || []} onUpdate={handleUpdate} />
        : <SingleDoorSVG components={components} lockType={lockType} positions={data.positions || {}} sizes={data.sizes || {}} wires={data.wires} hiddenComponents={data.hiddenComponents || []} onUpdate={handleUpdate} />
      }
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

const SHAPE_PRESETS = {
  fill:   ['#ffffff', '#f3f4f6', '#dbeafe', '#dcfce7', '#fef9c3', '#fee2e2', '#ede9fe', 'none'],
  stroke: ['#374151', '#1e40af', '#15803d', '#b45309', '#dc2626', '#7c3aed', '#C8622A', '#000000'],
}

function ShapeNode({ id, data, selected, width, height }) {
  const shape  = data.shape  || 'rect'
  const fill   = data.fill   ?? '#f3f4f6'
  const stroke = data.stroke ?? '#374151'
  const label  = data.label  || ''
  const w = width  || 160
  const h = height || 100
  const isVertical = data.orientation === 'v'

  const selStroke = selected ? '#C8622A' : stroke
  const selSW     = selected ? 2 : (data.strokeWidth || 1.5)

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <NodeResizer minWidth={40} minHeight={24} isVisible={selected} color="#C8622A" />
      <div style={{
        width: '100%', height: '100%',
        transform: data.rotation ? `rotate(${data.rotation}deg)` : undefined,
        transformOrigin: 'center center',
      }}>
        {shape === 'text' ? (
          <div style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: selected ? '1.5px dashed #C8622A' : '1.5px dashed #9ca3af',
            color: stroke, fontSize: data.fontSize || 13, fontFamily: 'sans-serif',
            padding: '4px 6px', boxSizing: 'border-box', whiteSpace: 'pre-wrap', textAlign: 'center',
            fontWeight: data.bold ? 600 : 400, fontStyle: data.italic ? 'italic' : 'normal',
          }}>
            {label || 'Text'}
          </div>
        ) : (
          <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
            {shape === 'rect' && (
              <rect x={selSW / 2} y={selSW / 2} width={w - selSW} height={h - selSW}
                fill={fill === 'none' ? 'transparent' : fill} stroke={selStroke} strokeWidth={selSW}
                rx={data.rx || 0} />
            )}
            {shape === 'ellipse' && (
              <ellipse cx={w / 2} cy={h / 2} rx={Math.max(1, w / 2 - selSW / 2)} ry={Math.max(1, h / 2 - selSW / 2)}
                fill={fill === 'none' ? 'transparent' : fill} stroke={selStroke} strokeWidth={selSW} />
            )}
            {shape === 'line' && (
              isVertical
                ? <line x1={w / 2} y1={selSW / 2} x2={w / 2} y2={h - selSW / 2}
                    stroke={selStroke} strokeWidth={selSW} strokeDasharray={data.dash || 'none'} />
                : <line x1={0} y1={h / 2} x2={w} y2={h / 2}
                    stroke={selStroke} strokeWidth={selSW} strokeDasharray={data.dash || 'none'} />
            )}
            {shape === 'triangle' && (
              <polygon
                points={`${w/2},${selSW} ${w-selSW},${h-selSW} ${selSW},${h-selSW}`}
                fill={fill === 'none' ? 'transparent' : fill} stroke={selStroke} strokeWidth={selSW} />
            )}
            {shape === 'arrow' && <>
              <defs>
                <marker id={`arr-${id}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill={selStroke} />
                </marker>
              </defs>
              {isVertical
                ? <line x1={w / 2} y1={4} x2={w / 2} y2={h - 4}
                    stroke={selStroke} strokeWidth={selSW} markerEnd={`url(#arr-${id})`} />
                : <line x1={4} y1={h / 2} x2={w - 4} y2={h / 2}
                    stroke={selStroke} strokeWidth={selSW} markerEnd={`url(#arr-${id})`} />
              }
            </>}
            {shape === 'service-loop' && (() => {
              const cy = h / 2
              const cx = w / 2
              const r = Math.min((h / 2) - selSW - 2, w * 0.16, 20)
              const fillColor = fill === 'none' ? 'transparent' : (fill || '#ffffff')
              return <>
                <line x1={0} y1={cy} x2={cx - r} y2={cy} stroke={selStroke} strokeWidth={selSW} strokeLinecap="round" />
                <circle cx={cx} cy={cy} r={Math.max(4, r)} fill={fillColor} stroke={selStroke} strokeWidth={selSW} />
                <circle cx={cx} cy={cy} r={Math.max(2, r * 0.5)} fill="none" stroke={selStroke} strokeWidth={Math.max(0.5, selSW * 0.75)} />
                <line x1={cx + r} y1={cy} x2={w} y2={cy} stroke={selStroke} strokeWidth={selSW} strokeLinecap="round" />
              </>
            })()}
            {label && shape !== 'line' && shape !== 'arrow' && shape !== 'service-loop' && (
              <text x={w / 2} y={h / 2} textAnchor="middle" dominantBaseline="middle"
                fontSize={data.fontSize || 12} fill={data.textColor || stroke}
                fontFamily="sans-serif" fontWeight={data.bold ? 600 : 400}>
                {label}
              </text>
            )}
          </svg>
        )}
      </div>
    </div>
  )
}

const nodeTypes = { device: DeviceNode, schematic: SchematicNode, shape: ShapeNode }

// ─── SLDTab ───────────────────────────────────────────────────────────────────

export default function SLDTab({ proposalId, orgId }) {
  const [diagramId, setDiagramId]           = useState(null)
  const [sheets, setSheets]                 = useState([])
  const [activeSheetId, setActiveSheetId]   = useState(null)
  const [nodes, setNodes, onNodesChange]    = useNodesState([])
  const [edges, setEdges, onEdgesChange]    = useEdgesState([])

  // Intercept dimension changes from NodeResizer to persist sizes
  const handleNodesChange = useCallback((changes) => {
    onNodesChange(changes)
    const resizeDone = changes.filter(c => c.type === 'dimensions' && c.resizing === false && c.dimensions)
    if (resizeDone.length === 0) return
    setNodes(current => {
      const updated = current.map(n => {
        const change = resizeDone.find(c => c.id === n.id)
        if (!change || n.type === 'schematic') return n
        const newData = { ...(n.data || {}), width: Math.round(change.dimensions.width), height: Math.round(change.dimensions.height) }
        supabase.from('sld_nodes').update({ data: newData }).eq('id', n.id)
        return { ...n, data: newData }
      })
      return updated
    })
  }, [onNodesChange, setNodes])
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

      const nodeInserts = (typical.sld_typical_nodes || []).map(tn => {
        const isSchematic = tn.node_type === 'schematic'
        return {
          sheet_id: activeSheetId,
          global_product_id: tn.global_product_id || null,
          label: prefix ? `${prefix}` : tn.label,
          node_type: tn.node_type || 'device',
          position_x: tn.position_x + offsetX,
          position_y: tn.position_y + offsetY,
          data: isSchematic
            ? { schematicType: tn.data?.schematicType, lockType: tn.data?.lockType || 'strike', components: { ...(DEFAULT_COMPONENTS[tn.data?.schematicType] || {}), ...(tn.data?.components || {}) }, positions: {}, sizes: {}, hiddenComponents: [] }
            : { ...(tn.data || {}), quantity: tn.data?.quantity || 1 },
        }
      })

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
        type: n.node_type === 'schematic' ? 'schematic' : n.node_type === 'shape' ? 'shape' : 'device',
        position: { x: n.position_x, y: n.position_y },
        width:  n.node_type !== 'schematic' ? (n.data?.width  || (n.node_type === 'shape' && n.data?.shape === 'service-loop' ? 140 : 160)) : undefined,
        height: n.node_type !== 'schematic' ? (n.data?.height || (n.node_type === 'shape' ? (n.data?.shape === 'text' ? 36 : n.data?.shape === 'line' || n.data?.shape === 'arrow' ? 24 : n.data?.shape === 'service-loop' ? 60 : 100) : undefined)) : undefined,
        data: n.node_type === 'schematic'
          ? { label: n.label, schematicType: n.data?.schematicType, lockType: n.data?.lockType || 'strike', components: n.data?.components || {}, positions: n.data?.positions || {}, sizes: n.data?.sizes || {}, wires: n.data?.wires, hiddenComponents: n.data?.hiddenComponents || [] }
          : n.node_type === 'shape'
          ? { ...n.data, label: n.data?.label || '' }
          : { label: n.label, category: n.data?.category, quantity: n.data?.quantity, notes: n.data?.notes, global_product_id: n.global_product_id, width: n.data?.width, height: n.data?.height },
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
      width: 160,
      data: { label: name || category, category, quantity: 1, global_product_id: globalProductId },
    }])
  }

  const addShape = async (shape, position = null) => {
    if (!activeSheetId) return
    const isLine = shape === 'line' || shape === 'arrow'
    const isText = shape === 'text'
    const isLoop = shape === 'service-loop'
    const w = isLoop ? 140 : 160
    const h = isLine ? 24 : isText ? 36 : isLoop ? 60 : 100
    const px = position?.x ?? (80 + Math.random() * 300)
    const py = position?.y ?? (80 + Math.random() * 200)
    const shapeData = { shape, fill: isLine || isText ? 'none' : isLoop ? '#ffffff' : '#f3f4f6', stroke: '#374151', label: isText ? 'Text' : '', width: w, height: h }
    const { data: newNode } = await supabase.from('sld_nodes').insert({
      sheet_id: activeSheetId, label: '', node_type: 'shape', position_x: px, position_y: py, data: shapeData,
    }).select('id, position_x, position_y').single()
    if (!newNode) return
    setNodes(ns => [...ns, { id: newNode.id, type: 'shape', position: { x: newNode.position_x, y: newNode.position_y }, width: w, height: h, data: shapeData }])
  }

  // ─── Canvas drop handlers (desktop drag + touch) ──────────────────────────

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    if (!rfInstance) return
    const shapeRaw = e.dataTransfer.getData('application/sld-shape')
    if (shapeRaw) {
      try {
        const { shape } = JSON.parse(shapeRaw)
        const position = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        addShape(shape, position)
      } catch {}
      return
    }
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
    if (e.type === 'forgept-sld-shape-drop') {
      const { shape, clientX, clientY } = e.detail
      const position = rfInstance.screenToFlowPosition({ x: clientX, y: clientY })
      addShape(shape, position)
      return
    }
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
    // Always read fresh data from nodes array so position drags aren't overwritten
    const fresh = nodes.find(n => n.id === selectedNode.id) || selectedNode
    const newData = { ...fresh.data, [field]: value }
    const updated = { ...fresh, data: newData }
    setSelectedNode(updated)
    setNodes(ns => ns.map(n => n.id === selectedNode.id ? updated : n))
    await supabase.from('sld_nodes').update(
      field === 'label' ? { label: value } : { data: newData }
    ).eq('id', selectedNode.id)
  }

  const updateSchematicComponent = async (key, value) => {
    if (!selectedNode) return
    const fresh = nodes.find(n => n.id === selectedNode.id) || selectedNode
    const newComponents = { ...(fresh.data.components || {}), [key]: value }
    const newData = { ...fresh.data, components: newComponents }
    const updated = { ...fresh, data: newData }
    setSelectedNode(updated)
    setNodes(ns => ns.map(n => n.id === selectedNode.id ? updated : n))
    await supabase.from('sld_nodes').update({ data: newData }).eq('id', selectedNode.id)
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

      const nodeW = n => n.width || n.data?.width || NODE_W
      const nodeH = n => n.height || n.data?.height || (n.type === 'shape' ? (n.data?.shape === 'line' || n.data?.shape === 'arrow' ? 24 : n.data?.shape === 'service-loop' ? 60 : 100) : NODE_H)

      const minX = Math.min(...nodes.map(n => n.position.x)) - PAD
      const minY = Math.min(...nodes.map(n => n.position.y)) - PAD
      const maxX = Math.max(...nodes.map(n => n.position.x + nodeW(n))) + PAD
      const maxY = Math.max(...nodes.map(n => n.position.y + nodeH(n))) + PAD

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

      // Helper: parse 6-digit hex → [r,g,b]
      const hexRgb = h => {
        const s = (h || '#374151').replace('#', '')
        return [parseInt(s.slice(0,2),16), parseInt(s.slice(2,4),16), parseInt(s.slice(4,6),16)]
      }

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

        const x1 = tx(src.position.x + nodeW(src) / 2)
        const y1 = ty(src.position.y + nodeH(src))
        const x2 = tx(tgt.position.x + nodeW(tgt) / 2)
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
        const x  = tx(node.position.x)
        const y  = ty(node.position.y)
        const nw = nodeW(node) * scale
        const nh = nodeH(node) * scale

        // ── Shape nodes ──────────────────────────────────────────────────────
        if (node.type === 'shape') {
          const shape     = node.data.shape || 'rect'
          const fillHex   = node.data.fill && node.data.fill !== 'none' ? node.data.fill : null
          const strokeHex = node.data.stroke || '#374151'
          const [sr, sg, sb] = hexRgb(strokeHex)
          pdf.setDrawColor(sr, sg, sb)
          pdf.setLineWidth(Math.max(0.2, (node.data.strokeWidth || 1.5) * scale * 0.3))
          pdf.setLineDashPattern([], 0)

          const pdfStyle = fillHex ? 'FD' : 'S'

          if (fillHex) {
            const [fr, fg, fb] = hexRgb(fillHex)
            pdf.setFillColor(fr, fg, fb)
          }

          if (shape === 'rect') {
            const rx = Math.min((node.data.rx || 0) * scale * 0.5, 3)
            if (rx > 0) pdf.roundedRect(x, y, nw, nh, rx, rx, pdfStyle)
            else        pdf.rect(x, y, nw, nh, pdfStyle)

          } else if (shape === 'ellipse') {
            pdf.ellipse(x + nw / 2, y + nh / 2, nw / 2, nh / 2, pdfStyle)

          } else if (shape === 'triangle') {
            pdf.triangle(x + nw / 2, y, x + nw, y + nh, x, y + nh, pdfStyle)

          } else if (shape === 'line') {
            if (node.data.dash === '6,3')  pdf.setLineDashPattern([1.5, 0.75], 0)
            else if (node.data.dash === '2,3') pdf.setLineDashPattern([0.5, 0.75], 0)
            if (node.data.orientation === 'v')
              pdf.line(x + nw / 2, y, x + nw / 2, y + nh)
            else
              pdf.line(x, y + nh / 2, x + nw, y + nh / 2)

          } else if (shape === 'arrow') {
            const isV    = node.data.orientation === 'v'
            const head   = Math.max(1.5, (isV ? nh : nw) * 0.12)
            if (isV) {
              pdf.line(x + nw / 2, y, x + nw / 2, y + nh - head)
              pdf.setFillColor(sr, sg, sb)
              pdf.triangle(x + nw/2, y + nh, x + nw/2 - head*0.5, y + nh - head, x + nw/2 + head*0.5, y + nh - head, 'F')
            } else {
              pdf.line(x, y + nh / 2, x + nw - head, y + nh / 2)
              pdf.setFillColor(sr, sg, sb)
              pdf.triangle(x + nw, y + nh/2, x + nw - head, y + nh/2 - head*0.5, x + nw - head, y + nh/2 + head*0.5, 'F')
            }

          } else if (shape === 'service-loop') {
            const cy = y + nh / 2
            const cx = x + nw / 2
            const r  = Math.max(1, Math.min(nh / 2 - 0.5, nw * 0.16, 6))
            pdf.line(x, cy, cx - r, cy)
            pdf.circle(cx, cy, r, 'S')
            pdf.circle(cx, cy, r * 0.5, 'S')
            pdf.line(cx + r, cy, x + nw, cy)

          } else if (shape === 'text') {
            const [cr, cg, cb] = hexRgb(strokeHex)
            pdf.setTextColor(cr, cg, cb)
            pdf.setFontSize(Math.max(4, (node.data.fontSize || 13) * scale * 2.2))
            pdf.setFont('helvetica', 'normal')
            pdf.text(node.data.label || 'Text', x + nw / 2, y + nh / 2, { align: 'center', baseline: 'middle' })
          }

          // Label on non-text shapes
          if (node.data.label && !['text','line','arrow','service-loop'].includes(shape)) {
            const [cr, cg, cb] = hexRgb(strokeHex)
            pdf.setTextColor(cr, cg, cb)
            pdf.setFontSize(Math.max(4, (node.data.fontSize || 12) * scale * 2.2))
            pdf.setFont('helvetica', 'normal')
            pdf.text(node.data.label, x + nw / 2, y + nh / 2, { align: 'center', baseline: 'middle' })
          }

          return // skip device rendering below
        }

        // ── Device nodes ─────────────────────────────────────────────────────
        if (node.type !== 'device') return
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
        pdf.roundedRect(x, y, nw, nh, 1.5, 1.5, 'FD')

        // Category header strip
        pdf.setFillColor(r, g, b)
        pdf.setGState(pdf.GState({ opacity: 0.12 }))
        pdf.rect(x + 0.5, y + 0.5, nw - 1, nh * 0.38, 'F')
        pdf.setGState(pdf.GState({ opacity: 1 }))

        // Category label
        pdf.setTextColor(r, g, b)
        pdf.setFontSize(5.5)
        pdf.setFont('helvetica', 'bold')
        pdf.text(cat, x + 3, y + nh * 0.22)

        // Device label
        pdf.setTextColor(30, 30, 40)
        pdf.setFontSize(6.5)
        pdf.setFont('helvetica', 'normal')
        const label = node.data.label || ''
        pdf.text(label, x + 3, y + nh * 0.58, { maxWidth: nw - 6 })

        if ((node.data.quantity || 1) > 1) {
          pdf.setFontSize(5)
          pdf.setTextColor(100, 100, 100)
          pdf.text(`×${node.data.quantity}`, x + nw - 4, y + nh - 3, { align: 'right' })
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

      // ── Typicals detail page ──────────────────────────────────────────────
      const schematicNodes = nodes.filter(n => n.type === 'schematic')
      if (schematicNodes.length > 0) {
        pdf.addPage('a3', 'landscape')
        // Page header
        pdf.setFillColor(15, 28, 46)
        pdf.rect(0, 0, PW, HEADER - 2, 'F')
        pdf.setTextColor(200, 98, 42)
        pdf.setFontSize(11)
        pdf.setFont('helvetica', 'bold')
        pdf.text('ForgePt · Typical Details', 10, 8)
        pdf.setTextColor(138, 154, 176)
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'normal')
        pdf.text(diagramName, 10, 13)
        pdf.text(new Date().toLocaleDateString(), PW - 10, 13, { align: 'right' })

        // Draw each schematic as a detail panel, 2 per row
        const panW = 190, panH = 120, marginX = 10, marginY = HEADER + 4, gapX = 10, gapY = 8
        schematicNodes.forEach((sn, idx) => {
          const col = idx % 2
          const row = Math.floor(idx / 2)
          const ox = marginX + col * (panW + gapX)
          const oy = marginY + row * (panH + gapY)
          const c = { ...(DEFAULT_COMPONENTS[sn.data.schematicType] || {}), ...(sn.data.components || {}) }
          const isDouble = sn.data.schematicType === 'double_door'
          const lockType = sn.data.lockType || 'strike'

          // Panel border + title
          pdf.setDrawColor(55, 65, 81)
          pdf.setLineWidth(0.4)
          pdf.rect(ox, oy, panW, panH)
          pdf.setFillColor(248, 249, 250)
          pdf.rect(ox, oy, panW, 8, 'F')
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(7)
          pdf.setTextColor(30, 30, 40)
          pdf.text(isDouble ? 'TYPICAL DOUBLE DOOR' : 'TYPICAL SINGLE DOOR', ox + 3, oy + 5.5)
          if (sn.data.label) {
            pdf.setTextColor(200, 98, 42)
            pdf.text(sn.data.label, ox + panW - 3, oy + 5.5, { align: 'right' })
          }

          // Drawing area
          const dx = ox + 2, dy = oy + 10
          const dwH = panH - 14

          const hexToRgb = (hex) => {
            const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
            return [r,g,b]
          }
          const setColor = (hex) => { const [r,g,b] = hexToRgb(hex); pdf.setDrawColor(r,g,b); pdf.setTextColor(r,g,b) }
          const box = (bx, by, bw, bh, strokeHex, label, labelHex) => {
            setColor(strokeHex)
            pdf.setLineWidth(0.4)
            pdf.rect(bx, by, bw, bh)
            if (label) {
              setColor(labelHex || strokeHex)
              pdf.setFont('helvetica', 'bold')
              pdf.setFontSize(5)
              const lines = label.length > 12 ? [label.substring(0,12), label.substring(12)] : [label]
              lines.forEach((ln, li) => pdf.text(ln, bx + bw/2, by + bh/2 - (lines.length-1)*2 + li*4, { align: 'center' }))
            }
          }

          if (!isDouble) {
            // Wall
            pdf.setFillColor(209,213,219)
            pdf.rect(dx+26, dy, 6, dwH, 'FD')
            // Door
            pdf.setFillColor(243,244,246)
            pdf.setDrawColor(55,65,81)
            pdf.rect(dx+32, dy+8, 50, dwH-10, 'FD')
            // Swing arc (approximated as diagonal dashed line)
            pdf.setLineDashPattern([2,2], 0)
            pdf.setDrawColor(209,213,219)
            pdf.line(dx+32, dy+dwH-2, dx+82, dy+8)
            pdf.setLineDashPattern([], 0)
            // Door handle
            pdf.setDrawColor(156,163,175)
            pdf.circle(dx+74, dy+dwH/2, 2, 'S')

            // Components
            box(dx+80, dy+4, 36, 16, '#78350f', c.panel, '#78350f')
            box(dx+32, dy+3, 18, 6, '#991b1b', c.contact, '#991b1b')
            box(dx+1, dy+dwH/2-8, 24, 12, '#1e40af', c.reader, '#1e40af')
            if (lockType === 'mag') {
              box(dx+32, dy+8, 30, 6, '#4c1d95', c.lock, '#4c1d95')
            } else {
              box(dx+21, dy+dwH/2, 10, 10, '#4c1d95', c.lock, '#4c1d95')
            }
            box(dx+84, dy+dwH/2-8, 24, 12, '#92400e', c.rex, '#92400e')

            // Wires
            pdf.setDrawColor(55,65,81); pdf.setLineWidth(0.3)
            pdf.line(dx+116, dy+10, dx+32, dy+10)  // panel to frame top
            pdf.line(dx+32, dy+10, dx+32, dy+dwH-4) // down wall
            pdf.line(dx+32, dy+dwH/2-2, dx+25, dy+dwH/2-2) // to reader
            pdf.setLineDashPattern([1.5,1], 0)
            pdf.setDrawColor(127,29,29)
            pdf.line(dx+32, dy+dwH/2+5, dx+31, dy+dwH/2+5) // lock power
            pdf.setLineDashPattern([], 0)
          } else {
            // Double door — simplified layout
            pdf.setFillColor(209,213,219)
            pdf.rect(dx+20, dy, 6, dwH, 'FD')  // left wall
            pdf.rect(dx+76, dy, 5, dwH, 'FD')  // center post
            pdf.rect(dx+132, dy, 6, dwH, 'FD') // right wall
            pdf.setFillColor(243,244,246); pdf.setDrawColor(55,65,81)
            pdf.rect(dx+26, dy+8, 50, dwH-10, 'FD') // door A
            pdf.rect(dx+81, dy+8, 50, dwH-10, 'FD') // door B

            box(dx+142, dy+4, 30, 18, '#78350f', c.panel, '#78350f')
            box(dx+26, dy+3, 16, 6, '#991b1b', c.contactA, '#991b1b')
            box(dx+81, dy+3, 16, 6, '#991b1b', c.contactB, '#991b1b')
            box(dx+1, dy+dwH/2-18, 18, 10, '#1e40af', c.readerA, '#1e40af')
            box(dx+1, dy+dwH/2+2, 18, 10, '#1e40af', c.readerB, '#1e40af')
            if (lockType === 'mag') {
              box(dx+20, dy+8, 20, 5, '#4c1d95', c.lockA, '#4c1d95')
              box(dx+76, dy+8, 20, 5, '#4c1d95', c.lockB, '#4c1d95')
            } else {
              box(dx+15, dy+dwH/2-8, 8, 10, '#4c1d95', c.lockA, '#4c1d95')
              box(dx+136, dy+dwH/2-8, 8, 10, '#4c1d95', c.lockB, '#4c1d95')
            }
            box(dx+144, dy+dwH/2-18, 18, 10, '#92400e', c.rexA, '#92400e')
            box(dx+144, dy+dwH/2+2, 18, 10, '#92400e', c.rexB, '#92400e')

            pdf.setDrawColor(55,65,81); pdf.setLineWidth(0.3)
            pdf.line(dx+142, dy+10, dx+26, dy+10)
            pdf.line(dx+26, dy+10, dx+26, dy+dwH-4)
          }

          // Callout legend
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(4.5)
          pdf.setDrawColor(55,65,81); pdf.setTextColor(107,114,128)
          pdf.line(dx, dy+dwH+3, dx+12, dy+dwH+3)
          pdf.text('RS-485', dx+13, dy+dwH+4)
          pdf.setLineDashPattern([1.5,1], 0)
          pdf.setDrawColor(127,29,29)
          pdf.line(dx+30, dy+dwH+3, dx+42, dy+dwH+3)
          pdf.setTextColor(107,114,128)
          pdf.text('Power', dx+43, dy+dwH+4)
          pdf.setLineDashPattern([], 0)
        })
      }

      await savePdf(pdf, `${diagramName.replace(/[^a-z0-9]/gi, '_')}.pdf`)
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
    window.addEventListener('forgept-sld-shape-drop', onTouchDrop)
    return () => {
      window.removeEventListener('forgept-sld-drop', onTouchDrop)
      window.removeEventListener('forgept-sld-shape-drop', onTouchDrop)
    }
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
                { id: 'shapes',   label: 'Shapes' },
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

            {pickerTab === 'shapes' && (
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                <p className="text-xs text-[#8A9AB0] font-medium uppercase tracking-wide px-1 py-1">Drag or click to place</p>
                {[
                  { shape: 'rect',         label: 'Rectangle',   icon: <rect x="2" y="4" width="20" height="16" rx="1" fill="none" stroke="currentColor" strokeWidth="2"/> },
                  { shape: 'ellipse',      label: 'Ellipse',     icon: <ellipse cx="12" cy="12" rx="10" ry="8" fill="none" stroke="currentColor" strokeWidth="2"/> },
                  { shape: 'triangle',     label: 'Triangle',    icon: <polygon points="12,3 22,21 2,21" fill="none" stroke="currentColor" strokeWidth="2"/> },
                  { shape: 'text',         label: 'Text',        icon: <text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="bold" fill="currentColor" fontFamily="serif">T</text> },
                  { shape: 'line',         label: 'Line',        icon: <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2"/> },
                  { shape: 'arrow',        label: 'Arrow',       icon: <><line x1="2" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2"/><path d="M14,7 L22,12 L14,17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></> },
                  { shape: 'service-loop', label: 'Service Loop', icon: <><line x1="2" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="2" fill="none" stroke="currentColor" strokeWidth="1.2"/><line x1="16" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2"/></> },
                ].map(({ shape, label, icon }) => (
                  <DraggableShapeButton key={shape} shape={shape} label={label} onClick={() => addShape(shape)}>
                    <svg width="24" height="24" viewBox="0 0 24 24" className="text-[#8A9AB0] flex-shrink-0">{icon}</svg>
                    <span>{label}</span>
                  </DraggableShapeButton>
                ))}
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
            onNodesChange={handleNodesChange}
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

            {selectedNode && selectedNode.type === 'schematic' ? (
              <div className="p-3 space-y-3">
                <div>
                  <label className="text-xs block mb-1" style={{ color: '#8A9AB0' }}>Door Name</label>
                  <input
                    value={selectedNode.data.label || ''}
                    onChange={e => updateNodeData('label', e.target.value)}
                    className="w-full text-xs border border-[#2a3d55] rounded px-2 py-1.5 focus:outline-none focus:border-[#C8622A]"
                    style={{ background: '#0F1923', color: '#E8EEF5' }}
                  />
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: '#8A9AB0' }}>Lock Type</label>
                  <select
                    value={selectedNode.data.lockType || 'strike'}
                    onChange={e => {
                      const fresh = nodes.find(n => n.id === selectedNode.id) || selectedNode
                      const newPositions = { ...(fresh.data.positions || {}) }
                      delete newPositions.lock; delete newPositions.lockA; delete newPositions.lockB
                      const newData = { ...fresh.data, lockType: e.target.value, positions: newPositions }
                      const updated = { ...fresh, data: newData }
                      setSelectedNode(updated)
                      setNodes(ns => ns.map(n => n.id === selectedNode.id ? updated : n))
                      supabase.from('sld_nodes').update({ data: newData }).eq('id', selectedNode.id)
                    }}
                    className="w-full text-xs border border-[#2a3d55] rounded px-2 py-1.5 focus:outline-none focus:border-[#C8622A]"
                    style={{ background: '#0F1923', color: '#E8EEF5' }}
                  >
                    <option value="strike">Electric Strike</option>
                    <option value="mag">Magnetic Lock (MAG)</option>
                  </select>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8A9AB0' }}>Component Labels</p>
                {Object.entries(DEFAULT_COMPONENTS[selectedNode.data.schematicType] || {}).map(([key, defaultVal]) => (
                  <div key={key}>
                    <label className="text-xs block mb-1 capitalize" style={{ color: '#8A9AB0' }}>
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                    </label>
                    <input
                      value={(selectedNode.data.components || {})[key] ?? defaultVal}
                      onChange={e => updateSchematicComponent(key, e.target.value)}
                      className="w-full text-xs border border-[#2a3d55] rounded px-2 py-1.5 focus:outline-none focus:border-[#C8622A]"
                      style={{ background: '#0F1923', color: '#E8EEF5' }}
                    />
                  </div>
                ))}
                {(selectedNode.data.hiddenComponents || []).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#8A9AB0' }}>Hidden Components</p>
                    <div className="space-y-1">
                      {(selectedNode.data.hiddenComponents || []).map(key => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: '#E8EEF5' }}>
                            {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                          </span>
                          <button
                            onClick={() => {
                              const fresh = nodes.find(n => n.id === selectedNode.id) || selectedNode
                              const newHidden = (fresh.data.hiddenComponents || []).filter(k => k !== key)
                              const newData = { ...fresh.data, hiddenComponents: newHidden }
                              const updated = { ...fresh, data: newData }
                              setSelectedNode(updated)
                              setNodes(ns => ns.map(n => n.id === selectedNode.id ? updated : n))
                              supabase.from('sld_nodes').update({ data: newData }).eq('id', selectedNode.id)
                            }}
                            className="text-xs text-[#C8622A] hover:text-orange-300 transition-colors"
                          >
                            Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      const fresh = nodes.find(n => n.id === selectedNode.id) || selectedNode
                      const newData = { ...fresh.data, positions: {}, sizes: {} }
                      const updated = { ...fresh, data: newData }
                      setSelectedNode(updated)
                      setNodes(ns => ns.map(n => n.id === selectedNode.id ? updated : n))
                      supabase.from('sld_nodes').update({ data: newData }).eq('id', selectedNode.id)
                    }}
                    className="flex-1 text-xs text-[#8A9AB0] hover:text-white border border-[#2a3d55] rounded-md py-1.5 transition-colors"
                    title="Reset component positions and sizes to defaults"
                  >
                    Reset Layout
                  </button>
                  <button
                    onClick={() => {
                      const fresh = nodes.find(n => n.id === selectedNode.id) || selectedNode
                      const { wires: _w, ...rest } = fresh.data
                      const newData = { ...rest }
                      const updated = { ...fresh, data: newData }
                      setSelectedNode(updated)
                      setNodes(ns => ns.map(n => n.id === selectedNode.id ? updated : n))
                      supabase.from('sld_nodes').update({ data: newData }).eq('id', selectedNode.id)
                    }}
                    className="flex-1 text-xs text-[#8A9AB0] hover:text-white border border-[#2a3d55] rounded-md py-1.5 transition-colors"
                    title="Restore default wire runs"
                  >
                    Reset Wires
                  </button>
                </div>
                <button
                  onClick={deleteSelected}
                  className="w-full text-xs text-red-400 hover:text-red-300 border border-red-900/50 hover:border-red-400/50 rounded-md py-1.5 transition-colors"
                >
                  Delete Node
                </button>
              </div>
            ) : selectedNode && selectedNode.type === 'shape' ? (
              <div className="p-3 space-y-3">
                <div>
                  <label className="text-xs block mb-1" style={{ color: '#8A9AB0' }}>Label</label>
                  <input
                    value={selectedNode.data.label || ''}
                    onChange={e => updateNodeData('label', e.target.value)}
                    className="w-full text-xs border border-[#2a3d55] rounded px-2 py-1.5 focus:outline-none focus:border-[#C8622A]"
                    style={{ background: '#0F1923', color: '#E8EEF5' }}
                    placeholder={selectedNode.data.shape === 'text' ? 'Text content' : 'Optional label'}
                  />
                </div>
                {selectedNode.data.shape !== 'line' && selectedNode.data.shape !== 'arrow' && selectedNode.data.shape !== 'text' && (
                  <div>
                    <label className="text-xs block mb-1" style={{ color: '#8A9AB0' }}>Fill</label>
                    <div className="flex flex-wrap gap-1">
                      {SHAPE_PRESETS.fill.map(c => (
                        <button key={c} onClick={() => updateNodeData('fill', c)}
                          title={c}
                          style={{
                            width: 20, height: 20, borderRadius: 3,
                            background: c === 'none' ? 'transparent' : c,
                            border: selectedNode.data.fill === c ? '2px solid #C8622A' : '1.5px solid #4b5563',
                            backgroundImage: c === 'none' ? 'linear-gradient(45deg,#6b7280 25%,transparent 25%,transparent 75%,#6b7280 75%),linear-gradient(45deg,#6b7280 25%,transparent 25%,transparent 75%,#6b7280 75%)' : undefined,
                            backgroundSize: c === 'none' ? '6px 6px' : undefined,
                            backgroundPosition: c === 'none' ? '0 0,3px 3px' : undefined,
                          }} />
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-xs block mb-1" style={{ color: '#8A9AB0' }}>
                    {selectedNode.data.shape === 'text' ? 'Color' : 'Stroke'}
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {SHAPE_PRESETS.stroke.map(c => (
                      <button key={c} onClick={() => updateNodeData('stroke', c)}
                        title={c}
                        style={{
                          width: 20, height: 20, borderRadius: 3,
                          background: c,
                          border: selectedNode.data.stroke === c ? '2px solid #C8622A' : '1.5px solid #4b5563',
                        }} />
                    ))}
                  </div>
                </div>
                {(selectedNode.data.shape === 'text' || selectedNode.data.shape === 'rect' || selectedNode.data.shape === 'ellipse') && (
                  <div>
                    <label className="text-xs block mb-1" style={{ color: '#8A9AB0' }}>Font Size</label>
                    <input type="number" min={6} max={72}
                      value={selectedNode.data.fontSize || (selectedNode.data.shape === 'text' ? 13 : 12)}
                      onChange={e => updateNodeData('fontSize', parseInt(e.target.value) || 12)}
                      className="w-full text-xs border border-[#2a3d55] rounded px-2 py-1.5 focus:outline-none focus:border-[#C8622A]"
                      style={{ background: '#0F1923', color: '#E8EEF5' }} />
                  </div>
                )}
                {(selectedNode.data.shape === 'rect') && (
                  <div>
                    <label className="text-xs block mb-1" style={{ color: '#8A9AB0' }}>Corner Radius</label>
                    <input type="number" min={0} max={80}
                      value={selectedNode.data.rx || 0}
                      onChange={e => updateNodeData('rx', parseInt(e.target.value) || 0)}
                      className="w-full text-xs border border-[#2a3d55] rounded px-2 py-1.5 focus:outline-none focus:border-[#C8622A]"
                      style={{ background: '#0F1923', color: '#E8EEF5' }} />
                  </div>
                )}
                {(selectedNode.data.shape === 'line') && (
                  <div>
                    <label className="text-xs block mb-1" style={{ color: '#8A9AB0' }}>Style</label>
                    <select value={selectedNode.data.dash || 'none'}
                      onChange={e => updateNodeData('dash', e.target.value === 'none' ? null : e.target.value)}
                      className="w-full text-xs border border-[#2a3d55] rounded px-2 py-1.5 focus:outline-none focus:border-[#C8622A]"
                      style={{ background: '#0F1923', color: '#E8EEF5' }}>
                      <option value="none">Solid</option>
                      <option value="6,3">Dashed</option>
                      <option value="2,3">Dotted</option>
                    </select>
                  </div>
                )}
                {(selectedNode.data.shape === 'line' || selectedNode.data.shape === 'arrow') && (
                  <div>
                    <label className="text-xs block mb-1" style={{ color: '#8A9AB0' }}>Orientation</label>
                    <div className="flex gap-1">
                      {['h', 'v'].map(dir => (
                        <button key={dir}
                          onClick={() => updateNodeData('orientation', dir)}
                          className="flex-1 text-xs py-1.5 rounded border transition-colors"
                          style={{
                            background: '#0F1923',
                            borderColor: (selectedNode.data.orientation || 'h') === dir ? '#C8622A' : '#2a3d55',
                            color: (selectedNode.data.orientation || 'h') === dir ? '#C8622A' : '#8A9AB0',
                          }}>
                          {dir === 'h' ? 'Horizontal' : 'Vertical'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-xs block mb-1" style={{ color: '#8A9AB0' }}>Rotate</label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => updateNodeData('rotation', ((selectedNode.data.rotation || 0) - 90 + 360) % 360)}
                      className="flex-1 text-xs py-1.5 rounded border border-[#2a3d55] text-[#8A9AB0] hover:text-white transition-colors"
                      style={{ background: '#0F1923' }}>
                      ↺ -90°
                    </button>
                    <button
                      onClick={() => updateNodeData('rotation', ((selectedNode.data.rotation || 0) + 90) % 360)}
                      className="flex-1 text-xs py-1.5 rounded border border-[#2a3d55] text-[#8A9AB0] hover:text-white transition-colors"
                      style={{ background: '#0F1923' }}>
                      ↻ +90°
                    </button>
                  </div>
                </div>
                <button onClick={deleteSelected}
                  className="w-full text-xs text-red-400 hover:text-red-300 border border-red-900/50 hover:border-red-400/50 rounded-md py-1.5 transition-colors">
                  Delete Shape
                </button>
              </div>
            ) : selectedNode ? (
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
                <div>
                  <label className="text-xs block mb-1" style={{ color: '#8A9AB0' }}>Rotate</label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => updateNodeData('rotation', ((selectedNode.data.rotation || 0) - 90 + 360) % 360)}
                      className="flex-1 text-xs py-1.5 rounded border border-[#2a3d55] text-[#8A9AB0] hover:text-white transition-colors"
                      style={{ background: '#0F1923' }}>
                      ↺ -90°
                    </button>
                    <button
                      onClick={() => updateNodeData('rotation', ((selectedNode.data.rotation || 0) + 90) % 360)}
                      className="flex-1 text-xs py-1.5 rounded border border-[#2a3d55] text-[#8A9AB0] hover:text-white transition-colors"
                      style={{ background: '#0F1923' }}>
                      ↻ +90°
                    </button>
                  </div>
                </div>
                <button
                  onClick={deleteSelected}
                  className="w-full text-xs text-red-400 hover:text-red-300 border border-red-900/50 hover:border-red-400/50 rounded-md py-1.5 transition-colors"
                >
                  Delete Node
                </button>
              </div>
            ) : null}

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
