import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../../supabase'

// ─── Constants ─────────────────────────────────────────────────────────────────

const ROOM_TYPES = [
  { value: 'mdf',        label: 'MDF',             color: '#C8622A' },
  { value: 'idf',        label: 'IDF',             color: '#3b82f6' },
  { value: 'headend',    label: 'Headend',         color: '#10b981' },
  { value: 'electrical', label: 'Electrical Room', color: '#f59e0b' },
  { value: 'server',     label: 'Server Room',     color: '#a855f7' },
  { value: 'closet',     label: 'Wiring Closet',   color: '#06b6d4' },
  { value: 'av',         label: 'AV Rack Room',    color: '#8b5cf6' },
  { value: 'other',      label: 'Other',           color: '#64748b' },
]

const RACK_TYPES = [
  { value: 'four_post',   label: '4-Post Open Frame', hasU: true  },
  { value: 'two_post',    label: '2-Post Open Frame',  hasU: true  },
  { value: 'enclosed',    label: 'Enclosed Cabinet',   hasU: true  },
  { value: 'open_frame',  label: 'Open Frame Rack',    hasU: true  },
  { value: 'wall_mount',  label: 'Wall Mount',         hasU: false },
  { value: 'shelf',       label: 'Shelf / Surface',    hasU: false },
]

const U_OPTIONS = [4, 6, 8, 9, 12, 14, 16, 18, 20, 22, 24, 27, 30, 36, 40, 42, 45, 48]
const SLOT_H = 28

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getRoomType(value) {
  return ROOM_TYPES.find(r => r.value === value) || ROOM_TYPES[ROOM_TYPES.length - 1]
}
function getRackType(value) {
  return RACK_TYPES.find(r => r.value === value) || RACK_TYPES[0]
}
function rackHasU(rack) {
  return getRackType(rack.rack_type).hasU
}

function getCatStyle(cat) {
  const c = (cat || '').toLowerCase()
  if (c.includes('switch') || c.includes('network') || c.includes('router') || c.includes('patch') || c.includes('fiber') || c.includes('wireless ap'))
    return { bar: '#3b82f6', bg: 'rgba(59,130,246,0.15)', text: '#93c5fd' }
  if (c.includes('nvr') || c.includes('camera') || c.includes('encoder') || c.includes('cabinet') || c.includes('turret'))
    return { bar: '#10b981', bg: 'rgba(16,185,129,0.15)', text: '#6ee7b7' }
  if (c.includes('ups') || c.includes('power') || c.includes('pdu') || c.includes('battery') || c.includes('solar'))
    return { bar: '#f59e0b', bg: 'rgba(245,158,11,0.15)', text: '#fcd34d' }
  if (c.includes('fire') || c.includes('alarm') || c.includes('facp') || c.includes('suppression') || c.includes('annun') || c.includes('smoke') || c.includes('heat') || c.includes('horn') || c.includes('strobe'))
    return { bar: '#ef4444', bg: 'rgba(239,68,68,0.15)', text: '#fca5a5' }
  if (c.includes('speaker') || c.includes('display') || c.includes('projector') || c.includes('amplif') || c.includes('receiver') || c.includes('dsp') || c.includes('control processor') || c.includes('touch panel'))
    return { bar: '#a855f7', bg: 'rgba(168,85,247,0.15)', text: '#d8b4fe' }
  if (c.includes('access') || c.includes('reader') || c.includes('controller') || c.includes('intercom') || c.includes('lock'))
    return { bar: '#06b6d4', bg: 'rgba(6,182,212,0.15)', text: '#67e8f9' }
  return { bar: '#64748b', bg: 'rgba(100,116,139,0.12)', text: '#94a3b8' }
}

function buildSlotMap(items) {
  const map = {}
  for (const item of items) {
    for (let u = item.u_start; u < item.u_start + item.u_size; u++) {
      map[u] = { ...item, isFirst: u === item.u_start }
    }
  }
  return map
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function RackBuilder({ proposalId, orgId, lockedRoomId = null, sheetPlacements = [] }) {
  const [rooms, setRooms]               = useState([])
  const [racks, setRacks]               = useState([])
  const [items, setItems]               = useState([])
  const [selectedRoomId, setSelectedRoomId] = useState(lockedRoomId)
  const [selectedItemId, setSelectedItemId] = useState(null)
  const [picker, setPicker]             = useState(null) // { rackId, uStart, isWallMount }
  const [addRoomOpen, setAddRoomOpen]   = useState(false)
  const [newRoom, setNewRoom]           = useState({ name: '', room_type: 'mdf' })
  const [addRackFor, setAddRackFor]     = useState(null)
  const [newRack, setNewRack]           = useState({ name: 'Rack 1', rack_type: 'four_post', total_u: 42 })
  const [saving, setSaving]             = useState(false)

  // When lockedRoomId changes (e.g. user clicks a different room marker), update selection
  useEffect(() => { if (lockedRoomId) setSelectedRoomId(lockedRoomId) }, [lockedRoomId])

  useEffect(() => { if (proposalId) load() }, [proposalId])

  const load = async () => {
    const { data: roomsData } = await supabase
      .from('rooms').select('*').eq('proposal_id', proposalId).order('sort_order,created_at')

    if (!roomsData?.length) { setRooms([]); setRacks([]); setItems([]); return }
    setRooms(roomsData)
    if (!selectedRoomId) setSelectedRoomId(roomsData[0].id)

    const roomIds = roomsData.map(r => r.id)
    const { data: racksData } = await supabase
      .from('racks').select('*').in('room_id', roomIds).order('sort_order,created_at')
    setRacks(racksData || [])

    if (racksData?.length) {
      const rackIds = racksData.map(r => r.id)
      const { data: itemsData } = await supabase
        .from('rack_items')
        .select('*, global_products(name, part_number, manufacturer, category)')
        .in('rack_id', rackIds)
        .order('u_start')
      setItems(itemsData || [])
    }
  }

  const createRoom = async () => {
    if (!newRoom.name.trim()) return
    setSaving(true)
    const { data } = await supabase.from('rooms').insert([{
      proposal_id: proposalId,
      org_id: orgId,
      name: newRoom.name.trim(),
      room_type: newRoom.room_type,
      sort_order: rooms.length,
    }]).select().single()
    if (data) {
      setRooms(prev => [...prev, data])
      setSelectedRoomId(data.id)
    }
    setNewRoom({ name: '', room_type: 'mdf' })
    setAddRoomOpen(false)
    setSaving(false)
  }

  const deleteRoom = async (id) => {
    if (!window.confirm('Delete this room and all its racks?')) return
    await supabase.from('rooms').delete().eq('id', id)
    setRooms(prev => prev.filter(r => r.id !== id))
    setRacks(prev => prev.filter(r => r.room_id !== id))
    setItems(prev => prev.filter(i => !racks.filter(r => r.room_id === id).find(r => r.id === i.rack_id)))
    if (selectedRoomId === id) setSelectedRoomId(rooms.find(r => r.id !== id)?.id || null)
  }

  const createRack = async (roomId) => {
    setSaving(true)
    const isU = getRackType(newRack.rack_type).hasU
    const { data } = await supabase.from('racks').insert([{
      room_id: roomId,
      name: newRack.name.trim() || 'Rack 1',
      rack_type: newRack.rack_type,
      total_u: isU ? (newRack.total_u || 42) : 0,
      sort_order: racks.filter(r => r.room_id === roomId).length,
    }]).select().single()
    if (data) setRacks(prev => [...prev, data])
    setAddRackFor(null)
    setNewRack({ name: 'Rack 1', rack_type: 'four_post', total_u: 42 })
    setSaving(false)
  }

  const deleteRack = async (id) => {
    if (!window.confirm('Delete this rack and all its items?')) return
    await supabase.from('racks').delete().eq('id', id)
    setRacks(prev => prev.filter(r => r.id !== id))
    setItems(prev => prev.filter(i => i.rack_id !== id))
  }

  const addItem = async (rackId, uStart, product, uSize = 1, customLabel = null) => {
    const gp = product?.source === 'global' ? product : null
    const rack = racks.find(r => r.id === rackId)
    const isWall = !rackHasU(rack)
    const actualUStart = isWall
      ? (items.filter(i => i.rack_id === rackId).length + 1)
      : uStart

    const payload = {
      rack_id: rackId,
      u_start: actualUStart,
      u_size: isWall ? 1 : uSize,
      global_product_id: gp?.id || null,
      label: customLabel || gp?.name || product?.item_name || null,
      manufacturer: gp?.manufacturer || product?.manufacturer || null,
      model: gp?.part_number || product?.part_number || null,
      part_number: gp?.part_number || product?.part_number || null,
      category: gp?.category || product?.category || null,
    }

    const { data } = await supabase.from('rack_items').insert([payload]).select('*, global_products(name, part_number, manufacturer, category)').single()
    if (data) setItems(prev => [...prev, data])
    setPicker(null)
  }

  const deleteItem = async (id) => {
    await supabase.from('rack_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
    if (selectedItemId === id) setSelectedItemId(null)
  }

  const updateItem = async (id, patch) => {
    await supabase.from('rack_items').update(patch).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
  }

  const rackItems = (rackId) => items.filter(i => i.rack_id === rackId)
  const selectedRoom = rooms.find(r => r.id === selectedRoomId)
  const roomRacks = racks.filter(r => r.room_id === selectedRoomId)
  const selectedItem = items.find(i => i.id === selectedItemId) || null

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#080e18' }}>

      {/* ── Left: Room list (hidden in locked/canvas mode) ── */}
      {!lockedRoomId && <div className="w-52 flex-shrink-0 flex flex-col border-r" style={{ borderColor: '#162030' }}>
        <div className="px-3 py-3 border-b flex items-center justify-between" style={{ borderColor: '#162030' }}>
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#4a6080' }}>Rooms</span>
          <button
            onClick={() => setAddRoomOpen(s => !s)}
            className="text-xs font-bold transition-colors"
            style={{ color: addRoomOpen ? '#C8622A' : '#4a6080' }}
          >+ New</button>
        </div>

        {/* Add room form */}
        {addRoomOpen && (
          <div className="px-3 py-3 border-b space-y-2" style={{ borderColor: '#162030', background: '#0d1927' }}>
            <input
              autoFocus
              placeholder="Room name…"
              value={newRoom.name}
              onChange={e => setNewRoom(p => ({ ...p, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && createRoom()}
              className="w-full text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
              style={{ background: '#0a1220', border: '1px solid #1e3048', color: '#fff' }}
            />
            <select
              value={newRoom.room_type}
              onChange={e => setNewRoom(p => ({ ...p, room_type: e.target.value }))}
              className="w-full text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
              style={{ background: '#0a1220', border: '1px solid #1e3048', color: '#8A9AB0' }}
            >
              {ROOM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <button
              onClick={createRoom}
              disabled={saving || !newRoom.name.trim()}
              className="w-full text-xs font-semibold rounded-lg py-1.5 transition-colors disabled:opacity-40"
              style={{ background: '#C8622A', color: '#fff' }}
            >{saving ? 'Adding…' : 'Add Room'}</button>
          </div>
        )}

        {/* Room list */}
        <div className="flex-1 overflow-y-auto py-1">
          {rooms.length === 0 && !addRoomOpen && (
            <div className="px-3 py-6 text-center">
              <p className="text-xs" style={{ color: '#2a4060' }}>No rooms yet</p>
              <button onClick={() => setAddRoomOpen(true)} className="text-xs mt-1 transition-colors" style={{ color: '#C8622A' }}>Add your first room</button>
            </div>
          )}
          {rooms.map(room => {
            const rt = getRoomType(room.room_type)
            const rackCount = racks.filter(r => r.room_id === room.id).length
            const active = room.id === selectedRoomId
            return (
              <div
                key={room.id}
                onClick={() => setSelectedRoomId(room.id)}
                className="flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors group"
                style={{
                  background: active ? 'rgba(200,98,42,0.08)' : 'transparent',
                  borderLeft: active ? `2px solid ${rt.color}` : '2px solid transparent',
                }}
              >
                <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: rt.color + '22', color: rt.color, minWidth: 28, textAlign: 'center', letterSpacing: '0.03em' }}>
                  {rt.label.slice(0, 3).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: active ? '#fff' : '#8A9AB0' }}>{room.name}</p>
                  <p className="text-xs" style={{ color: '#2a4060' }}>{rackCount} rack{rackCount !== 1 ? 's' : ''}</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); deleteRoom(room.id) }}
                  className="opacity-0 group-hover:opacity-100 text-xs transition-opacity hover:text-red-400"
                  style={{ color: '#2a4060' }}
                >✕</button>
              </div>
            )
          })}
        </div>
      </div>}

      {/* ── Right: Rack view + Item detail ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Scrollable rack area */}
        <div className="flex-1 overflow-auto">
          {!selectedRoom ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <p className="text-sm" style={{ color: '#2a4060' }}>Select or create a room to get started</p>
              <button onClick={() => setAddRoomOpen(true)} className="text-xs font-semibold px-4 py-2 rounded-lg transition-colors" style={{ background: '#C8622A', color: '#fff' }}>+ New Room</button>
            </div>
          ) : (
            <div className="p-5">
              {/* Room header */}
              <div className="flex items-center gap-3 mb-5">
                {(() => { const rt = getRoomType(selectedRoom.room_type); return (
                  <span className="text-sm font-bold px-2.5 py-1 rounded-lg" style={{ background: rt.color + '22', color: rt.color }}>{rt.label}</span>
                )})()}
                <h2 className="text-white font-bold text-lg">{selectedRoom.name}</h2>
                <button
                  onClick={() => setAddRackFor(selectedRoom.id)}
                  className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: '#162030', color: '#8A9AB0' }}
                >+ Add Rack / Mount</button>
              </div>

              {/* Add rack form */}
              {addRackFor === selectedRoom.id && (
                <div className="rounded-xl border p-4 mb-5 flex flex-wrap gap-3 items-end" style={{ background: '#0d1927', borderColor: '#C8622A40' }}>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: '#4a6080' }}>Name</label>
                    <input
                      autoFocus
                      value={newRack.name}
                      onChange={e => setNewRack(p => ({ ...p, name: e.target.value }))}
                      className="text-xs rounded-lg px-3 py-1.5 focus:outline-none w-36"
                      style={{ background: '#0a1220', border: '1px solid #1e3048', color: '#fff' }}
                    />
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: '#4a6080' }}>Type</label>
                    <select
                      value={newRack.rack_type}
                      onChange={e => setNewRack(p => ({ ...p, rack_type: e.target.value }))}
                      className="text-xs rounded-lg px-3 py-1.5 focus:outline-none"
                      style={{ background: '#0a1220', border: '1px solid #1e3048', color: '#8A9AB0' }}
                    >
                      {RACK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  {getRackType(newRack.rack_type).hasU && (
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: '#4a6080' }}>Size</label>
                      <select
                        value={newRack.total_u}
                        onChange={e => setNewRack(p => ({ ...p, total_u: +e.target.value }))}
                        className="text-xs rounded-lg px-3 py-1.5 focus:outline-none"
                        style={{ background: '#0a1220', border: '1px solid #1e3048', color: '#8A9AB0' }}
                      >
                        {U_OPTIONS.map(u => <option key={u} value={u}>{u}U</option>)}
                      </select>
                    </div>
                  )}
                  <button
                    onClick={() => createRack(selectedRoom.id)}
                    disabled={saving}
                    className="text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                    style={{ background: '#C8622A', color: '#fff' }}
                  >{saving ? 'Adding…' : 'Add'}</button>
                  <button onClick={() => setAddRackFor(null)} className="text-xs transition-colors" style={{ color: '#4a6080' }}>Cancel</button>
                </div>
              )}

              {/* Racks */}
              {roomRacks.length === 0 ? (
                <div className="rounded-xl border border-dashed p-10 text-center" style={{ borderColor: '#162030' }}>
                  <p className="text-sm mb-2" style={{ color: '#2a4060' }}>No racks in this room yet</p>
                  <button onClick={() => setAddRackFor(selectedRoom.id)} className="text-xs transition-colors" style={{ color: '#C8622A' }}>Add a rack or wall mount</button>
                </div>
              ) : (
                <div className="flex gap-5 flex-wrap items-start">
                  {roomRacks.map(rack =>
                    rackHasU(rack) ? (
                      <RackDiagram
                        key={rack.id}
                        rack={rack}
                        items={rackItems(rack.id)}
                        selectedItemId={selectedItemId}
                        onSlotClick={(rackId, uStart) => setPicker({ rackId, uStart, isWallMount: false })}
                        onItemClick={(id) => setSelectedItemId(id)}
                        onDeleteItem={deleteItem}
                        onDeleteRack={deleteRack}
                      />
                    ) : (
                      <WallMountList
                        key={rack.id}
                        rack={rack}
                        items={rackItems(rack.id)}
                        selectedItemId={selectedItemId}
                        onAddItem={(rackId) => setPicker({ rackId, uStart: null, isWallMount: true })}
                        onItemClick={(id) => setSelectedItemId(id)}
                        onDeleteItem={deleteItem}
                        onDeleteRack={deleteRack}
                      />
                    )
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Item detail panel */}
        {selectedItem && (
          <ItemDetail
            key={selectedItem.id}
            item={selectedItem}
            allRackItems={items.filter(i => i.rack_id === selectedItem.rack_id)}
            rack={racks.find(r => r.id === selectedItem.rack_id)}
            sheetPlacements={sheetPlacements}
            onUpdate={updateItem}
            onDelete={deleteItem}
            onClose={() => setSelectedItemId(null)}
          />
        )}
      </div>

      {/* ── Product picker modal ── */}
      {picker && (
        <ProductPicker
          picker={picker}
          orgId={orgId}
          items={items.filter(i => i.rack_id === picker.rackId)}
          totalU={racks.find(r => r.id === picker.rackId)?.total_u || 0}
          onSelect={addItem}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}

// ─── U-slot Rack Diagram ───────────────────────────────────────────────────────

function RackDiagram({ rack, items, selectedItemId, onSlotClick, onItemClick, onDeleteItem, onDeleteRack }) {
  const slotMap = buildSlotMap(items)
  const rt = getRackType(rack.rack_type)

  return (
    <div style={{ width: 300, flexShrink: 0 }}>
      {/* Rack header */}
      <div className="flex items-center gap-2 mb-2 px-0.5">
        <span className="text-white text-sm font-bold truncate flex-1">{rack.name}</span>
        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#162030', color: '#8A9AB0' }}>{rack.total_u}U</span>
        <span className="text-xs px-1.5 py-0.5 rounded truncate max-w-[90px]" style={{ background: '#162030', color: '#8A9AB0' }}>{rt.label}</span>
        <button onClick={() => onDeleteRack(rack.id)} className="text-xs flex-shrink-0 hover:text-red-400 transition-colors" style={{ color: '#2a4060' }}>✕</button>
      </div>

      {/* Rack body */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e3048', background: '#0a1220' }}>
        {/* Top ear */}
        <div style={{ height: 10, background: '#162030', borderBottom: '1px solid #0a1220' }} />

        {/* Slot area */}
        <div style={{ position: 'relative', height: rack.total_u * SLOT_H }}>
          {Array.from({ length: rack.total_u }, (_, i) => {
            const u = i + 1
            const slot = slotMap[u]
            const isEmpty = !slot

            return (
              <div
                key={u}
                style={{
                  position: 'absolute', top: i * SLOT_H, height: SLOT_H,
                  left: 0, right: 0,
                  display: 'flex', alignItems: 'center',
                  borderBottom: '1px solid #0f1e30',
                  cursor: isEmpty ? 'pointer' : 'default',
                }}
                className={isEmpty ? 'group hover:bg-[#0d1927]/80' : ''}
                onClick={isEmpty ? () => onSlotClick(rack.id, u) : undefined}
              >
                {/* U number */}
                <div style={{ width: 30, textAlign: 'right', paddingRight: 5, fontSize: 9, color: '#1e3048', fontFamily: 'monospace', userSelect: 'none', flexShrink: 0 }}>
                  {u}
                </div>
                {isEmpty && (
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs" style={{ color: '#1e3850' }}>+ add</span>
                )}
              </div>
            )
          })}

          {/* Placed devices */}
          {items.map(item => {
            const s = getCatStyle(item.category || item.global_products?.category)
            const name = item.label || item.global_products?.name || item.model || 'Device'
            const mfr = item.manufacturer || item.global_products?.manufacturer
            const pn = item.part_number || item.global_products?.part_number
            const isSelected = item.id === selectedItemId

            return (
              <div
                key={item.id}
                onClick={(e) => { e.stopPropagation(); onItemClick(item.id) }}
                style={{
                  position: 'absolute',
                  top: (item.u_start - 1) * SLOT_H,
                  left: 30,
                  right: 0,
                  height: item.u_size * SLOT_H - 1,
                  background: isSelected ? (s.bg.replace('0.15', '0.35')) : s.bg,
                  borderLeft: `3px solid ${s.bar}`,
                  outline: isSelected ? `1px solid ${s.bar}` : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 8px',
                  gap: 6,
                  zIndex: 1,
                  cursor: 'pointer',
                }}
                className="group"
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: s.text, fontSize: 11, fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name}
                  </p>
                  {(mfr || pn) && (
                    <p style={{ color: '#4a6080', fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[mfr, pn].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                {item.u_size > 1 && (
                  <span style={{ fontSize: 9, color: s.bar, flexShrink: 0 }}>{item.u_size}U</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteItem(item.id) }}
                  className="opacity-0 group-hover:opacity-100 text-xs transition-all hover:text-red-400 flex-shrink-0"
                  style={{ color: '#2a4060' }}
                >✕</button>
              </div>
            )
          })}
        </div>

        {/* Bottom ear */}
        <div style={{ height: 10, background: '#162030', borderTop: '1px solid #0a1220' }} />
      </div>

      <p className="text-center text-xs mt-1" style={{ color: '#1e3048' }}>
        {items.length} device{items.length !== 1 ? 's' : ''} · {rack.total_u - items.reduce((s, i) => s + i.u_size, 0)}U free
      </p>
    </div>
  )
}

// ─── Wall Mount / Shelf List ───────────────────────────────────────────────────

function WallMountList({ rack, items, selectedItemId, onAddItem, onItemClick, onDeleteItem, onDeleteRack }) {
  const rt = getRackType(rack.rack_type)
  const sorted = [...items].sort((a, b) => a.u_start - b.u_start)

  return (
    <div style={{ width: 280, flexShrink: 0 }}>
      <div className="flex items-center gap-2 mb-2 px-0.5">
        <span className="text-white text-sm font-bold truncate flex-1">{rack.name}</span>
        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#162030', color: '#8A9AB0' }}>{rt.label}</span>
        <button onClick={() => onDeleteRack(rack.id)} className="text-xs flex-shrink-0 hover:text-red-400 transition-colors" style={{ color: '#2a4060' }}>✕</button>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e3048', background: '#0a1220' }}>
        <div style={{ height: 6, background: '#162030' }} />
        <div className="p-3 space-y-1.5">
          {sorted.length === 0 && (
            <p className="text-center text-xs py-3" style={{ color: '#1e3850' }}>No items yet</p>
          )}
          {sorted.map(item => {
            const s = getCatStyle(item.category || item.global_products?.category)
            const name = item.label || item.global_products?.name || item.model || 'Device'
            const mfr = item.manufacturer || item.global_products?.manufacturer
            const isSelected = item.id === selectedItemId
            return (
              <div
                key={item.id}
                onClick={(e) => { e.stopPropagation(); onItemClick(item.id) }}
                style={{
                  borderLeft: `3px solid ${s.bar}`,
                  background: isSelected ? s.bg.replace('0.15', '0.35') : s.bg,
                  outline: isSelected ? `1px solid ${s.bar}` : 'none',
                  cursor: 'pointer',
                }}
                className="flex items-center gap-2 rounded-r px-2.5 py-1.5 group"
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: s.text, fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
                  {mfr && <p style={{ color: '#4a6080', fontSize: 9 }}>{mfr}</p>}
                </div>
                <button onClick={(e) => { e.stopPropagation(); onDeleteItem(item.id) }} className="opacity-0 group-hover:opacity-100 text-xs transition-all hover:text-red-400 flex-shrink-0" style={{ color: '#2a4060' }}>✕</button>
              </div>
            )
          })}
          <button
            onClick={() => onAddItem(rack.id)}
            className="w-full text-xs py-1.5 rounded transition-colors hover:border-opacity-60"
            style={{ border: '1px dashed #162030', color: '#2a4060' }}
          >+ Add Item</button>
        </div>
        <div style={{ height: 6, background: '#162030' }} />
      </div>

      <p className="text-center text-xs mt-1" style={{ color: '#1e3048' }}>
        {sorted.length} item{sorted.length !== 1 ? 's' : ''}
      </p>
    </div>
  )
}

// ─── Item Detail Panel ────────────────────────────────────────────────────────

const RACK_ITEM_CATEGORIES = [
  'Access Reader', 'Access Control Door', 'Controller', 'Wireless Lock', 'Door Contact', 'Motion Sensor', 'PIR Detector',
  'Dome Camera', 'Bullet Camera', 'PTZ Camera', 'Turret Camera', 'Fisheye Camera', 'LPR Camera', 'NVR', 'Video Encoder', 'Cabinet System', 'Cabinet Solar System',
  'FACP', 'Smoke Detector', 'Heat Detector', 'Pull Station', 'Horn Strobe', 'Horn', 'Bell', 'Strobe', 'CO Detector', 'Beam Detector', 'Annunciator', 'Monitor Module', 'Control Module', 'Duct Detector', 'Air Sampling', 'Suppression Panel',
  'Network', 'UPS', 'Power Supply', 'PDU', 'Panel', 'Rack', 'Server', 'Patch Panel', 'Fiber Panel',
  'Display', 'Ceiling Speaker', 'Speaker', 'Subwoofer', 'AV Receiver', 'Projector', 'Media Player', 'Control Processor', 'Touch Panel', 'DSP Amplifier',
  'Other',
]

const POWER_CATEGORIES = ['UPS', 'PDU', 'Power Supply', 'Panel', 'NVR', 'Network', 'Server']

const ic = "w-full text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#C8622A] placeholder-[#4a5a6a]"
const icStyle = { background: '#0a1220', border: '1px solid #1e3048', color: '#fff' }
const lc = "text-xs mb-1 block"
const lcStyle = { color: '#8A9AB0' }

function SectionHead({ children }) {
  return <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#C8622A' }}>{children}</p>
}

function ItemDetail({ item, allRackItems, rack, sheetPlacements, onUpdate, onDelete, onClose }) {
  const getInitialForm = (i) => ({
    label:             i.label             || '',
    description:       i.description       || '',
    category:          i.category          || '',
    manufacturer:      i.manufacturer      || '',
    part_number:       i.part_number       || i.model || '',
    u_size:            i.u_size            ?? 1,
    quantity:          i.quantity          ?? 1,
    watts_draw:        i.watts_draw        || '',
    power_source_id:   i.power_source_id   || '',
    notes:             i.notes             || '',
    serial_number:     i.serial_number     || '',
    ip_address:        i.ip_address        || '',
    mac_address:       i.mac_address       || '',
    switch_name:       i.switch_name       || '',
    switch_port:       i.switch_port       || '',
    patch_panel_label: i.patch_panel_label || '',
  })

  const [form, setForm] = useState(() => getInitialForm(item))
  const [saved, setSaved] = useState(false)
  const [showAsBuilt, setShowAsBuilt] = useState(false)
  const saveTimer = useRef(null)
  const formRef   = useRef(form)
  useEffect(() => { formRef.current = form }, [form])

  useEffect(() => {
    setForm(getInitialForm(item))
    setSaved(false)
  }, [item.id])

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const f = formRef.current
      await onUpdate(item.id, {
        label:             f.label             || null,
        description:       f.description       || null,
        category:          f.category          || null,
        manufacturer:      f.manufacturer      || null,
        part_number:       f.part_number       || null,
        model:             f.part_number       || null,
        quantity:          parseInt(f.quantity) || 1,
        u_size:            parseInt(f.u_size)   || 1,
        watts_draw:        f.watts_draw ? parseFloat(f.watts_draw) : null,
        power_source_id:   f.power_source_id   || null,
        notes:             f.notes             || null,
        serial_number:     f.serial_number     || null,
        ip_address:        f.ip_address        || null,
        mac_address:       f.mac_address       || null,
        switch_name:       f.switch_name       || null,
        switch_port:       f.switch_port       || null,
        patch_panel_label: f.patch_panel_label || null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    }, 600)
  }

  const isUBased = rack && rackHasU(rack)
  const s = getCatStyle(form.category)

  const isPowerSource = POWER_CATEGORIES.some(c => (form.category || '').toLowerCase().includes(c.toLowerCase()))
  const powerCandidates = allRackItems.filter(i =>
    i.id !== item.id &&
    POWER_CATEGORIES.some(c => (i.category || i.label || '').toLowerCase().includes(c.toLowerCase()))
  )
  // devices that list this item as their power source
  const poweredDevices = allRackItems.filter(i => i.id !== item.id && i.power_source_id === item.id)

  const totalDrawnWatts = poweredDevices.reduce((sum, d) => sum + (d.watts_draw || 0), 0)
  const supplyWatts = parseFloat(form.watts_draw) || 0

  return (
    <div
      className="flex-shrink-0 flex flex-col border-l overflow-hidden"
      style={{ width: 292, borderColor: '#162030', background: '#0d1927' }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: '#162030' }}>
        <div className="flex items-center gap-2 min-w-0">
          <div style={{ width: 3, height: 20, background: s.bar, borderRadius: 2, flexShrink: 0 }} />
          <span className="text-white font-bold text-sm truncate">{form.label || form.description || 'Unnamed Device'}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className={`text-xs transition-opacity ${saved ? 'opacity-100' : 'opacity-0'}`} style={{ color: '#22c55e' }}>✓ Saved</span>
          <button onClick={onClose} className="text-xs hover:text-white transition-colors" style={{ color: '#4a6080' }}>✕</button>
        </div>
      </div>

      {/* Scrollable fields */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {/* ── Device Data ── */}
        <div>
          <SectionHead>Device Data</SectionHead>
          <div className="space-y-2">
            <div>
              <label className={lc} style={lcStyle}>Device Address / Label</label>
              <input className={ic} style={icStyle}
                value={form.label} placeholder="e.g. SW-01, NVR-MDF, UPS-1"
                onChange={e => update('label', e.target.value)} />
            </div>
            <div>
              <label className={lc} style={lcStyle}>Part Number</label>
              <input className={ic} style={icStyle}
                value={form.part_number} placeholder="e.g. C9200-24P-E"
                onChange={e => update('part_number', e.target.value)} />
            </div>
            <div>
              <label className={lc} style={lcStyle}>Manufacturer</label>
              <input className={ic} style={icStyle}
                value={form.manufacturer} placeholder="e.g. Cisco, Ubiquiti"
                onChange={e => update('manufacturer', e.target.value)} />
            </div>
            <div>
              <label className={lc} style={lcStyle}>Description</label>
              <input className={ic} style={icStyle}
                value={form.description} placeholder="e.g. 24-port PoE+ Managed Switch"
                onChange={e => update('description', e.target.value)} />
            </div>
            <div>
              <label className={lc} style={lcStyle}>Category</label>
              <select className={ic} style={{ ...icStyle, color: form.category ? '#fff' : '#4a5a6a' }}
                value={form.category} onChange={e => update('category', e.target.value)}>
                <option value="">— Select category —</option>
                {RACK_ITEM_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              {isUBased && (
                <div className="flex-1">
                  <label className={lc} style={lcStyle}>U Size</label>
                  <select className={ic} style={icStyle}
                    value={form.u_size} onChange={e => update('u_size', +e.target.value)}>
                    {[1,2,3,4,6,8,10,12,14,16,20].map(u => <option key={u} value={u}>{u}U</option>)}
                  </select>
                </div>
              )}
              <div className="flex-1">
                <label className={lc} style={lcStyle}>Qty (BOM)</label>
                <input type="number" min={1} className={`${ic} w-20`} style={icStyle}
                  value={form.quantity} onChange={e => update('quantity', Math.max(1, +e.target.value))} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Power ── */}
        <div className="border-t pt-3" style={{ borderColor: '#1e3048' }}>
          {isPowerSource ? (
            <>
              <SectionHead>Power Supply</SectionHead>
              <div className="space-y-2">
                <div>
                  <label className={lc} style={lcStyle}>Supply Capacity (W)</label>
                  <input type="number" step="1" min="0" className={`${ic} w-28`} style={icStyle}
                    value={form.watts_draw} placeholder="e.g. 1500"
                    onChange={e => update('watts_draw', e.target.value)} />
                </div>
                {supplyWatts > 0 && (
                  <>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: '#8A9AB0' }}>Devices draw</span>
                      <span className="font-mono font-semibold" style={{ color: totalDrawnWatts > supplyWatts ? '#ef4444' : totalDrawnWatts / supplyWatts >= 0.8 ? '#f59e0b' : '#22c55e' }}>
                        {totalDrawnWatts.toFixed(1)}W / {supplyWatts}W
                      </span>
                    </div>
                    <div className="w-full rounded-full h-1.5" style={{ background: '#1e3048' }}>
                      <div className="h-1.5 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (totalDrawnWatts / supplyWatts) * 100)}%`, background: totalDrawnWatts > supplyWatts ? '#ef4444' : totalDrawnWatts / supplyWatts >= 0.8 ? '#f59e0b' : '#22c55e' }} />
                    </div>
                    <p className="text-xs text-right" style={{ color: '#4a5a6a' }}>{(supplyWatts - totalDrawnWatts).toFixed(1)}W available</p>
                  </>
                )}
                {poweredDevices.length > 0 && (
                  <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #1e3048' }}>
                    {poweredDevices.map(d => (
                      <div key={d.id} className="flex justify-between px-2.5 py-1.5 text-xs" style={{ borderBottom: '1px solid #1e3048' }}>
                        <span className="truncate" style={{ color: '#8A9AB0' }}>{d.label || d.global_products?.name || 'Device'}</span>
                        <span className="font-mono ml-2 flex-shrink-0" style={{ color: '#f59e0b' }}>{d.watts_draw || 0}W</span>
                      </div>
                    ))}
                  </div>
                )}
                {poweredDevices.length === 0 && (
                  <p className="text-xs" style={{ color: '#2a4060' }}>No devices assigned — open a device and set "Powered By" to this item.</p>
                )}
              </div>
            </>
          ) : (
            <>
              <SectionHead>Power Draw</SectionHead>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: '#8A9AB0' }}>This device draws</span>
                  <span className="font-mono font-semibold" style={{ color: '#f59e0b' }}>
                    {form.watts_draw ? `${form.watts_draw}W` : '—'}
                  </span>
                </div>
                <div>
                  <label className={lc} style={lcStyle}>Watts draw</label>
                  <input type="number" step="0.1" min="0" className={`${ic} w-28`} style={icStyle}
                    value={form.watts_draw} placeholder="e.g. 7.5"
                    onChange={e => update('watts_draw', e.target.value)} />
                </div>
                <div>
                  <label className={lc} style={lcStyle}>Powered By</label>
                  <select className={ic} style={{ ...icStyle, color: form.power_source_id ? '#fff' : '#4a5a6a' }}
                    value={form.power_source_id} onChange={e => update('power_source_id', e.target.value || null)}>
                    <option value="">— Not assigned —</option>
                    {(powerCandidates.length > 0 ? powerCandidates : allRackItems.filter(i => i.id !== item.id)).map(c => (
                      <option key={c.id} value={c.id}>{c.label || c.global_products?.name || c.model || 'Device'}</option>
                    ))}
                  </select>
                  {powerCandidates.length === 0 && (
                    <p className="text-xs mt-1" style={{ color: '#2a4060' }}>Add a UPS/PDU to this rack for power source options.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Notes ── */}
        <div className="border-t pt-3" style={{ borderColor: '#1e3048' }}>
          <label className={lc} style={lcStyle}>Notes</label>
          <textarea className={`${ic} resize-none`} style={icStyle}
            rows={2} value={form.notes} placeholder="e.g. Mount at top of rack, needs short patch cables"
            onChange={e => update('notes', e.target.value)} />
        </div>

        {/* ── Linked canvas placements ── */}
        {sheetPlacements.length > 0 && (item.connected_placement_ids || []).length > 0 && (
          <div className="border-t pt-3" style={{ borderColor: '#1e3048' }}>
            <SectionHead>Linked Floor Plan Devices</SectionHead>
            <div className="space-y-1">
              {(item.connected_placement_ids || []).map(pid => {
                const p = sheetPlacements.find(x => x.id === pid)
                return p ? (
                  <div key={pid} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg" style={{ background: '#0a1220', color: '#8A9AB0' }}>
                    <span className="truncate">{p.global_products?.name || p.description_override || 'Device'}</span>
                    <button
                      onClick={() => {
                        const next = (item.connected_placement_ids || []).filter(x => x !== pid)
                        onUpdate(item.id, { connected_placement_ids: next })
                      }}
                      className="ml-2 hover:text-red-400 flex-shrink-0" style={{ color: '#2a4060' }}
                    >✕</button>
                  </div>
                ) : null
              })}
            </div>
          </div>
        )}

        {/* ── As-Built Data ── */}
        <div className="border-t pt-3" style={{ borderColor: '#1e3048' }}>
          <button onClick={() => setShowAsBuilt(s => !s)} className="flex items-center justify-between w-full text-left mb-2">
            <SectionHead>As-Built Data</SectionHead>
            <svg className={`w-3 h-3 transition-transform flex-shrink-0 -mt-1`} style={{ color: '#8A9AB0', transform: showAsBuilt ? 'rotate(180deg)' : 'rotate(0deg)' }}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          {showAsBuilt && (
            <div className="space-y-2">
              <div>
                <label className={lc} style={lcStyle}>Serial Number</label>
                <input className={ic} style={icStyle} value={form.serial_number} placeholder="Device serial number"
                  onChange={e => update('serial_number', e.target.value)} />
              </div>
              <div>
                <label className={lc} style={lcStyle}>IP Address</label>
                <input className={ic} style={icStyle} value={form.ip_address} placeholder="192.168.1.x"
                  onChange={e => update('ip_address', e.target.value)} />
              </div>
              <div>
                <label className={lc} style={lcStyle}>MAC Address</label>
                <input className={ic} style={icStyle} value={form.mac_address} placeholder="AA:BB:CC:DD:EE:FF"
                  onChange={e => update('mac_address', e.target.value)} />
              </div>
              <div>
                <label className={lc} style={lcStyle}>Switch Name</label>
                <input className={ic} style={icStyle} value={form.switch_name} placeholder="e.g. SW-IDF1"
                  onChange={e => update('switch_name', e.target.value)} />
              </div>
              <div>
                <label className={lc} style={lcStyle}>Switch Port</label>
                <input className={ic} style={icStyle} value={form.switch_port} placeholder="e.g. Gi1/0/12"
                  onChange={e => update('switch_port', e.target.value)} />
              </div>
              <div>
                <label className={lc} style={lcStyle}>Patch Panel Label</label>
                <input className={ic} style={icStyle} value={form.patch_panel_label} placeholder="e.g. PP-A · C01"
                  onChange={e => update('patch_panel_label', e.target.value)} />
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t flex-shrink-0 text-center" style={{ borderColor: '#1e3048' }}>
        <button
          onClick={() => onDelete(item.id)}
          className="w-full text-xs py-1.5 rounded-lg transition-colors hover:bg-red-900/20"
          style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
        >Remove from rack</button>
      </div>
    </div>
  )
}

// ─── Product Picker Modal ─────────────────────────────────────────────────────

function ProductPicker({ picker, orgId, items, totalU, onSelect, onClose }) {
  const [search, setSearch]         = useState('')
  const [results, setResults]       = useState([])
  const [uSize, setUSize]           = useState(1)
  const [customLabel, setCustomLabel] = useState('')
  const [loading, setLoading]       = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Occupied U positions for conflict detection
  const occupiedMap = buildSlotMap(items)
  const fitsAt = (start, size) => {
    for (let u = start; u < start + size; u++) {
      if (occupiedMap[u] || u > totalU) return false
    }
    return true
  }
  const canFit = picker.isWallMount || fitsAt(picker.uStart, uSize)

  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) { setResults([]); return }
    setLoading(true)
    const [{ data: gp }, { data: pl }] = await Promise.all([
      supabase.from('global_products')
        .select('id, name, part_number, manufacturer, category')
        .or(`name.ilike.%${q}%,part_number.ilike.%${q}%,manufacturer.ilike.%${q}%`)
        .eq('is_active', true)
        .limit(12),
      supabase.from('product_library')
        .select('id, item_name, part_number, manufacturer, category')
        .or(`item_name.ilike.%${q}%,part_number.ilike.%${q}%`)
        .eq('org_id', orgId)
        .limit(8),
    ])
    const merged = [
      ...(gp || []).map(p => ({ ...p, source: 'global', name: p.name })),
      ...(pl || []).map(p => ({ ...p, source: 'library', name: p.item_name })),
    ]
    // Dedupe by part_number
    const seen = new Set()
    setResults(merged.filter(p => {
      const key = (p.part_number || p.name || '').toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }))
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    const t = setTimeout(() => doSearch(search), 280)
    return () => clearTimeout(t)
  }, [search, doSearch])

  const handleSelect = (product) => {
    onSelect(picker.rackId, picker.uStart, product, uSize)
  }

  const handleCustom = () => {
    if (!customLabel.trim()) return
    onSelect(picker.rackId, picker.uStart, null, uSize, customLabel.trim())
  }

  const U_PICK = [1, 2, 3, 4, 6, 8, 10]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div
        className="rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        style={{ background: '#0d1927', border: '1px solid #1e3048', width: 440, maxHeight: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b" style={{ borderColor: '#162030' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-white font-bold text-sm">
              {picker.isWallMount ? 'Add Wall Mounted Item' : `Assign U${picker.uStart}`}
            </p>
            <button onClick={onClose} className="text-xs hover:text-white transition-colors" style={{ color: '#4a6080' }}>✕</button>
          </div>
          <input
            ref={inputRef}
            placeholder="Search by name, part number, manufacturer…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full text-sm rounded-xl px-4 py-2.5 focus:outline-none"
            style={{ background: '#0a1220', border: '1px solid #1e3048', color: '#fff' }}
          />
          {!picker.isWallMount && (
            <div className="flex items-center gap-2 mt-2.5">
              <span className="text-xs" style={{ color: '#4a6080' }}>Device height:</span>
              <div className="flex gap-1">
                {U_PICK.filter(u => fitsAt(picker.uStart, u)).map(u => (
                  <button
                    key={u}
                    onClick={() => setUSize(u)}
                    className="text-xs px-2 py-0.5 rounded font-semibold transition-colors"
                    style={{
                      background: uSize === u ? '#C8622A' : '#162030',
                      color: uSize === u ? '#fff' : '#4a6080',
                    }}
                  >{u}U</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading && (
            <p className="text-center text-xs py-4" style={{ color: '#4a6080' }}>Searching…</p>
          )}
          {!loading && search.length >= 2 && results.length === 0 && (
            <p className="text-center text-xs py-4" style={{ color: '#4a6080' }}>No products found</p>
          )}
          {!loading && search.length < 2 && (
            <p className="text-center text-xs py-4" style={{ color: '#2a4060' }}>Type to search your product library</p>
          )}
          {results.map(p => {
            const s = getCatStyle(p.category)
            return (
              <button
                key={p.id + p.source}
                onClick={() => handleSelect(p)}
                className="w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-[#162030]"
              >
                <div style={{ width: 3, height: 32, background: s.bar, borderRadius: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="text-sm font-semibold truncate" style={{ color: '#fff' }}>{p.name}</p>
                  <p className="text-xs truncate" style={{ color: '#4a6080' }}>
                    {[p.manufacturer, p.part_number].filter(Boolean).join(' · ')}
                    {p.category && <span style={{ color: s.bar }}> · {p.category}</span>}
                  </p>
                </div>
                {p.source === 'library' && (
                  <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: '#1e3048', color: '#4a6080' }}>Mine</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Custom entry */}
        <div className="px-5 py-3 border-t" style={{ borderColor: '#162030' }}>
          <p className="text-xs mb-2" style={{ color: '#4a6080' }}>Or add a custom item:</p>
          <div className="flex gap-2">
            <input
              placeholder="Label / description…"
              value={customLabel}
              onChange={e => setCustomLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCustom()}
              className="flex-1 text-xs rounded-lg px-3 py-2 focus:outline-none"
              style={{ background: '#0a1220', border: '1px solid #1e3048', color: '#fff' }}
            />
            <button
              onClick={handleCustom}
              disabled={!customLabel.trim() || (!picker.isWallMount && !canFit)}
              className="text-xs font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-40"
              style={{ background: '#C8622A', color: '#fff' }}
            >Add</button>
          </div>
          {!picker.isWallMount && !canFit && (
            <p className="text-xs mt-1.5" style={{ color: '#ef4444' }}>Not enough free U slots at this position for {uSize}U</p>
          )}
        </div>
      </div>
    </div>
  )
}
