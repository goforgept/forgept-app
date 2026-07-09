import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function CatalogSearch({ orgId, onAdd, onClose }) {
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('org_id', orgId)
      .eq('active', true)
      .order('name', { ascending: true })
    setProducts(data || [])
    setLoading(false)
  }

  const filtered = products.filter(p => {
    const q = search.toLowerCase()
    return !q ||
      p.name.toLowerCase().includes(q) ||
      (p.part_number || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q)
  })

  const handleAdd = (product) => {
    const markup = product.default_markup_percent || 35
    const cost = product.your_cost || 0
    const customerPrice = cost > 0 ? (cost * (1 + markup / 100)).toFixed(2) : ''
    onAdd({
      item_name: product.name,
      part_number_sku: product.part_number || '',
      quantity: '1',
      unit: product.unit || 'ea',
      category: product.category || '',
      vendor: '',
      your_cost_unit: cost ? String(cost) : '',
      markup_percent: String(markup),
      customer_price_unit: customerPrice,
      pricing_status: cost > 0 ? 'Confirmed' : 'Needs Pricing'
    })
  }

  const fmt = (num) => num != null ? `$${Number(num).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-fp-card rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center px-6 py-4 border-b border-fp-border">
          <h3 className="text-fp-text font-bold text-lg">Add from Catalog</h3>
          <button onClick={onClose} className="text-fp-muted hover:text-fp-text transition-colors">✕</button>
        </div>

        <div className="px-6 py-3 border-b border-fp-border">
          <input
            type="text"
            placeholder="Search by name, part number, category..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-fp-brand placeholder-[#8A9AB0]"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <p className="text-fp-muted text-sm py-4">Loading catalog...</p>
          ) : filtered.length === 0 ? (
            <p className="text-fp-muted text-sm py-4">No products found.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(product => (
                <div key={product.id}
                  className="flex justify-between items-center bg-fp-inset rounded-lg px-4 py-3 hover:bg-fp-inset transition-colors group">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <p className="text-fp-text text-sm font-medium">{product.name}</p>
                      {product.part_number && (
                        <span className="text-fp-muted text-xs bg-fp-inset px-2 py-0.5 rounded">{product.part_number}</span>
                      )}
                      {product.category && (
                        <span className="text-[#C8622A] text-xs">{product.category}</span>
                      )}
                    </div>
                    {product.description && (
                      <p className="text-fp-muted text-xs mt-0.5 truncate">{product.description}</p>
                    )}
                    <div className="flex gap-4 mt-1">
                      {product.msrp && <span className="text-fp-muted text-xs">MSRP {fmt(product.msrp)}</span>}
                      {product.dealer_price && <span className="text-fp-muted text-xs">Dealer {fmt(product.dealer_price)}</span>}
                      {product.your_cost && <span className="text-[#C8622A] text-xs font-semibold">Cost {fmt(product.your_cost)}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleAdd(product)}
                    className="ml-4 bg-fp-brand text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#b5571f] transition-colors shrink-0"
                  >
                    + Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-fp-border">
          <p className="text-fp-muted text-xs">{filtered.length} products · Click + Add to insert into BOM</p>
        </div>
      </div>
    </div>
  )
}
