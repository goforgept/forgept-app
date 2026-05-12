import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'

export default function DrawingBOMPreview({ proposalId, orgId, sheets }) {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const loadPreview = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('drawing_placements')
        .select('id, quantity, drawing_sheet_id, global_products(id, name, part_number, model_number, manufacturer, category), products(id, cost_price, sell_price)')
        .in('drawing_sheet_id', sheets.map(s => s.id))
      if (error) throw error

      const grouped = {}
      ;(data || []).forEach(p => {
        const gp  = p.global_products
        const key = gp.part_number
        if (!grouped[key]) {
          grouped[key] = {
            part_number:  gp.part_number,
            model_number: gp.model_number,
            name:         gp.name,
            manufacturer: gp.manufacturer,
            category:     gp.category,
            unit_price:   p.products?.sell_price || null,
            has_pricing:  !!p.products?.sell_price,
            total_qty:    0,
            by_floor:     {},
          }
        }
        grouped[key].total_qty += p.quantity
        grouped[key].by_floor[p.drawing_sheet_id] = (grouped[key].by_floor[p.drawing_sheet_id] || 0) + p.quantity
      })

      const sorted = Object.values(grouped).sort((a, b) => {
        if (a.manufacturer !== b.manufacturer) return a.manufacturer.localeCompare(b.manufacturer)
        if (a.category !== b.category) return a.category.localeCompare(b.category)
        return a.name.localeCompare(b.name)
      })
      setRows(sorted)
    } catch (err) {
      setError('Failed to load BOM preview.')
      console.error(err)
    } finally { setLoading(false) }
  }, [sheets, supabase])

  useEffect(() => {
    if (sheets.length > 0) loadPreview()
    else { setRows([]); setLoading(false) }
  }, [sheets, loadPreview])

  const totalItems    = rows.reduce((s, r) => s + r.total_qty, 0)
  const totalPrice    = rows.reduce((s, r) => r.unit_price ? s + r.unit_price * r.total_qty : s, 0)
  const missingPrices = rows.filter(r => !r.has_pricing).length

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-sm text-[#8A9AB0]">
      <svg className="w-5 h-5 animate-spin mr-2 text-[#C8622A]" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
      Loading BOM preview...
    </div>
  )

  if (error) return <div className="flex items-center justify-center py-16 text-sm text-red-400">{error}</div>

  if (rows.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
      <p className="text-sm font-medium text-white">No devices placed yet</p>
      <p className="text-xs text-[#8A9AB0]">Switch to the Drawing tab and start placing devices on your floor plans</p>
    </div>
  )

  return (
    <div className="flex flex-col">
      {/* Summary bar */}
      <div className="flex items-center gap-6 px-4 py-3 border-b border-[#2a3d55] bg-[#1a2d45] text-xs">
        <div><span className="text-[#8A9AB0]">Total devices</span><span className="ml-2 font-semibold text-white">{totalItems}</span></div>
        <div><span className="text-[#8A9AB0]">Unique SKUs</span><span className="ml-2 font-semibold text-white">{rows.length}</span></div>
        <div>
          <span className="text-[#8A9AB0]">Est. material total</span>
          <span className="ml-2 font-semibold text-[#C8622A]">
            {totalPrice > 0 ? `$${totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
          </span>
        </div>
        {missingPrices > 0 && (
          <div className="flex items-center gap-1 text-yellow-400">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
            {missingPrices} SKU{missingPrices !== 1 ? 's' : ''} missing pricing
          </div>
        )}
      </div>

      {/* Multi-floor note */}
      {sheets.length > 1 && (
        <div className="px-4 py-2 bg-[#C8622A]/10 border-b border-[#C8622A]/20 text-xs text-[#C8622A]">
          Aggregated across {sheets.length} floor plans:
          {sheets.map(s => <span key={s.id} className="ml-2 px-1.5 py-0.5 bg-[#C8622A]/20 rounded font-medium">{s.name}</span>)}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#2a3d55] bg-[#1a2d45]">
              <th className="text-left px-4 py-2 font-medium text-[#8A9AB0] w-8">#</th>
              <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">Part number</th>
              <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">Name</th>
              <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">Manufacturer</th>
              <th className="text-left px-4 py-2 font-medium text-[#8A9AB0]">Category</th>
              {sheets.length > 1 && sheets.map(s => (
                <th key={s.id} className="text-center px-3 py-2 font-medium text-[#8A9AB0] whitespace-nowrap">{s.name}</th>
              ))}
              <th className="text-center px-4 py-2 font-medium text-[#8A9AB0]">Qty</th>
              <th className="text-right px-4 py-2 font-medium text-[#8A9AB0]">Unit price</th>
              <th className="text-right px-4 py-2 font-medium text-[#8A9AB0]">Line total</th>
              <th className="text-center px-4 py-2 font-medium text-[#8A9AB0]">Catalog</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a3d55]/50">
            {rows.map((row, idx) => {
              const lineTotal = row.unit_price ? row.unit_price * row.total_qty : null
              return (
                <tr key={row.part_number} className={`hover:bg-[#1a2d45]/50 transition-colors ${!row.has_pricing ? 'bg-yellow-900/10' : ''}`}>
                  <td className="px-4 py-2.5 text-[#8A9AB0]">{idx + 1}</td>
                  <td className="px-4 py-2.5 font-mono text-[#C8622A] whitespace-nowrap">{row.part_number}</td>
                  <td className="px-4 py-2.5 text-white font-medium max-w-xs">
                    <div className="truncate">{row.name}</div>
                    {row.model_number && row.model_number !== row.part_number && (
                      <div className="text-[#8A9AB0] font-normal">{row.model_number}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[#8A9AB0] whitespace-nowrap">{row.manufacturer}</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded-full bg-[#2a3d55] text-[#8A9AB0] whitespace-nowrap">{row.category}</span>
                  </td>
                  {sheets.length > 1 && sheets.map(s => (
                    <td key={s.id} className="text-center px-3 py-2.5 text-[#8A9AB0]">{row.by_floor[s.id] || '—'}</td>
                  ))}
                  <td className="text-center px-4 py-2.5 font-semibold text-white">{row.total_qty}</td>
                  <td className="text-right px-4 py-2.5 text-[#8A9AB0] whitespace-nowrap">
                    {row.unit_price
                      ? `$${row.unit_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                      : <span className="text-yellow-500">No price</span>}
                  </td>
                  <td className="text-right px-4 py-2.5 font-medium text-white whitespace-nowrap">
                    {lineTotal !== null ? `$${lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                  </td>
                  <td className="text-center px-4 py-2.5">
                    {row.has_pricing
                      ? <svg className="w-4 h-4 text-green-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                      : <svg className="w-4 h-4 text-yellow-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#2a3d55] bg-[#1a2d45] font-semibold">
              <td colSpan={sheets.length > 1 ? 5 + sheets.length : 5} className="px-4 py-2.5 text-[#8A9AB0] text-right">Total</td>
              <td className="text-center px-4 py-2.5 text-white">{totalItems}</td>
              <td className="px-4 py-2.5"/>
              <td className="text-right px-4 py-2.5 text-[#C8622A]">
                {totalPrice > 0 ? `$${totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
              </td>
              <td/>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Missing pricing note */}
      {missingPrices > 0 && (
        <div className="px-4 py-3 border-t border-yellow-800/30 bg-yellow-900/10 text-xs text-yellow-400">
          <span className="font-medium">{missingPrices} SKU{missingPrices !== 1 ? 's are' : ' is'} not in your product catalog.</span>
          {' '}These will be added to the BOM as unpriced line items on approval. You can add pricing directly in the BOM after.
        </div>
      )}
    </div>
  )
}