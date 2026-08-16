import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

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

// ─── Custom Node ──────────────────────────────────────────────────────────────

function DeviceNode({ data, selected }) {
  const color = CATEGORY_COLORS[data.category] || '#6B7280'
  const icon  = CATEGORY_ICONS[data.category] || '📦'
  return (
    <div
      className="rounded-lg border-2 bg-fp-card text-fp-text select-none"
      style={{
        borderColor: selected ? '#C8622A' : color,
        minWidth: 120,
        maxWidth: 180,
        boxShadow: selected ? `0 0 0 2px #C8622A40` : `0 2px 6px rgba(0,0,0,0.3)`,
      }}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-fp-muted !border-fp-border" />

      <div className="px-3 pt-2 pb-1 border-b border-fp-border/50" style={{ backgroundColor: `${color}18` }}>
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{icon}</span>
          <span className="text-xs font-semibold truncate" style={{ color }}>
            {data.category || 'Device'}
          </span>
        </div>
      </div>

      <div className="px-3 py-2">
        <p className="text-xs font-semibold text-fp-text leading-tight">{data.label}</p>
        {data.quantity > 1 && (
          <p className="text-xs text-fp-muted mt-0.5">×{data.quantity}</p>
        )}
        {data.notes && (
          <p className="text-xs text-fp-muted mt-0.5 truncate">{data.notes}</p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-fp-muted !border-fp-border" />
    </div>
  )
}

const nodeTypes = { device: DeviceNode }

// ─── Edge type options ────────────────────────────────────────────────────────

const WIRE_TYPES = [
  { value: 'default',  label: 'Default',      dash: 'none' },
  { value: 'network',  label: 'CAT6/Network',  dash: 'none' },
  { value: 'power',    label: 'Power',         dash: 'none' },
  { value: 'fiber',    label: 'Fiber',         dash: '8 4' },
  { value: 'wireless', label: 'Wireless',      dash: '4 4' },
  { value: 'rs485',    label: 'RS-485',        dash: '2 2' },
]

const WIRE_COLORS = {
  default:  '#9CA3AF',
  network:  '#3B82F6',
  power:    '#F59E0B',
  fiber:    '#10B981',
  wireless: '#8B5CF6',
  rs485:    '#EF4444',
}

// ─── SLD Editor ───────────────────────────────────────────────────────────────

export default function SLD({ isAdmin, featureProposals, featureCRM, featurePurchaseOrders, featureInvoices, featureSla, featureMonitoring, featureDrawingTool, featureDesignerOnly, role, isSalesManager, isPM, isTechnician }) {
  const { id: diagramId } = useParams()
  const navigate = useNavigate()

  const [diagram, setDiagram]         = useState(null)
  const [sheets, setSheets]           = useState([])
  const [activeSheetId, setActiveSheetId] = useState(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [selectedNode, setSelectedNode] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)
  const [showDevicePanel, setShowDevicePanel] = useState(true)
  const [deviceSearch, setDeviceSearch] = useState('')
  const [globalProducts, setGlobalProducts] = useState([])
  const [autoBuilding, setAutoBuilding] = useState(false)
  const [renaming, setRenaming]       = useState(null) // sheet id being renamed
  const [newSheetName, setNewSheetName] = useState('')
  const [edgeWireType, setEdgeWireType] = useState('default')
  const [diagramName, setDiagramName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const reactFlowWrapper = useRef(null)
  const saveTimer = useRef(null)

  useEffect(() => { loadDiagram() }, [diagramId])
  useEffect(() => { if (activeSheetId) loadSheet(activeSheetId) }, [activeSheetId])

  const loadDiagram = async () => {
    setLoading(true)
    try {
      const { data: diag } = await supabase
        .from('sld_diagrams')
        .select('*, sld_sheets(id, name, sort_order)')
        .eq('id', diagramId)
        .single()

      if (!diag) { navigate('/sld'); return }

      diag.sld_sheets.sort((a, b) => a.sort_order - b.sort_order)
      setDiagram(diag)
      setDiagramName(diag.name)
      setSheets(diag.sld_sheets)
      if (diag.sld_sheets.length > 0) setActiveSheetId(diag.sld_sheets[0].id)

      // Load global products for device picker
      const { data: gp } = await supabase
        .from('global_products')
        .select('id, name, category, manufacturer, symbol_svg_path')
        .order('category')
        .order('name')
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

      const flowNodes = (sldNodes || []).map(n => ({
        id: n.id,
        type: 'device',
        position: { x: n.position_x, y: n.position_y },
        data: { label: n.label, category: n.data?.category, quantity: n.data?.quantity, notes: n.data?.notes, global_product_id: n.global_product_id },
      }))

      const flowEdges = (sldEdges || []).map(e => {
        const wt = e.wire_type || 'default'
        return {
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
          label: e.label || '',
          type: 'smoothstep',
          style: { stroke: WIRE_COLORS[wt] || '#9CA3AF', strokeDasharray: WIRE_TYPES.find(w => w.value === wt)?.dash || 'none' },
          data: { wire_type: wt },
          markerEnd: { type: MarkerType.ArrowClosed, color: WIRE_COLORS[wt] || '#9CA3AF' },
        }
      })

      setNodes(flowNodes)
      setEdges(flowEdges)
      setSelectedNode(null)
      setSelectedEdge(null)
    } catch (err) {
      console.error(err)
    }
  }

  // ─── Persistence ────────────────────────────────────────────────────────────

  const scheduleAutoSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveSheet(), 2000)
  }, [nodes, edges, activeSheetId])

  const saveSheet = useCallback(async (nodeOverride = null, edgeOverride = null) => {
    if (!activeSheetId) return
    setSaving(true)
    try {
      const currentNodes = nodeOverride ?? nodes
      const currentEdges = edgeOverride ?? edges

      // Upsert nodes
      if (currentNodes.length > 0) {
        await supabase.from('sld_nodes').upsert(
          currentNodes.map(n => ({
            id: n.id,
            sheet_id: activeSheetId,
            label: n.data.label,
            node_type: 'device',
            position_x: n.position.x,
            position_y: n.position.y,
            global_product_id: n.data.global_product_id || null,
            data: { category: n.data.category, quantity: n.data.quantity, notes: n.data.notes },
          })),
          { onConflict: 'id' }
        )
      }

      // Upsert edges — only real DB edges (uuid-like IDs)
      const dbEdges = currentEdges.filter(e => e.id && e.id.length > 20)
      if (dbEdges.length > 0) {
        await supabase.from('sld_edges').upsert(
          dbEdges.map(e => ({
            id: e.id,
            sheet_id: activeSheetId,
            source_node_id: e.source,
            target_node_id: e.target,
            label: e.label || null,
            wire_type: e.data?.wire_type || 'default',
          })),
          { onConflict: 'id' }
        )
      }

      // Update diagram updated_at
      await supabase.from('sld_diagrams').update({ updated_at: new Date().toISOString() }).eq('id', diagramId)
    } catch (err) {
      console.error('Save error:', err)
    } finally {
      setSaving(false)
    }
  }, [activeSheetId, nodes, edges, diagramId])

  // ─── Node / Edge actions ─────────────────────────────────────────────────

  const onConnect = useCallback(async (params) => {
    const wt = edgeWireType
    const edgeData = {
      sheet_id: activeSheetId,
      source_node_id: params.source,
      target_node_id: params.target,
      wire_type: wt,
      label: null,
    }
    const { data: newEdge } = await supabase.from('sld_edges').insert(edgeData).select('id').single()
    if (!newEdge) return

    setEdges(eds => addEdge({
      ...params,
      id: newEdge.id,
      type: 'smoothstep',
      style: { stroke: WIRE_COLORS[wt], strokeDasharray: WIRE_TYPES.find(w => w.value === wt)?.dash || 'none' },
      data: { wire_type: wt },
      markerEnd: { type: MarkerType.ArrowClosed, color: WIRE_COLORS[wt] },
    }, eds))
  }, [activeSheetId, edgeWireType])

  const handleNodeDragStop = useCallback(async (_, node) => {
    await supabase.from('sld_nodes').update({ position_x: node.position.x, position_y: node.position.y }).eq('id', node.id)
  }, [])

  const addDevice = async (category, name, globalProductId = null) => {
    if (!activeSheetId) return
    const label = name || category
    const { data: newNode } = await supabase.from('sld_nodes').insert({
      sheet_id: activeSheetId,
      label,
      node_type: 'device',
      position_x: 100 + Math.random() * 300,
      position_y: 100 + Math.random() * 200,
      global_product_id: globalProductId,
      data: { category, quantity: 1 },
    }).select('id, position_x, position_y').single()

    if (!newNode) return

    setNodes(ns => [...ns, {
      id: newNode.id,
      type: 'device',
      position: { x: newNode.position_x, y: newNode.position_y },
      data: { label, category, quantity: 1, global_product_id: globalProductId },
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
      field === 'label'
        ? { label: value }
        : { data: { ...selectedNode.data, [field]: value } }
    ).eq('id', selectedNode.id)
  }

  const updateEdgeType = async (wt) => {
    if (!selectedEdge) return
    const style = { stroke: WIRE_COLORS[wt], strokeDasharray: WIRE_TYPES.find(w => w.value === wt)?.dash || 'none' }
    const updated = { ...selectedEdge, style, data: { ...selectedEdge.data, wire_type: wt }, markerEnd: { type: MarkerType.ArrowClosed, color: WIRE_COLORS[wt] } }
    setSelectedEdge(updated)
    setEdges(es => es.map(e => e.id === selectedEdge.id ? updated : e))
    await supabase.from('sld_edges').update({ wire_type: wt }).eq('id', selectedEdge.id)
  }

  // ─── Sheets ─────────────────────────────────────────────────────────────────

  const addSheet = async () => {
    const sortOrder = sheets.length
    const name = `Sheet ${sortOrder + 1}`
    const { data: sheet } = await supabase.from('sld_sheets').insert({
      diagram_id: diagramId, name, sort_order: sortOrder,
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

  const saveDiagramName = async () => {
    await supabase.from('sld_diagrams').update({ name: diagramName }).eq('id', diagramId)
    setDiagram(d => ({ ...d, name: diagramName }))
    setEditingName(false)
  }

  // ─── Auto-Build from floor plan ──────────────────────────────────────────────

  const autoBuild = async () => {
    if (!diagram?.proposal_id) {
      alert('This diagram is not linked to a proposal. Link it first to use Auto-Build.')
      return
    }
    if (!confirm('Auto-Build will generate nodes from floor plan placements and cable runs. Any existing nodes on this sheet will be replaced. Continue?')) return

    setAutoBuilding(true)
    try {
      // Load placements
      const { data: placements } = await supabase
        .from('drawing_placements')
        .select(`
          id, label, device_type,
          drawing_sheets!inner(proposal_id)
        `)
        .eq('drawing_sheets.proposal_id', diagram.proposal_id)

      if (!placements || placements.length === 0) {
        alert('No floor plan devices found for this proposal. Add devices in the Designer first.')
        return
      }

      // Load cable runs
      const { data: cableRuns } = await supabase
        .from('cable_runs')
        .select('id, source_placement_id, target_placement_id, cable_type')
        .eq('proposal_id', diagram.proposal_id)

      // Delete current sheet content
      await supabase.from('sld_nodes').delete().eq('sheet_id', activeSheetId)
      await supabase.from('sld_edges').delete().eq('sheet_id', activeSheetId)

      // Use dagre for layout
      const dagre = (await import('dagre')).default
      const g = new dagre.graphlib.Graph()
      g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 50, edgesep: 20 })
      g.setDefaultEdgeLabel(() => ({}))

      placements.forEach(p => {
        g.setNode(p.id, { width: 160, height: 70 })
      })

      const runs = cableRuns || []
      runs.forEach(r => {
        if (r.source_placement_id && r.target_placement_id) {
          g.setEdge(r.source_placement_id, r.target_placement_id)
        }
      })

      // Category-based inference if no cable runs
      if (runs.length === 0) {
        const byCategory = {}
        placements.forEach(p => {
          const cat = p.device_type || 'Other'
          if (!byCategory[cat]) byCategory[cat] = []
          byCategory[cat].push(p.id)
        })
        // Cameras → NVR/DVR → Network Switch → Server
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
          if (parentIds.length > 0) {
            childIds.forEach(cId => { g.setEdge(cId, parentIds[0]) })
          }
        })
      }

      dagre.layout(g)

      // Insert nodes
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

      const { data: insertedNodes } = await supabase.from('sld_nodes').insert(nodeInserts).select('id, position_x, position_y, label, data')

      // Build placement→node id map
      const placementToNode = {}
      placements.forEach((p, i) => { placementToNode[p.id] = insertedNodes?.[i]?.id })

      // Insert edges from cable runs
      const edgeInserts = runs
        .filter(r => placementToNode[r.source_placement_id] && placementToNode[r.target_placement_id])
        .map(r => ({
          sheet_id: activeSheetId,
          source_node_id: placementToNode[r.source_placement_id],
          target_node_id: placementToNode[r.target_placement_id],
          wire_type: r.cable_type === 'fiber' ? 'fiber' : r.cable_type === 'coax' ? 'default' : 'network',
        }))

      if (edgeInserts.length > 0) {
        await supabase.from('sld_edges').insert(edgeInserts)
      }

      await loadSheet(activeSheetId)
    } catch (err) {
      console.error('Auto-build error:', err)
      alert('Auto-build failed. See console for details.')
    } finally {
      setAutoBuilding(false)
    }
  }

  // ─── Filtered device picker ──────────────────────────────────────────────────

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

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.matches('input, textarea')) {
        e.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteSelected])

  if (loading) {
    return (
      <div className="flex min-h-screen bg-fp-inset">
        <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} featureSla={featureSla} featureMonitoring={featureMonitoring} featureDrawingTool={featureDrawingTool} featureDesignerOnly={featureDesignerOnly} role={role} isSalesManager={isSalesManager} isPM={isPM} isTechnician={isTechnician} />
        <div className="flex-1 flex items-center justify-center">
          <svg className="w-8 h-8 animate-spin text-[#C8622A]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-fp-inset">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} featureSla={featureSla} featureMonitoring={featureMonitoring} featureDrawingTool={featureDrawingTool} featureDesignerOnly={featureDesignerOnly} role={role} isSalesManager={isSalesManager} isPM={isPM} isTechnician={isTechnician} />

      <div className="flex-1 flex flex-col overflow-hidden" style={{ height: '100vh' }}>

        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-2 bg-fp-card border-b border-fp-border flex-shrink-0">
          <button onClick={() => navigate('/sld')} className="text-fp-muted hover:text-fp-text transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
          </button>

          {editingName ? (
            <input
              autoFocus
              value={diagramName}
              onChange={e => setDiagramName(e.target.value)}
              onBlur={saveDiagramName}
              onKeyDown={e => e.key === 'Enter' && saveDiagramName()}
              className="bg-fp-inset text-fp-text text-sm font-semibold border border-fp-brand rounded px-2 py-0.5 focus:outline-none"
            />
          ) : (
            <button onClick={() => setEditingName(true)} className="text-fp-text text-sm font-semibold hover:text-[#C8622A] transition-colors">
              {diagram?.name || 'Untitled Diagram'}
            </button>
          )}

          <div className="flex items-center gap-1 text-xs text-fp-muted ml-auto">
            {saving && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Saving...
              </span>
            )}
          </div>

          {/* Wire type selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-fp-muted">Wire:</span>
            <select
              value={edgeWireType}
              onChange={e => setEdgeWireType(e.target.value)}
              className="bg-fp-inset text-fp-text text-xs border border-fp-border rounded px-2 py-1 focus:outline-none focus:border-fp-brand"
            >
              {WIRE_TYPES.map(wt => (
                <option key={wt.value} value={wt.value}>{wt.label}</option>
              ))}
            </select>
          </div>

          {/* Auto-build */}
          {diagram?.proposal_id && (
            <button
              onClick={autoBuild}
              disabled={autoBuilding}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-fp-inset border border-fp-border text-fp-text text-xs font-medium rounded-lg hover:border-fp-brand/60 transition-colors disabled:opacity-50"
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
          )}

          {/* Toggle device panel */}
          <button
            onClick={() => setShowDevicePanel(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${showDevicePanel ? 'bg-fp-brand text-white border-fp-brand' : 'bg-fp-inset text-fp-muted border-fp-border hover:border-fp-brand/60'}`}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
            </svg>
            Devices
          </button>
        </div>

        {/* Sheet tabs */}
        <div className="flex items-center gap-1 px-4 py-1.5 bg-fp-card border-b border-fp-border flex-shrink-0 overflow-x-auto">
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
                  className="bg-fp-inset text-fp-text text-xs border border-fp-brand rounded px-2 py-1 focus:outline-none w-28"
                />
              ) : (
                <button
                  onClick={() => setActiveSheetId(sheet.id)}
                  onDoubleClick={() => { setRenaming(sheet.id); setNewSheetName(sheet.name) }}
                  className={`text-xs px-3 py-1 rounded-md transition-colors ${activeSheetId === sheet.id ? 'bg-fp-brand text-white' : 'text-fp-muted hover:text-fp-text hover:bg-fp-inset'}`}
                >
                  {sheet.name}
                </button>
              )}
              {sheets.length > 1 && activeSheetId === sheet.id && (
                <button
                  onClick={() => deleteSheet(sheet.id)}
                  className="text-fp-muted hover:text-red-400 transition-colors p-0.5"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addSheet}
            className="flex-shrink-0 flex items-center gap-1 text-xs text-fp-muted hover:text-fp-text px-2 py-1 rounded-md hover:bg-fp-inset transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Add Sheet
          </button>
        </div>

        {/* Main editor area */}
        <div className="flex flex-1 overflow-hidden">

          {/* Device panel */}
          {showDevicePanel && (
            <div className="w-56 flex-shrink-0 bg-fp-card border-r border-fp-border flex flex-col overflow-hidden">
              <div className="p-2 border-b border-fp-border">
                <input
                  type="text"
                  placeholder="Search devices..."
                  value={deviceSearch}
                  onChange={e => setDeviceSearch(e.target.value)}
                  className="w-full bg-fp-inset text-fp-text text-xs border border-fp-border rounded px-2 py-1.5 focus:outline-none focus:border-fp-brand placeholder-fp-muted"
                />
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {deviceSearch === '' ? (
                  // Quick-add categories
                  <div className="space-y-1">
                    <p className="text-xs text-fp-muted font-medium uppercase tracking-wide px-1 mb-2">Quick Add</p>
                    {QUICK_ADD_CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        onClick={() => addDevice(cat, cat)}
                        className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-fp-inset text-fp-muted hover:text-fp-text transition-colors text-xs"
                      >
                        <span>{CATEGORY_ICONS[cat] || '📦'}</span>
                        <span className="truncate">{cat}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  // Search results from global products
                  <div className="space-y-3">
                    {Object.entries(productsByCategory).map(([cat, products]) => (
                      <div key={cat}>
                        <p className="text-xs text-fp-muted font-medium uppercase tracking-wide px-1 mb-1">{cat}</p>
                        {products.map(p => (
                          <button
                            key={p.id}
                            onClick={() => addDevice(cat, p.name, p.id)}
                            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-fp-inset text-fp-muted hover:text-fp-text transition-colors text-xs"
                          >
                            <span>{CATEGORY_ICONS[cat] || '📦'}</span>
                            <span className="truncate">{p.name}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                    {Object.keys(productsByCategory).length === 0 && (
                      <p className="text-xs text-fp-muted text-center py-4">No devices found</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* React Flow canvas */}
          <div className="flex-1 relative" ref={reactFlowWrapper}>
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
              <Background color="#1E2C3A" gap={20} size={1} />
              <Controls className="!bg-fp-card !border-fp-border !rounded-lg" />
              <MiniMap
                nodeColor={n => CATEGORY_COLORS[n.data?.category] || '#6B7280'}
                className="!bg-fp-card !border-fp-border !rounded-lg"
              />

              {/* Empty state hint */}
              {nodes.length === 0 && (
                <Panel position="top-center">
                  <div className="mt-8 text-center">
                    <p className="text-fp-muted text-sm">Click a device in the panel to add it, or drag connections between nodes.</p>
                    {diagram?.proposal_id && (
                      <p className="text-fp-muted text-xs mt-1">Use <strong className="text-fp-text">Auto-Build</strong> to generate from floor plan.</p>
                    )}
                  </div>
                </Panel>
              )}
            </ReactFlow>
          </div>

          {/* Properties panel */}
          {(selectedNode || selectedEdge) && (
            <div className="w-56 flex-shrink-0 bg-fp-card border-l border-fp-border flex flex-col overflow-y-auto">
              <div className="p-3 border-b border-fp-border flex items-center justify-between">
                <p className="text-xs font-semibold text-fp-text">
                  {selectedNode ? 'Node Properties' : 'Edge Properties'}
                </p>
                <button
                  onClick={() => { setSelectedNode(null); setSelectedEdge(null) }}
                  className="text-fp-muted hover:text-fp-text"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>

              {selectedNode && (
                <div className="p-3 space-y-3">
                  <div>
                    <label className="text-xs text-fp-muted block mb-1">Label</label>
                    <input
                      value={selectedNode.data.label || ''}
                      onChange={e => updateNodeData('label', e.target.value)}
                      className="w-full bg-fp-inset text-fp-text text-xs border border-fp-border rounded px-2 py-1.5 focus:outline-none focus:border-fp-brand"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-fp-muted block mb-1">Category</label>
                    <select
                      value={selectedNode.data.category || 'Other'}
                      onChange={e => updateNodeData('category', e.target.value)}
                      className="w-full bg-fp-inset text-fp-text text-xs border border-fp-border rounded px-2 py-1.5 focus:outline-none focus:border-fp-brand"
                    >
                      {QUICK_ADD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-fp-muted block mb-1">Quantity</label>
                    <input
                      type="number"
                      min={1}
                      value={selectedNode.data.quantity || 1}
                      onChange={e => updateNodeData('quantity', parseInt(e.target.value) || 1)}
                      className="w-full bg-fp-inset text-fp-text text-xs border border-fp-border rounded px-2 py-1.5 focus:outline-none focus:border-fp-brand"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-fp-muted block mb-1">Notes</label>
                    <textarea
                      value={selectedNode.data.notes || ''}
                      onChange={e => updateNodeData('notes', e.target.value)}
                      rows={2}
                      className="w-full bg-fp-inset text-fp-text text-xs border border-fp-border rounded px-2 py-1.5 focus:outline-none focus:border-fp-brand resize-none"
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
                    <label className="text-xs text-fp-muted block mb-1">Wire Type</label>
                    <select
                      value={selectedEdge.data?.wire_type || 'default'}
                      onChange={e => updateEdgeType(e.target.value)}
                      className="w-full bg-fp-inset text-fp-text text-xs border border-fp-border rounded px-2 py-1.5 focus:outline-none focus:border-fp-brand"
                    >
                      {WIRE_TYPES.map(wt => <option key={wt.value} value={wt.value}>{wt.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-fp-muted block mb-1">Label</label>
                    <input
                      value={selectedEdge.label || ''}
                      onChange={async e => {
                        const label = e.target.value
                        const updated = { ...selectedEdge, label }
                        setSelectedEdge(updated)
                        setEdges(es => es.map(ed => ed.id === selectedEdge.id ? updated : ed))
                        await supabase.from('sld_edges').update({ label }).eq('id', selectedEdge.id)
                      }}
                      className="w-full bg-fp-inset text-fp-text text-xs border border-fp-border rounded px-2 py-1.5 focus:outline-none focus:border-fp-brand"
                    />
                  </div>
                  <div className="pt-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px" style={{ background: WIRE_COLORS[selectedEdge.data?.wire_type || 'default'], opacity: 0.8 }}/>
                      <span className="text-xs text-fp-muted flex-shrink-0">
                        {WIRE_TYPES.find(w => w.value === (selectedEdge.data?.wire_type || 'default'))?.label}
                      </span>
                    </div>
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
    </div>
  )
}
