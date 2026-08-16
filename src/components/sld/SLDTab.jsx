import { useState, useEffect, useCallback } from 'react'
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

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORY_ICONS = {
  'Camera':                   '📷',
  'NVR':                      '🖥️',
  'DVR':                      '🖥️',
  'Network Switch':           '🔀',
  'Access Control Panel':     '🔒',
  'Access Control Enclosure': '🗄️',
  'Door Reader':              '💳',
  'Door Contact':             '🚪',
  'Request to Exit':          '🚪',
  'Electric Lock':            '⚡',
  'Video Intercom':           '📞',
  'Alarm Panel':              '🚨',
  'Motion Sensor':            '👁️',
  'Smoke Detector':           '🔥',
  'UPS / Battery Backup':     '🔋',
  'Power Supply':             '🔌',
  'Wireless Access Point':    '📡',
  'Server':                   '🖥️',
  'Fiber Converter':          '💡',
  'Speaker':                  '🔊',
  'Monitor / Display':        '🖥️',
  'Other':                    '📦',
}

const CATEGORY_COLORS = {
  'Camera':                   '#3B82F6',
  'NVR':                      '#6366F1',
  'DVR':                      '#6366F1',
  'Network Switch':           '#10B981',
  'Access Control Panel':     '#F59E0B',
  'Access Control Enclosure': '#F59E0B',
  'Door Reader':              '#F59E0B',
  'Door Contact':             '#EF4444',
  'Request to Exit':          '#EF4444',
  'Electric Lock':            '#8B5CF6',
  'Video Intercom':           '#3B82F6',
  'Alarm Panel':              '#EF4444',
  'Motion Sensor':            '#EF4444',
  'Smoke Detector':           '#EF4444',
  'UPS / Battery Backup':     '#10B981',
  'Power Supply':             '#10B981',
  'Wireless Access Point':    '#3B82F6',
  'Server':                   '#6366F1',
  'Fiber Converter':          '#10B981',
  'Speaker':                  '#8B5CF6',
  'Monitor / Display':        '#6366F1',
  'Other':                    '#6B7280',
}

const QUICK_ADD_CATEGORIES = [
  'Camera', 'NVR', 'Network Switch', 'Access Control Panel',
  'Access Control Enclosure', 'Door Reader', 'Electric Lock',
  'Alarm Panel', 'Power Supply', 'UPS / Battery Backup',
  'Wireless Access Point', 'Server', 'Other',
]

const WIRE_TYPES = [
  { value: 'default',  label: 'Default' },
  { value: 'network',  label: 'CAT6/Network' },
  { value: 'power',    label: 'Power' },
  { value: 'fiber',    label: 'Fiber' },
  { value: 'wireless', label: 'Wireless' },
  { value: 'rs485',    label: 'RS-485' },
]

const WIRE_COLORS = {
  default:  '#9CA3AF',
  network:  '#3B82F6',
  power:    '#F59E0B',
  fiber:    '#10B981',
  wireless: '#8B5CF6',
  rs485:    '#EF4444',
}

const WIRE_DASH = {
  default:  'none',
  network:  'none',
  power:    'none',
  fiber:    '8 4',
  wireless: '4 4',
  rs485:    '2 2',
}

// ─── Custom Node ──────────────────────────────────────────────────────────────

function DeviceNode({ data, selected }) {
  const color = CATEGORY_COLORS[data.category] || '#6B7280'
  const icon  = CATEGORY_ICONS[data.category] || '📦'
  return (
    <div
      className="rounded-lg border-2 select-none"
      style={{
        borderColor: selected ? '#C8622A' : color,
        background: '#1a2d45',
        color: '#E8EEF5',
        minWidth: 120,
        maxWidth: 180,
        boxShadow: selected ? '0 0 0 2px #C8622A40' : '0 2px 6px rgba(0,0,0,0.4)',
      }}
    >
      <Handle type="target" position={Position.Top}
        style={{ width: 8, height: 8, background: '#4A5568', border: '1px solid #2a3d55' }} />

      <div className="px-3 pt-2 pb-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: `${color}18` }}>
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{icon}</span>
          <span className="text-xs font-semibold truncate" style={{ color }}>
            {data.category || 'Device'}
          </span>
        </div>
      </div>

      <div className="px-3 py-2">
        <p className="text-xs font-semibold leading-tight" style={{ color: '#E8EEF5' }}>{data.label}</p>
        {data.quantity > 1 && (
          <p className="text-xs mt-0.5" style={{ color: '#8A9AB0' }}>×{data.quantity}</p>
        )}
        {data.notes && (
          <p className="text-xs mt-0.5 truncate" style={{ color: '#8A9AB0' }}>{data.notes}</p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom}
        style={{ width: 8, height: 8, background: '#4A5568', border: '1px solid #2a3d55' }} />
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
        setSheets(sorted)
        if (sorted.length > 0) setActiveSheetId(sorted[0].id)
      }

      // Load global products for device picker
      const { data: gp } = await supabase
        .from('global_products')
        .select('id, name, category, manufacturer')
        .order('category').order('name')
      setGlobalProducts(gp || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
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
          label: e.label || '',
          type: 'smoothstep',
          style: { stroke: WIRE_COLORS[wt], strokeDasharray: WIRE_DASH[wt] || 'none' },
          data: { wire_type: wt },
          markerEnd: { type: MarkerType.ArrowClosed, color: WIRE_COLORS[wt] },
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
      type: 'smoothstep',
      style: { stroke: WIRE_COLORS[wt], strokeDasharray: WIRE_DASH[wt] || 'none' },
      data: { wire_type: wt },
      markerEnd: { type: MarkerType.ArrowClosed, color: WIRE_COLORS[wt] },
    }, eds))
  }, [activeSheetId, edgeWireType])

  const handleNodeDragStop = useCallback(async (_, node) => {
    await supabase.from('sld_nodes').update({ position_x: node.position.x, position_y: node.position.y }).eq('id', node.id)
  }, [])

  const addDevice = async (category, name, globalProductId = null) => {
    if (!activeSheetId) return
    const { data: newNode } = await supabase.from('sld_nodes').insert({
      sheet_id: activeSheetId,
      label: name || category,
      node_type: 'device',
      position_x: 80 + Math.random() * 300,
      position_y: 80 + Math.random() * 200,
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
      style: { stroke: WIRE_COLORS[wt], strokeDasharray: WIRE_DASH[wt] || 'none' },
      data: { ...selectedEdge.data, wire_type: wt },
      markerEnd: { type: MarkerType.ArrowClosed, color: WIRE_COLORS[wt] },
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
      </div>

      {/* Canvas + panels */}
      <div className="flex flex-1 overflow-hidden">

        {/* Device picker */}
        {showDevicePanel && (
          <div className="w-52 flex-shrink-0 flex flex-col overflow-hidden border-r border-[#2a3d55]" style={{ background: '#1a2d45' }}>
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
                    <button
                      key={cat}
                      onClick={() => addDevice(cat, cat)}
                      className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-[#8A9AB0] hover:text-white hover:bg-[#2a3d55] transition-colors text-xs"
                    >
                      <span>{CATEGORY_ICONS[cat] || '📦'}</span>
                      <span className="truncate">{cat}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(productsByCategory).map(([cat, products]) => (
                    <div key={cat}>
                      <p className="text-xs text-[#8A9AB0] font-medium uppercase tracking-wide px-1 mb-1">{cat}</p>
                      {products.map(p => (
                        <button
                          key={p.id}
                          onClick={() => addDevice(cat, p.name, p.id)}
                          className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-[#8A9AB0] hover:text-white hover:bg-[#2a3d55] transition-colors text-xs"
                        >
                          <span>{CATEGORY_ICONS[cat] || '📦'}</span>
                          <span className="truncate">{p.name}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                  {Object.keys(productsByCategory).length === 0 && (
                    <p className="text-xs text-[#8A9AB0] text-center py-4">No devices found</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* React Flow */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={handleNodeDragStop}
            onNodeClick={(_, node) => { setSelectedNode(node); setSelectedEdge(null) }}
            onEdgeClick={(_, edge) => { setSelectedEdge(edge); setSelectedNode(null) }}
            onPaneClick={() => { setSelectedNode(null); setSelectedEdge(null) }}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode={null}
            style={{ background: '#0F1923' }}
          >
            <Background color="#1a2d45" gap={20} size={1} />
            <Controls />
            <MiniMap nodeColor={n => CATEGORY_COLORS[n.data?.category] || '#6B7280'} style={{ background: '#1a2d45' }} />
            {nodes.length === 0 && (
              <Panel position="top-center">
                <div className="mt-10 text-center">
                  <p className="text-sm" style={{ color: '#8A9AB0' }}>
                    Click a device in the panel to add it, then drag connections between nodes.
                  </p>
                  <p className="text-xs mt-1" style={{ color: '#8A9AB0' }}>
                    Or use <strong style={{ color: '#E8EEF5' }}>Auto-Build</strong> to generate from the Drawing tab.
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
    </div>
  )
}
