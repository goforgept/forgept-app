import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'

export default function FulfillmentTab({ job, lineItems, orgId, profileId }) {
  const [inventoryItems, setInventoryItems] = useState([])
  const [allocations, setAllocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null) // bomLineItemId being saved
  const [reserveQtys, setReserveQtys] = useState({}) // bomLineItemId → qty string
  const [overrides, setOverrides] = useState({}) // bomLineItemId → inventoryItemId override

  useEffect(() => {
    if (job?.id && orgId) fetchData()
  }, [job?.id, orgId])

  const fetchData = async () => {
    const [{ data: inv }, { data: alloc }] = await Promise.all([
      supabase.from('inventory_items').select('*, warehouses(name)').eq('org_id', orgId).order('description'),
      supabase.from('job_inventory_allocations').select('*, inventory_items(description, part_number, unit_cost, qty_on_hand, qty_reserved, warehouses(name))').eq('job_id', job.id),
    ])
    setInventoryItems(inv || [])
    setAllocations(alloc || [])
    setLoading(false)
  }

  const autoMatch = (bomItem) => {
    const sku = bomItem.part_number_sku?.trim()
    if (sku) {
      const byPart = inventoryItems.find(i => i.part_number && i.part_number.trim().toLowerCase() === sku.toLowerCase())
      if (byPart) return byPart
    }
    // Fallback: description match
    const name = bomItem.item_name?.trim().toLowerCase()
    if (name) {
      return inventoryItems.find(i => i.description?.trim().toLowerCase() === name) || null
    }
    return null
  }

  const getInventoryItem = (bomItem) => {
    const override = overrides[bomItem.id]
    if (override) return inventoryItems.find(i => i.id === override) || null
    return autoMatch(bomItem)
  }

  const getAllocation = (bomItem) => {
    const matches = allocations.filter(a => a.bom_line_item_id === bomItem.id)
    // Prefer an active allocation over a released one
    return matches.find(a => a.status === 'reserved' || a.status === 'fulfilled') || matches[0] || null
  }

  const getAvailable = (invItem) => {
    if (!invItem) return 0
    return Math.max(0, (parseFloat(invItem.qty_on_hand) || 0) - (parseFloat(invItem.qty_reserved) || 0))
  }

  const handleReserve = async (bomItem, invItem) => {
    setSaving(bomItem.id)
    const qty = parseFloat(reserveQtys[bomItem.id]) || parseFloat(bomItem.quantity) || 1
    const cost = parseFloat(invItem.unit_cost) || 0

    // Reuse an existing released allocation rather than creating a duplicate row
    const existingReleased = allocations.find(
      a => a.bom_line_item_id === bomItem.id && a.status === 'released'
    )
    if (existingReleased) {
      await supabase.from('job_inventory_allocations').update({
        inventory_item_id: invItem.id,
        quantity_reserved: qty,
        quantity_fulfilled: 0,
        unit_cost: cost,
        status: 'reserved',
        updated_at: new Date().toISOString(),
      }).eq('id', existingReleased.id)
    } else {
      await supabase.from('job_inventory_allocations').insert({
        org_id: orgId,
        job_id: job.id,
        inventory_item_id: invItem.id,
        bom_line_item_id: bomItem.id,
        bom_item_description: bomItem.item_name,
        bom_part_number: bomItem.part_number_sku || null,
        quantity_reserved: qty,
        quantity_fulfilled: 0,
        unit_cost: cost,
        status: 'reserved',
      })
    }
    // (local alloc variable no longer used below — fetchData() refreshes state)

    // Update inventory reserved qty
    await supabase.from('inventory_items').update({
      qty_reserved: (parseFloat(invItem.qty_reserved) || 0) + qty,
      updated_at: new Date().toISOString(),
    }).eq('id', invItem.id)

    // Write transaction
    await supabase.from('inventory_transactions').insert({
      org_id: orgId,
      inventory_item_id: invItem.id,
      type: 'reservation',
      quantity: -qty,
      unit_cost: cost,
      job_id: job.id,
      notes: `Reserved for job: ${job.proposal_name || job.id}`,
      created_by: profileId,
    })

    setSaving(null)
    fetchData()
  }

  const handleFulfill = async (alloc) => {
    setSaving(alloc.bom_line_item_id)
    const qty = alloc.quantity_reserved

    // Mark allocation fulfilled
    await supabase.from('job_inventory_allocations').update({
      status: 'fulfilled',
      quantity_fulfilled: qty,
      updated_at: new Date().toISOString(),
    }).eq('id', alloc.id)

    // Decrement on_hand, clear reservation
    const inv = alloc.inventory_items
    await supabase.from('inventory_items').update({
      qty_on_hand: Math.max(0, (parseFloat(inv.qty_on_hand) || 0) - qty),
      qty_reserved: Math.max(0, (parseFloat(inv.qty_reserved) || 0) - qty),
      updated_at: new Date().toISOString(),
    }).eq('id', alloc.inventory_item_id)

    // Write transaction
    await supabase.from('inventory_transactions').insert({
      org_id: orgId,
      inventory_item_id: alloc.inventory_item_id,
      type: 'fulfillment',
      quantity: -qty,
      unit_cost: alloc.unit_cost,
      job_id: job.id,
      notes: `Pulled for job: ${job.proposal_name || job.id}`,
      created_by: profileId,
    })

    setSaving(null)
    fetchData()
  }

  const handleRelease = async (alloc) => {
    if (!confirm('Release this reservation? The quantity will be returned to available inventory.')) return
    setSaving(alloc.bom_line_item_id)
    const qty = alloc.quantity_reserved

    await supabase.from('job_inventory_allocations').update({
      status: 'released',
      updated_at: new Date().toISOString(),
    }).eq('id', alloc.id)

    const inv = alloc.inventory_items
    await supabase.from('inventory_items').update({
      qty_reserved: Math.max(0, (parseFloat(inv.qty_reserved) || 0) - qty),
      updated_at: new Date().toISOString(),
    }).eq('id', alloc.inventory_item_id)

    await supabase.from('inventory_transactions').insert({
      org_id: orgId,
      inventory_item_id: alloc.inventory_item_id,
      type: 'release',
      quantity: qty,
      unit_cost: alloc.unit_cost,
      job_id: job.id,
      notes: `Released from job: ${job.proposal_name || job.id}`,
      created_by: profileId,
    })

    setSaving(null)
    fetchData()
  }

  if (loading) return <div className="p-8 text-center text-fp-muted text-sm">Loading fulfillment data...</div>

  if (!lineItems || lineItems.length === 0) {
    return (
      <div className="bg-fp-card rounded-xl p-8 text-center">
        <p className="text-fp-muted text-sm">No BOM line items found for this job. Link a proposal to use inventory fulfillment.</p>
      </div>
    )
  }

  const fulfilledCount = allocations.filter(a => a.status === 'fulfilled').length
  const reservedCount = allocations.filter(a => a.status === 'reserved').length

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="bg-fp-card rounded-xl px-5 py-3 flex gap-6 flex-wrap">
        <div><span className="text-fp-muted text-xs uppercase tracking-wide">BOM Items</span><span className="ml-2 text-fp-text font-bold text-sm">{lineItems.length}</span></div>
        <div><span className="text-yellow-400 text-xs uppercase tracking-wide">Reserved</span><span className="ml-2 text-yellow-400 font-bold text-sm">{reservedCount}</span></div>
        <div><span className="text-green-400 text-xs uppercase tracking-wide">Fulfilled</span><span className="ml-2 text-green-400 font-bold text-sm">{fulfilledCount}</span></div>
        <div><span className="text-fp-muted text-xs uppercase tracking-wide">Pending</span><span className="ml-2 text-fp-muted font-bold text-sm">{lineItems.length - reservedCount - fulfilledCount}</span></div>
      </div>

      {/* BOM line items */}
      <div className="space-y-2">
        {lineItems.map(item => {
          const alloc = getAllocation(item)
          const invItem = alloc ? alloc.inventory_items : getInventoryItem(item)
          const isAutoMatch = !alloc && !overrides[item.id] && !!autoMatch(item)
          const available = getAvailable(invItem)
          const defaultQty = Math.min(parseFloat(item.quantity) || 1, available)
          const reserveQty = reserveQtys[item.id] !== undefined ? reserveQtys[item.id] : String(defaultQty)
          const isSavingThis = saving === item.id || saving === (alloc?.bom_line_item_id)

          return (
            <div key={item.id} className="bg-fp-card rounded-xl p-4">
              <div className="flex items-start gap-4">
                {/* BOM item info */}
                <div className="flex-1 min-w-0">
                  <p className="text-fp-text font-semibold text-sm">{item.item_name}</p>
                  <div className="flex gap-3 mt-0.5 flex-wrap">
                    {item.part_number_sku && <span className="text-fp-muted text-xs font-mono">{item.part_number_sku}</span>}
                    <span className="text-fp-muted text-xs">Qty needed: <span className="text-fp-text font-semibold">{item.quantity}</span></span>
                  </div>
                </div>

                {/* Status / Actions */}
                <div className="flex-shrink-0 text-right space-y-2">

                  {/* FULFILLED */}
                  {alloc?.status === 'fulfilled' && (
                    <div className="flex items-center gap-2 justify-end">
                      <div className="text-right">
                        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-semibold">✓ Fulfilled</span>
                        <p className="text-fp-muted text-xs mt-0.5">{alloc.quantity_fulfilled} × from {alloc.inventory_items?.warehouses?.name || 'inventory'}</p>
                        <p className="text-fp-muted text-xs">Cost: ${(parseFloat(alloc.unit_cost) * alloc.quantity_fulfilled).toFixed(2)}</p>
                      </div>
                    </div>
                  )}

                  {/* RESERVED */}
                  {alloc?.status === 'reserved' && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full font-semibold">Spoken For</span>
                      </div>
                      <p className="text-fp-muted text-xs">{alloc.quantity_reserved} × from {alloc.inventory_items?.warehouses?.name || 'inventory'}</p>
                      <div className="flex gap-1.5 justify-end">
                        <button onClick={() => handleRelease(alloc)} disabled={isSavingThis}
                          className="text-xs text-fp-muted hover:text-red-400 px-2 py-1 border border-fp-border rounded transition-colors disabled:opacity-50">
                          Release
                        </button>
                        <button onClick={() => handleFulfill(alloc)} disabled={isSavingThis}
                          className="text-xs bg-green-600/20 text-green-400 hover:bg-green-600/30 px-2 py-1 border border-green-600/30 rounded font-semibold transition-colors disabled:opacity-50">
                          {isSavingThis ? '...' : 'Mark Fulfilled'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* RELEASED or NO ALLOCATION */}
                  {(!alloc || alloc?.status === 'released') && (
                    <div className="space-y-1.5">
                      {invItem ? (
                        <>
                          <div className="text-right">
                            {isAutoMatch && <span className="text-xs text-fp-muted bg-fp-inset px-1.5 py-0.5 rounded">Auto-matched</span>}
                            <p className="text-fp-text text-xs font-semibold mt-0.5">{invItem.description}</p>
                            <p className="text-fp-muted text-xs">{invItem.warehouses?.name}</p>
                            <p className={`text-xs font-bold ${available <= 0 ? 'text-red-400' : 'text-green-400'}`}>
                              {available} available
                            </p>
                          </div>
                          {available > 0 && (
                            <div className="flex items-center gap-1.5 justify-end">
                              <span className="text-fp-muted text-xs">Qty:</span>
                              <input type="number" min="1" max={available} value={reserveQty}
                                onChange={e => setReserveQtys(p => ({ ...p, [item.id]: e.target.value }))}
                                className="w-16 bg-fp-inset text-fp-text border border-fp-border rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-fp-brand" />
                              <button onClick={() => handleReserve(item, invItem)} disabled={isSavingThis || !reserveQty || parseFloat(reserveQty) <= 0}
                                className="text-xs bg-fp-brand text-white px-2 py-1 rounded font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                                {isSavingThis ? '...' : 'Reserve'}
                              </button>
                            </div>
                          )}
                          {available <= 0 && (
                            <p className="text-red-400/70 text-xs">Out of stock</p>
                          )}
                          <button onClick={() => setOverrides(p => { const n = { ...p }; delete n[item.id]; return n })}
                            className="text-xs text-fp-muted hover:text-fp-text underline">
                            Override match
                          </button>
                        </>
                      ) : (
                        <div className="space-y-1.5">
                          <p className="text-fp-muted text-xs">No inventory match</p>
                          <select className="text-xs bg-fp-inset text-fp-text border border-fp-border rounded px-2 py-1 focus:outline-none focus:border-fp-brand max-w-[180px]"
                            value={overrides[item.id] || ''}
                            onChange={e => setOverrides(p => ({ ...p, [item.id]: e.target.value }))}>
                            <option value="">— Select from inventory —</option>
                            {inventoryItems.map(i => (
                              <option key={i.id} value={i.id}>{i.description}{i.part_number ? ` (${i.part_number})` : ''} — {getAvailable(i)} avail</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
