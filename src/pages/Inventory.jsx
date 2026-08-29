import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import { useProfile } from '../context/ProfileContext'

export default function Inventory({ isAdmin, featureProposals, featureCRM, featurePurchaseOrders, featureInvoices, role, isSalesManager, isPM, isTechnician }) {
  const { profile } = useProfile()
  const [warehouses, setWarehouses] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedWarehouse, setSelectedWarehouse] = useState('all')
  const [search, setSearch] = useState('')
  const [showAddItem, setShowAddItem] = useState(false)
  const [showManageWarehouses, setShowManageWarehouses] = useState(false)
  const [showAdjust, setShowAdjust] = useState(null) // inventory item
  const [showDetail, setShowDetail] = useState(null) // inventory item
  const [showEditItem, setShowEditItem] = useState(null) // inventory item being edited
  const [transactions, setTransactions] = useState([])
  const [saving, setSaving] = useState(false)

  const emptyItem = { part_number: '', description: '', warehouse_id: '', qty_on_hand: '', unit_cost: '', min_stock_level: '' }
  const [itemForm, setItemForm] = useState(emptyItem)
  const [editItemForm, setEditItemForm] = useState(emptyItem)
  const [adjustForm, setAdjustForm] = useState({ type: 'receipt', quantity: '', notes: '' })
  const [warehouseForm, setWarehouseForm] = useState({ name: '', address: '', notes: '' })
  const [editingWarehouse, setEditingWarehouse] = useState(null)

  useEffect(() => { if (profile?.org_id) fetchAll() }, [profile?.org_id])

  const fetchAll = async () => {
    const [{ data: wh }, { data: inv }] = await Promise.all([
      supabase.from('warehouses').select('*').eq('org_id', profile.org_id).order('name'),
      supabase.from('inventory_items').select('*, warehouses(name)').eq('org_id', profile.org_id).order('description'),
    ])
    setWarehouses(wh || [])
    setItems(inv || [])
    setLoading(false)
  }

  const handleAddItem = async () => {
    if (!itemForm.description) return
    setSaving(true)
    const qty = parseFloat(itemForm.qty_on_hand) || 0
    const cost = parseFloat(itemForm.unit_cost) || 0
    const { data: newItem } = await supabase.from('inventory_items').insert({
      org_id: profile.org_id,
      warehouse_id: itemForm.warehouse_id || null,
      part_number: itemForm.part_number || null,
      description: itemForm.description,
      qty_on_hand: qty,
      qty_reserved: 0,
      unit_cost: cost,
      min_stock_level: parseFloat(itemForm.min_stock_level) || 0,
    }).select().single()
    if (newItem && qty > 0) {
      await supabase.from('inventory_transactions').insert({
        org_id: profile.org_id,
        inventory_item_id: newItem.id,
        type: 'receipt',
        quantity: qty,
        unit_cost: cost,
        notes: 'Initial stock entry',
        created_by: profile.id,
      })
    }
    setItemForm(emptyItem)
    setShowAddItem(false)
    setSaving(false)
    fetchAll()
  }

  const handleAdjust = async () => {
    if (!adjustForm.quantity || !showAdjust) return
    setSaving(true)
    const qty = parseFloat(adjustForm.quantity)
    const isAdd = adjustForm.type === 'receipt'
    const delta = isAdd ? qty : -qty
    const newOnHand = Math.max(0, (parseFloat(showAdjust.qty_on_hand) || 0) + delta)
    await supabase.from('inventory_items').update({ qty_on_hand: newOnHand, updated_at: new Date().toISOString() }).eq('id', showAdjust.id)
    await supabase.from('inventory_transactions').insert({
      org_id: profile.org_id,
      inventory_item_id: showAdjust.id,
      type: adjustForm.type,
      quantity: delta,
      unit_cost: showAdjust.unit_cost,
      notes: adjustForm.notes || null,
      created_by: profile.id,
    })
    setAdjustForm({ type: 'receipt', quantity: '', notes: '' })
    setShowAdjust(null)
    setSaving(false)
    fetchAll()
  }

  const handleSaveWarehouse = async () => {
    if (!warehouseForm.name) return
    setSaving(true)
    if (editingWarehouse) {
      await supabase.from('warehouses').update({ name: warehouseForm.name, address: warehouseForm.address, notes: warehouseForm.notes }).eq('id', editingWarehouse.id)
    } else {
      await supabase.from('warehouses').insert({ org_id: profile.org_id, name: warehouseForm.name, address: warehouseForm.address, notes: warehouseForm.notes })
    }
    setWarehouseForm({ name: '', address: '', notes: '' })
    setEditingWarehouse(null)
    setSaving(false)
    fetchAll()
  }

  const handleDeleteWarehouse = async (id) => {
    if (!confirm('Delete this warehouse? Items assigned to it will become unassigned.')) return
    await supabase.from('warehouses').delete().eq('id', id)
    fetchAll()
  }

  const openDetail = async (item) => {
    setShowDetail(item)
    const { data } = await supabase.from('inventory_transactions')
      .select('*, jobs(proposal_name), service_tickets(ticket_number, title)')
      .eq('inventory_item_id', item.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setTransactions(data || [])
  }

  const handleEditItem = async () => {
    if (!editItemForm.description || !showEditItem) return
    setSaving(true)
    await supabase.from('inventory_items').update({
      description: editItemForm.description,
      part_number: editItemForm.part_number || null,
      warehouse_id: editItemForm.warehouse_id || null,
      unit_cost: parseFloat(editItemForm.unit_cost) || 0,
      min_stock_level: parseFloat(editItemForm.min_stock_level) || 0,
    }).eq('id', showEditItem.id)
    setShowEditItem(null)
    setSaving(false)
    fetchAll()
  }

  const handleDeleteItem = async (item) => {
    if (!confirm(`Delete "${item.description}"? This cannot be undone.`)) return
    await supabase.from('inventory_transactions').delete().eq('inventory_item_id', item.id)
    await supabase.from('inventory_items').delete().eq('id', item.id)
    fetchAll()
  }

  const filtered = items.filter(i => {
    const matchWh = selectedWarehouse === 'all' || i.warehouse_id === selectedWarehouse
    const q = search.toLowerCase()
    const matchSearch = !q || i.description.toLowerCase().includes(q) || (i.part_number || '').toLowerCase().includes(q)
    return matchWh && matchSearch
  })

  const lowStockCount = items.filter(i => {
    const avail = (parseFloat(i.qty_on_hand) || 0) - (parseFloat(i.qty_reserved) || 0)
    return i.min_stock_level > 0 && avail <= parseFloat(i.min_stock_level)
  }).length

  const inputClass = "w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"

  return (
    <div className="flex min-h-screen bg-fp-inset">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} role={role} isSalesManager={isSalesManager} isPM={isPM} isTechnician={isTechnician} />

      <div className="flex-1 p-6 space-y-5 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-fp-text text-2xl font-bold">Inventory</h2>
            {lowStockCount > 0 && (
              <p className="text-yellow-400 text-xs mt-1">⚠ {lowStockCount} item{lowStockCount !== 1 ? 's' : ''} at or below minimum stock level</p>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowManageWarehouses(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-fp-card text-fp-muted hover:text-fp-text border border-fp-border transition-colors">
              Warehouses
            </button>
            <button onClick={() => setShowAddItem(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-fp-brand text-white hover:bg-[#b5571f] transition-colors">
              + Add Item
            </button>
          </div>
        </div>

        {/* Warehouse filter */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setSelectedWarehouse('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${selectedWarehouse === 'all' ? 'bg-fp-brand text-white' : 'bg-fp-card text-fp-muted hover:text-fp-text border border-fp-border'}`}>
            All
          </button>
          {warehouses.map(w => (
            <button key={w.id} onClick={() => setSelectedWarehouse(w.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${selectedWarehouse === w.id ? 'bg-fp-brand text-white' : 'bg-fp-card text-fp-muted hover:text-fp-text border border-fp-border'}`}>
              {w.name}
            </button>
          ))}
        </div>

        {/* Search */}
        <input type="text" placeholder="Search by description or part number..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm bg-fp-card text-fp-text border border-fp-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-fp-brand" />

        {/* Table */}
        <div className="bg-fp-card rounded-xl overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-fp-muted text-sm">Loading inventory...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-fp-muted text-sm">No items found. Add your first inventory item.</div>
          ) : (
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-fp-border">
                  {['Part #', 'Description', 'Warehouse', 'On Hand', 'Reserved', 'Available', 'Unit Cost', ''].map(h => (
                    <th key={h} className="text-left text-fp-muted text-xs uppercase tracking-wide px-4 py-3 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const onHand = parseFloat(item.qty_on_hand) || 0
                  const reserved = parseFloat(item.qty_reserved) || 0
                  const available = onHand - reserved
                  const isLow = item.min_stock_level > 0 && available <= parseFloat(item.min_stock_level)
                  return (
                    <tr key={item.id} className="border-b border-fp-border/50 hover:bg-fp-inset/50 transition-colors">
                      <td className="px-4 py-3 text-fp-muted font-mono text-xs">{item.part_number || '—'}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => openDetail(item)} className="text-fp-text font-semibold hover:text-fp-brand transition-colors text-left">
                          {item.description}
                        </button>
                        {isLow && <span className="ml-2 text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">Low Stock</span>}
                      </td>
                      <td className="px-4 py-3 text-fp-muted text-xs">{item.warehouses?.name || '—'}</td>
                      <td className="px-4 py-3 text-fp-text font-semibold tabular-nums">{onHand}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {reserved > 0 ? <span className="text-yellow-400 font-semibold">{reserved}</span> : <span className="text-fp-muted">0</span>}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        <span className={`font-bold ${available <= 0 ? 'text-red-400' : isLow ? 'text-yellow-400' : 'text-green-400'}`}>{available}</span>
                      </td>
                      <td className="px-4 py-3 text-fp-muted tabular-nums">${(parseFloat(item.unit_cost) || 0).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => setShowAdjust(item)}
                            className="text-xs text-fp-muted hover:text-fp-brand transition-colors px-2 py-1 border border-fp-border rounded-lg">
                            Adjust
                          </button>
                          <button onClick={() => { setShowEditItem(item); setEditItemForm({ part_number: item.part_number || '', description: item.description, warehouse_id: item.warehouse_id || '', unit_cost: item.unit_cost || '', min_stock_level: item.min_stock_level || '' }) }}
                            className="text-xs text-fp-muted hover:text-fp-text transition-colors px-2 py-1 border border-fp-border rounded-lg">
                            Edit
                          </button>
                          <button onClick={() => handleDeleteItem(item)}
                            className="text-xs text-fp-muted hover:text-red-400 transition-colors px-2 py-1 border border-fp-border rounded-lg">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add Item Modal */}
      {showAddItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-fp-card rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-fp-text font-bold text-lg mb-5">Add Inventory Item</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-fp-muted text-xs mb-1 block">Description <span className="text-fp-brand">*</span></label>
                  <input type="text" value={itemForm.description} onChange={e => setItemForm(p => ({ ...p, description: e.target.value }))} className={inputClass} placeholder="e.g. Cat6 Cable 1000ft" />
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Part Number</label>
                  <input type="text" value={itemForm.part_number} onChange={e => setItemForm(p => ({ ...p, part_number: e.target.value }))} className={inputClass} placeholder="e.g. C6-1000-BLU" />
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Warehouse</label>
                  <select value={itemForm.warehouse_id} onChange={e => setItemForm(p => ({ ...p, warehouse_id: e.target.value }))} className={inputClass}>
                    <option value="">— None —</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Qty on Hand</label>
                  <input type="number" min="0" step="1" value={itemForm.qty_on_hand} onChange={e => setItemForm(p => ({ ...p, qty_on_hand: e.target.value }))} className={inputClass} placeholder="0" />
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Unit Cost ($)</label>
                  <input type="number" min="0" step="0.01" value={itemForm.unit_cost} onChange={e => setItemForm(p => ({ ...p, unit_cost: e.target.value }))} className={inputClass} placeholder="0.00" />
                </div>
                <div className="col-span-2">
                  <label className="text-fp-muted text-xs mb-1 block">Min Stock Level (for low-stock alert)</label>
                  <input type="number" min="0" step="1" value={itemForm.min_stock_level} onChange={e => setItemForm(p => ({ ...p, min_stock_level: e.target.value }))} className={inputClass} placeholder="0" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowAddItem(false); setItemForm(emptyItem) }} className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
                <button onClick={handleAddItem} disabled={saving || !itemForm.description}
                  className="flex-1 bg-fp-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : 'Add Item'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Qty Modal */}
      {showAdjust && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-fp-card rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-fp-text font-bold text-lg mb-1">Adjust Quantity</h3>
            <p className="text-fp-muted text-sm mb-5">{showAdjust.description}</p>
            <div className="space-y-4">
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Type</label>
                <div className="flex gap-2">
                  {[{ key: 'receipt', label: '+ Receive Stock' }, { key: 'adjustment', label: '− Write Off' }].map(t => (
                    <button key={t.key} onClick={() => setAdjustForm(p => ({ ...p, type: t.key }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${adjustForm.type === t.key ? 'bg-fp-brand text-white' : 'bg-fp-inset text-fp-muted hover:text-fp-text border border-fp-border'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Quantity</label>
                <input type="number" min="0" step="1" value={adjustForm.quantity} onChange={e => setAdjustForm(p => ({ ...p, quantity: e.target.value }))} className={inputClass} placeholder="0" />
              </div>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Notes (optional)</label>
                <input type="text" value={adjustForm.notes} onChange={e => setAdjustForm(p => ({ ...p, notes: e.target.value }))} className={inputClass} placeholder="Reason for adjustment" />
              </div>
              <div className="bg-fp-inset rounded-lg p-3 text-sm">
                <div className="flex justify-between text-fp-muted"><span>Current on hand</span><span className="text-fp-text font-semibold">{parseFloat(showAdjust.qty_on_hand) || 0}</span></div>
                <div className="flex justify-between text-fp-muted mt-1"><span>After adjustment</span>
                  <span className="text-fp-text font-bold">
                    {adjustForm.type === 'receipt'
                      ? (parseFloat(showAdjust.qty_on_hand) || 0) + (parseFloat(adjustForm.quantity) || 0)
                      : Math.max(0, (parseFloat(showAdjust.qty_on_hand) || 0) - (parseFloat(adjustForm.quantity) || 0))}
                  </span>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setShowAdjust(null); setAdjustForm({ type: 'receipt', quantity: '', notes: '' }) }} className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
                <button onClick={handleAdjust} disabled={saving || !adjustForm.quantity}
                  className="flex-1 bg-fp-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Item Detail / Transaction History Modal */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-fp-card rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-fp-text font-bold text-lg">{showDetail.description}</h3>
                {showDetail.part_number && <p className="text-fp-muted text-xs font-mono mt-0.5">{showDetail.part_number}</p>}
              </div>
              <button onClick={() => setShowDetail(null)} className="text-fp-muted hover:text-fp-text text-xl leading-none">×</button>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'On Hand', value: parseFloat(showDetail.qty_on_hand) || 0 },
                { label: 'Reserved', value: parseFloat(showDetail.qty_reserved) || 0 },
                { label: 'Available', value: (parseFloat(showDetail.qty_on_hand) || 0) - (parseFloat(showDetail.qty_reserved) || 0) },
              ].map(s => (
                <div key={s.label} className="bg-fp-inset rounded-lg p-3 text-center">
                  <p className="text-fp-muted text-xs mb-1">{s.label}</p>
                  <p className="text-fp-text font-bold text-xl tabular-nums">{s.value}</p>
                </div>
              ))}
            </div>
            <h4 className="text-fp-text font-semibold text-sm mb-3">Transaction History</h4>
            {transactions.length === 0 ? (
              <p className="text-fp-muted text-sm">No transactions yet.</p>
            ) : (
              <div className="space-y-2">
                {transactions.map(t => {
                  const typeLabel = { receipt: 'Receipt', reservation: 'Reserved', fulfillment: 'Fulfilled', release: 'Released', adjustment: 'Adjustment', service_ticket: 'Service Ticket Pull' }[t.type] || t.type
                  const isPositive = parseFloat(t.quantity) > 0
                  return (
                    <div key={t.id} className="flex items-start justify-between bg-fp-inset rounded-lg px-3 py-2">
                      <div>
                        <p className="text-fp-text text-xs font-semibold">{typeLabel}</p>
                        {t.jobs?.proposal_name && <p className="text-fp-muted text-xs">Job: {t.jobs.proposal_name}</p>}
                        {t.service_tickets && <p className="text-fp-muted text-xs">Ticket: {t.service_tickets.ticket_number ? `${t.service_tickets.ticket_number} — ` : ''}{t.service_tickets.title}</p>}
                        {t.notes && t.type !== 'service_ticket' && <p className="text-fp-muted text-xs italic">{t.notes}</p>}
                        <p className="text-fp-muted text-xs">{new Date(t.created_at).toLocaleDateString()}</p>
                      </div>
                      <span className={`text-sm font-bold tabular-nums ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        {isPositive ? '+' : ''}{parseFloat(t.quantity)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {showEditItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-fp-card rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-fp-text font-bold text-lg mb-5">Edit Item</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-fp-muted text-xs mb-1 block">Description <span className="text-fp-brand">*</span></label>
                  <input type="text" value={editItemForm.description} onChange={e => setEditItemForm(p => ({ ...p, description: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Part Number</label>
                  <input type="text" value={editItemForm.part_number} onChange={e => setEditItemForm(p => ({ ...p, part_number: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Warehouse</label>
                  <select value={editItemForm.warehouse_id} onChange={e => setEditItemForm(p => ({ ...p, warehouse_id: e.target.value }))} className={inputClass}>
                    <option value="">— None —</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Unit Cost ($)</label>
                  <input type="number" min="0" step="0.01" value={editItemForm.unit_cost} onChange={e => setEditItemForm(p => ({ ...p, unit_cost: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Min Stock Level</label>
                  <input type="number" min="0" step="1" value={editItemForm.min_stock_level} onChange={e => setEditItemForm(p => ({ ...p, min_stock_level: e.target.value }))} className={inputClass} />
                </div>
              </div>
              <p className="text-fp-muted text-xs">To change quantity, use the Adjust button on the main list.</p>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowEditItem(null)} className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
                <button onClick={handleEditItem} disabled={saving || !editItemForm.description}
                  className="flex-1 bg-fp-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manage Warehouses Modal */}
      {showManageWarehouses && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-fp-card rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-fp-text font-bold text-lg">Manage Warehouses</h3>
              <button onClick={() => { setShowManageWarehouses(false); setEditingWarehouse(null); setWarehouseForm({ name: '', address: '', notes: '' }) }} className="text-fp-muted hover:text-fp-text text-xl leading-none">×</button>
            </div>

            {/* Add / Edit form */}
            <div className="bg-fp-inset rounded-xl p-4 mb-5 space-y-3">
              <h4 className="text-fp-text text-sm font-semibold">{editingWarehouse ? 'Edit Warehouse' : 'New Warehouse'}</h4>
              <input type="text" placeholder="Name (e.g. Main Warehouse)" value={warehouseForm.name} onChange={e => setWarehouseForm(p => ({ ...p, name: e.target.value }))} className={inputClass} />
              <input type="text" placeholder="Address (optional)" value={warehouseForm.address} onChange={e => setWarehouseForm(p => ({ ...p, address: e.target.value }))} className={inputClass} />
              <input type="text" placeholder="Notes (optional)" value={warehouseForm.notes} onChange={e => setWarehouseForm(p => ({ ...p, notes: e.target.value }))} className={inputClass} />
              <div className="flex gap-2">
                {editingWarehouse && (
                  <button onClick={() => { setEditingWarehouse(null); setWarehouseForm({ name: '', address: '', notes: '' }) }} className="px-4 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
                )}
                <button onClick={handleSaveWarehouse} disabled={saving || !warehouseForm.name}
                  className="px-4 py-2 bg-fp-brand text-white rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : editingWarehouse ? 'Save Changes' : 'Add Warehouse'}
                </button>
              </div>
            </div>

            {/* Existing warehouses */}
            <div className="space-y-2">
              {warehouses.length === 0 && <p className="text-fp-muted text-sm">No warehouses yet.</p>}
              {warehouses.map(w => (
                <div key={w.id} className="flex items-center justify-between bg-fp-inset rounded-lg px-4 py-3">
                  <div>
                    <p className="text-fp-text font-semibold text-sm">{w.name}</p>
                    {w.address && <p className="text-fp-muted text-xs">{w.address}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingWarehouse(w); setWarehouseForm({ name: w.name, address: w.address || '', notes: w.notes || '' }) }}
                      className="text-xs text-fp-muted hover:text-fp-text px-2 py-1 border border-fp-border rounded transition-colors">Edit</button>
                    <button onClick={() => handleDeleteWarehouse(w.id)}
                      className="text-xs text-red-400/70 hover:text-red-400 px-2 py-1 border border-red-400/20 rounded transition-colors">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
