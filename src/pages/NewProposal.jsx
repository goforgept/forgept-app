import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

const emptyLine = () => ({
  item_name: '', part_number_sku: '', quantity: '', unit: 'ea',
  category: '', vendor: '', your_cost_unit: '', markup_percent: '35',
  customer_price_unit: '', pricing_status: 'Needs Pricing'
})

export default function NewProposal() {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    rep_name: '', rep_email: '', client_name: '', company: '',
    client_email: '', close_date: '', industry: '', job_description: ''
  })
  const [lines, setLines] = useState([emptyLine(), emptyLine(), emptyLine()])

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const updateLine = (index, field, value) => {
    setLines(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      if (field === 'your_cost_unit' || field === 'markup_percent') {
        const cost = parseFloat(updated[index].your_cost_unit) || 0
        const markup = parseFloat(updated[index].markup_percent) || 0
        updated[index].customer_price_unit = (cost * (1 + markup / 100)).toFixed(2)
      }
      return updated
    })
  }

  const addLine = () => setLines(prev => [...prev, emptyLine()])
  const removeLine = (index) => setLines(prev => prev.filter((_, i) => i !== index))

  const handleSubmit = async () => {
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()

    const { data: proposal, error } = await supabase
      .from('proposals')
      .insert({
        proposal_name: form.job_description,
        user_id: user.id,
        rep_name: form.rep_name,
        rep_email: form.rep_email,
        client_name: form.client_name,
        company: form.company,
        client_email: form.client_email,
        close_date: form.close_date,
        industry: form.industry,
        job_description: form.job_description,
        status: 'Draft',
        submission_type: 'inline'
      })
      .select()
      .single()

    if (error) { alert('Error saving proposal'); setSaving(false); return }

    const validLines = lines.filter(l => l.item_name.trim() !== '')
    if (validLines.length > 0) {
      await supabase.from('bom_line_items').insert(
        validLines.map(l => ({
          proposal_id: proposal.id,
          item_name: l.item_name,
          part_number_sku: l.part_number_sku,
          quantity: parseFloat(l.quantity) || 0,
          unit: l.unit,
          category: l.category,
          vendor: l.vendor,
          your_cost_unit: parseFloat(l.your_cost_unit) || null,
          markup_percent: parseFloat(l.markup_percent) || null,
          customer_price_unit: parseFloat(l.customer_price_unit) || null,
          customer_price_total: (parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 0),
          pricing_status: l.your_cost_unit ? 'Confirmed' : 'Needs Pricing'
        }))
      )
    }

    setSaving(false)
    navigate('/')
  }

  const categories = ['Electrical', 'Mechanical', 'Audio/Visual', 'Security', 'Networking', 'Material', 'Labor', 'Other']

  return (
    <div className="min-h-screen bg-[#0F1C2E]">
      <div className="bg-[#1a2d45] border-b border-[#2a3d55] px-6 py-4 flex justify-between items-center">
        <h1 className="text-white text-xl font-bold">ForgePt<span className="text-[#C8622A]">.</span></h1>
        <button onClick={() => navigate('/')} className="text-[#8A9AB0] hover:text-white text-sm transition-colors">
          Cancel
        </button>
      </div>

      <div className="p-6 space-y-6">
        <h2 className="text-white text-2xl font-bold">New Proposal</h2>

        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">Proposal Details</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              ['rep_name', 'Rep Name'],
              ['rep_email', 'Rep Email'],
              ['client_name', 'Client Name'],
              ['company', 'Company'],
              ['client_email', 'Client Email'],
              ['close_date', 'Close Date', 'date'],
            ].map(([field, label, type]) => (
              <div key={field}>
                <label className="text-[#8A9AB0] text-xs mb-1 block">{label}</label>
                <input
                  type={type || 'text'}
                  value={form[field]}
                  onChange={e => updateForm(field, e.target.value)}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                />
              </div>
            ))}
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Industry</label>
              <select
                value={form.industry}
                onChange={e => updateForm('industry', e.target.value)}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
              >
                <option value="">Select industry</option>
                {['Electrical', 'Mechanical', 'Plumbing', 'HVAC', 'Audio/Visual', 'Security', 'General Contractor', 'Other'].map(i => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Job Description</label>
              <input
                type="text"
                value={form.job_description}
                onChange={e => updateForm('job_description', e.target.value)}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
              />
            </div>
          </div>
        </div>

        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">BOM Line Items</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a3d55]">
                  {['Item Name', 'Part #', 'Qty', 'Unit', 'Category', 'Vendor', 'Your Cost', 'Markup %', 'Customer Price', ''].map(h => (
                    <th key={h} className="text-[#8A9AB0] text-left py-2 pr-2 font-normal text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className={`border-b border-[#2a3d55]/30 ${line.your_cost_unit ? 'bg-green-500/5' : ''}`}>
                    {[
                      ['item_name', 'text', 'Item name'],
                      ['part_number_sku', 'text', 'Part #'],
                      ['quantity', 'number', 'Qty'],
                    ].map(([field, type, placeholder]) => (
                      <td key={field} className="pr-2 py-1">
                        <input
                          type={type}
                          placeholder={placeholder}
                          value={line[field]}
                          onChange={e => updateLine(i, field, e.target.value)}
                          className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"
                        />
                      </td>
                    ))}
                    <td className="pr-2 py-1">
                      <select value={line.unit} onChange={e => updateLine(i, 'unit', e.target.value)}
                        className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                        {['ea', 'ft', 'lot', 'hr', 'box', 'roll'].map(u => <option key={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="pr-2 py-1">
                      <select value={line.category} onChange={e => updateLine(i, 'category', e.target.value)}
                        className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                        <option value="">Category</option>
                        {categories.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="pr-2 py-1">
                      <input type="text" placeholder="Vendor" value={line.vendor}
                        onChange={e => updateLine(i, 'vendor', e.target.value)}
                        className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                    </td>
                    <td className="pr-2 py-1">
                      <input type="number" placeholder="0.00" value={line.your_cost_unit}
                        onChange={e => updateLine(i, 'your_cost_unit', e.target.value)}
                        className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                    </td>
                    <td className="pr-2 py-1">
                      <input type="number" placeholder="35" value={line.markup_percent}
                        onChange={e => updateLine(i, 'markup_percent', e.target.value)}
                        className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                    </td>
                    <td className="pr-2 py-1">
                      <input type="number" placeholder="0.00" value={line.customer_price_unit}
                        onChange={e => updateLine(i, 'customer_price_unit', e.target.value)}
                        className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                    </td>
                    <td className="py-1">
                      <button onClick={() => removeLine(i)} className="text-[#8A9AB0] hover:text-red-400 text-xs">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addLine} className="mt-4 text-[#C8622A] hover:text-white text-sm transition-colors">
            + Add Line Item
          </button>
        </div>

        <div className="flex justify-end gap-4">
          <button onClick={() => navigate('/')} className="px-6 py-3 text-[#8A9AB0] hover:text-white text-sm transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-6 py-3 bg-[#C8622A] text-white rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Submit Proposal'}
          </button>
        </div>
      </div>
    </div>
  )
}