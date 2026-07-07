import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabase'
import { useProfile } from '../../context/ProfileContext'
import AccessoriesEditor from '../AccessoriesEditor'
import * as XLSX from 'xlsx'

const INDUSTRIES = ['Security', 'AV', 'IT / Networking', 'Low Voltage', 'Fire Alarm', 'HVAC', 'Electrical', 'Telecom', 'Other']

const ALL_CATEGORIES = [
  'Access Control Door',
  'Access Reader','Alarm Keypad','Alarm Panel','Amplifier','AV Receiver',
  'Bullet Camera','Cable Tray','Ceiling Speaker','Clock','Control Processor',
  'Controller','Data Drop','Diffuser','Digital Signage','Disconnect',
  'Document Camera','Dome Camera','Door Contact','Door Operator','DSP',
  'Dual Tech Detector','Exterior Siren','FACP','Fiber Panel','Fisheye Camera',
  'Glass Break','Guard Tour','HDMI Extender','Heat Detector','Horn Strobe',
  'Interior Siren','Intercom','Junction Box','LPR Camera','Lighting',
  'Media Player','Microphone','Motion Sensor','Multi-Lens Camera',
  'Network','NVR','Outlet','Panel','Panic Button','Patch Panel',
  'PIR Detector','Point to Point','Power Box','Projection Screen',
  'Projector','PTZ Camera','Pull Station','Rack','Sensor',
  'Shock Sensor','Smoke Detector','Speaker','Streaming Encoder',
  'Subwoofer','Switcher','Thermostat','Touch Panel','UPS',
  'Video Conference','Wall Plate','Wireless Lock','Wireless Mic',
]

const CATEGORY_MAP = {
  'Security':        ['Access Reader','Accessory','Alarm Keypad','Alarm Panel','Bullet Camera','Controller','Door Contact','Door Operator','Dome Camera','Dual Tech Detector','Exterior Siren','Glass Break','Interior Siren','Motion Sensor','Network','NVR','Panel','Panic Button','PIR Detector','PTZ Camera','Shock Sensor'],
  'AV':              ['Accessory','AV Receiver','Ceiling Speaker','Clock','Control Processor','Digital Signage','Display','Document Camera','HDMI Extender','Media Player','Microphone','Network','Projection Screen','Projector','Speaker','Streaming Encoder','Subwoofer','Touch Panel','Video Conference','Wall Plate','Wireless Mic'],
  'IT / Networking': ['Accessory','Controller','Display','Network','Outlet','Panel','Wall Plate'],
  'Low Voltage':     ['Access Reader','Accessory','Controller','Display','Door Contact','Door Operator','Network','Outlet','Panel','Speaker','Wall Plate'],
  'Fire Alarm':      ['Accessory','Alarm Keypad','Alarm Panel','Door Contact','Exterior Siren','Interior Siren','Motion Sensor','Panel','PIR Detector','Shock Sensor'],
  'HVAC':            ['Accessory','Controller','Diffuser','Network','Panel','Thermostat'],
  'Electrical':      ['Accessory','Controller','Lighting','Outlet','Panel'],
  'Telecom':         ['Accessory','Controller','Network','Outlet','Panel','Wall Plate'],
  'Other':           ['Access Reader','Accessory','Alarm Keypad','Alarm Panel','AV Receiver','Bullet Camera','Ceiling Speaker','Clock','Control Processor','Controller','Diffuser','Digital Signage','Display','Document Camera','Dome Camera','Door Contact','Door Operator','Dual Tech Detector','Exterior Siren','Glass Break','HDMI Extender','Interior Siren','Lighting','Media Player','Microphone','Motion Sensor','Network','NVR','Outlet','Panel','Panic Button','PIR Detector','PTZ Camera','Projection Screen','Projector','Shock Sensor','Speaker','Streaming Encoder','Subwoofer','Thermostat','Touch Panel','Video Conference','Wall Plate','Wireless Mic'],
}

const inputClass = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"

const EMPTY_FORM = { name: '', part_number: '', model_number: '', manufacturer: '', industry: 'Security', category: 'Dome Camera' }

export default function DesignerTab() {
  const { profile } = useProfile()
  const [products,       setProducts]       = useState([])
  const [loading,        setLoading]        = useState(true)
  const [showModal,      setShowModal]      = useState(false)
  const [form,           setForm]           = useState(EMPTY_FORM)
  const [saving,         setSaving]         = useState(false)
  const [editingAccessories, setEditingAccessories] = useState(null)

  // Labor
  const [laborEnabled,   setLaborEnabled]   = useState(false)
  const [laborDefaults,  setLaborDefaults]  = useState([]) // [{category, labor_role, hours_per_unit}]
  const [laborRates,     setLaborRates]     = useState([])
  const [savingLabor,    setSavingLabor]    = useState(false)
  const [laborSaved,     setLaborSaved]     = useState(false)

  useEffect(() => {
    if (profile?.org_id) { loadProducts(); loadLaborSettings() }
  }, [profile?.org_id])

  const loadProducts = async () => {
    setLoading(true)
    const { data } = await supabase.from('org_products').select('*').eq('org_id', profile.org_id).order('name')
    setProducts(data || [])
    setLoading(false)
  }

  const loadLaborSettings = async () => {
    const [{ data: org }, { data: defaults }, { data: rates }] = await Promise.all([
      supabase.from('organizations').select('designer_labor_enabled').eq('id', profile.org_id).single(),
      supabase.from('designer_labor_defaults').select('*').eq('org_id', profile.org_id).order('category'),
      supabase.from('labor_rates').select('role').eq('org_id', profile.org_id).order('sort_order'),
    ])
    setLaborEnabled(org?.designer_labor_enabled ?? false)
    setLaborDefaults(defaults || [])
    setLaborRates(rates || [])
  }

  const toggleLabor = async () => {
    const next = !laborEnabled
    setLaborEnabled(next)
    await supabase.from('organizations').update({ designer_labor_enabled: next }).eq('id', profile.org_id)
  }

  const addLaborDefault = () => {
    setLaborDefaults(prev => [...prev, { category: ALL_CATEGORIES[0], labor_role: '', hours_per_unit: 1.0 }])
  }

  const removeLaborDefault = (idx) => setLaborDefaults(prev => prev.filter((_, i) => i !== idx))

  const updateLaborDefault = (idx, field, val) => {
    setLaborDefaults(prev => prev.map((d, i) => i === idx ? { ...d, [field]: val } : d))
  }

  const saveLaborDefaults = async () => {
    setSavingLabor(true)
    try {
      const rows = laborDefaults
        .filter(d => d.category && d.labor_role)
        .map(d => ({
          org_id:         profile.org_id,
          category:       d.category,
          labor_role:     d.labor_role,
          hours_per_unit: parseFloat(d.hours_per_unit) || 1.0,
        }))
      const { error: delErr } = await supabase.from('designer_labor_defaults').delete().eq('org_id', profile.org_id)
      if (delErr) throw delErr
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('designer_labor_defaults').insert(rows)
        if (insErr) throw insErr
      }
      setLaborSaved(true)
      setTimeout(() => setLaborSaved(false), 2000)
    } catch (err) {
      alert('Error saving labor defaults: ' + err.message)
    }
    setSavingLabor(false)
  }

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new()

    // Instructions sheet
    const instructions = [
      ['ForgePt — Labor Defaults Template'],
      [''],
      ['HOW TO USE THIS FILE:'],
      ['1. Go to the "Labor Defaults" sheet (the second tab).'],
      ['2. For each device category you want to include labor for, fill in:'],
      ['   • Labor Role  — must match a role name exactly from your Rate Card in ForgePt Settings.'],
      ['   • Hours Per Device  — the default number of hours to install one device of this type.'],
      ['3. Leave "Labor Role" blank for any category you do NOT want labor calculated on.'],
      ['4. Save the file and upload it back in ForgePt Settings → Designer → Labor Estimation.'],
      [''],
      ['NOTES:'],
      ['• Do not rename or delete the column headers in the Labor Defaults sheet.'],
      ['• Do not add or remove rows from the Category column — the list is fixed.'],
      ['• Hours can be decimals, e.g. 0.5 for 30 minutes, 1.5 for 90 minutes.'],
      ['• Pricing is NOT set here — rates are pulled from your Rate Card when drawings are pushed to a proposal.'],
      ['• Re-uploading this file will replace all existing labor defaults.'],
    ]
    const wsInstr = XLSX.utils.aoa_to_sheet(instructions)
    wsInstr['!cols'] = [{ wch: 80 }]
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions')

    // Data sheet
    const rows = ALL_CATEGORIES.map(cat => {
      const existing = laborDefaults.find(d => d.category === cat)
      return {
        'Category':         cat,
        'Labor Role':       existing?.labor_role     || '',
        'Hours Per Device': existing?.hours_per_unit ?? 1.0,
      }
    })
    const wsData = XLSX.utils.json_to_sheet(rows)
    wsData['!cols'] = [{ wch: 30 }, { wch: 22 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, wsData, 'Labor Defaults')

    XLSX.writeFile(wb, 'ForgePt_Labor_Defaults.xlsx')
  }

  const uploadRef = useRef(null)
  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const wb   = XLSX.read(evt.target.result, { type: 'binary' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' })
        const imported = data
          .map(row => ({
            category:       String(row['Category'] || '').trim(),
            labor_role:     String(row['Labor Role'] || '').trim(),
            hours_per_unit: parseFloat(row['Hours Per Device']) || 1.0,
          }))
          .filter(r => r.category && r.labor_role && ALL_CATEGORIES.includes(r.category))

        if (imported.length === 0) { alert('No valid rows found. Make sure columns are: Category, Labor Role, Hours Per Device'); return }

        setLaborDefaults(imported)
        setSavingLabor(true)
        const { error: delErr } = await supabase.from('designer_labor_defaults').delete().eq('org_id', profile.org_id)
        if (delErr) throw delErr
        const { error: insErr } = await supabase.from('designer_labor_defaults').insert(
          imported.map(d => ({ org_id: profile.org_id, ...d }))
        )
        if (insErr) throw insErr
        setSavingLabor(false)
        setLaborSaved(true)
        setTimeout(() => setLaborSaved(false), 2000)
      } catch (err) {
        setSavingLabor(false)
        alert('Failed to save labor defaults: ' + err.message)
      }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  const handleAdd = async () => {
    if (!form.name.trim() || !form.part_number.trim() || !form.manufacturer.trim()) return
    setSaving(true)
    await supabase.from('org_products').insert({
      org_id: profile.org_id,
      name: form.name.trim(),
      part_number: form.part_number.trim(),
      model_number: form.model_number.trim() || null,
      manufacturer: form.manufacturer.trim(),
      industry: form.industry,
      category: form.category,
      is_active: true,
    })
    await loadProducts()
    setForm(EMPTY_FORM)
    setShowModal(false)
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this custom symbol?')) return
    await supabase.from('org_products').delete().eq('id', id)
    setProducts(prev => prev.filter(p => p.id !== id))
  }

  return (
    <div className="space-y-8">
      {/* Title Block */}
      <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-6">
        <h3 className="text-white font-bold text-base mb-4">Title Block</h3>
        <p className="text-[#8A9AB0] text-xs mb-4">Used on all shop drawing and as-built exports.</p>
        <div className="grid grid-cols-2 gap-4">
          {[['Designer / Engineer Name', 'title_block_engineer'], ['License Number', 'title_block_license'], ['Default Scale', 'title_block_scale']].map(([label, field]) => (
            <div key={field}>
              <label className="text-[#8A9AB0] text-xs mb-1 block">{label}</label>
              <input type="text" placeholder={label} className={inputClass} />
            </div>
          ))}
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Default Sheet Size</label>
            <select className={inputClass}>
              <option value="letter">Letter (8.5 × 11)</option>
              <option value="tabloid">Tabloid (11 × 17)</option>
              <option value="arch_d">Arch D (24 × 36)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Labor Estimation */}
      <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-6">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="text-white font-bold text-base">Labor Estimation</h3>
            <p className="text-[#8A9AB0] text-xs mt-0.5">Automatically calculate labor hours per device in the designer. Hours push to the proposal labor table when drawings are approved — rates come from your rate card.</p>
          </div>
          <button onClick={toggleLabor}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${laborEnabled ? 'bg-[#C8622A]' : 'bg-[#2a3d55]'}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${laborEnabled ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        {laborEnabled && (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">Default Hours per Device Category</p>
              <button onClick={addLaborDefault} className="text-xs text-[#C8622A] hover:text-white transition-colors">+ Add Category</button>
            </div>

            {laborDefaults.length === 0 ? (
              <div className="bg-[#0F1C2E] rounded-lg border border-[#2a3d55] p-6 text-center">
                <p className="text-[#8A9AB0] text-sm">No labor defaults yet</p>
                <p className="text-[#8A9AB0] text-xs mt-1">Add a category to set default hours per device</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 px-2 pb-1">
                  <p className="col-span-4 text-[#8A9AB0] text-xs">Category</p>
                  <p className="col-span-4 text-[#8A9AB0] text-xs">Labor Role</p>
                  <p className="col-span-3 text-[#8A9AB0] text-xs">Hrs / Device</p>
                </div>
                {laborDefaults.map((def, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-[#0F1C2E] rounded-lg px-2 py-2 border border-[#2a3d55]">
                    <select value={def.category} onChange={e => updateLaborDefault(idx, 'category', e.target.value)}
                      className="col-span-4 bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]">
                      {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={def.labor_role} onChange={e => updateLaborDefault(idx, 'labor_role', e.target.value)}
                      className="col-span-4 bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]">
                      <option value="">— Select role —</option>
                      {laborRates.map(r => <option key={r.role} value={r.role}>{r.role}</option>)}
                    </select>
                    <input type="number" min="0.25" step="0.25" value={def.hours_per_unit}
                      onChange={e => updateLaborDefault(idx, 'hours_per_unit', e.target.value)}
                      className="col-span-3 bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:border-[#C8622A]" />
                    <button onClick={() => removeLaborDefault(idx)}
                      className="col-span-1 text-[#8A9AB0] hover:text-red-400 transition-colors text-center">✕</button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <button onClick={saveLaborDefaults} disabled={savingLabor}
                className="px-4 py-2 bg-[#C8622A] text-white text-sm font-semibold rounded-lg hover:bg-[#b5571f] disabled:opacity-50 transition-colors">
                {savingLabor ? 'Saving…' : 'Save Defaults'}
              </button>
              <button onClick={downloadTemplate}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#0F1C2E] text-[#8A9AB0] hover:text-white text-sm rounded-lg border border-[#2a3d55] hover:border-[#C8622A] transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                Download Template
              </button>
              <label className="flex items-center gap-1.5 px-3 py-2 bg-[#0F1C2E] text-[#8A9AB0] hover:text-white text-sm rounded-lg border border-[#2a3d55] hover:border-[#C8622A] transition-colors cursor-pointer">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12"/>
                </svg>
                Upload Excel / CSV
                <input ref={uploadRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} />
              </label>
              {laborSaved && <span className="text-green-400 text-xs">✓ Saved</span>}
              {laborRates.length === 0 && (
                <p className="text-yellow-400 text-xs">Add roles to your Rate Card first to assign them here.</p>
              )}
            </div>
            <p className="text-[#4a5a6a] text-xs mt-2">
              Tip: Download the template, fill in the Labor Role and hours for each device type, then upload it back. Instructions are included in the first tab of the file.
            </p>
          </div>
        )}
      </div>

      {/* Symbol Library */}
      <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-white font-bold text-base">Symbol Library</h3>
          <button onClick={() => setShowModal(true)}
            className="px-3 py-1.5 bg-[#C8622A] text-white text-xs font-semibold rounded-lg hover:bg-[#b5571f] transition-colors">
            + Add Custom Symbol
          </button>
        </div>
        <p className="text-[#8A9AB0] text-xs mb-4">Global symbols are managed by ForgePt. Add your own devices here — they'll appear in the Designer symbol picker under your manufacturer name.</p>

        {loading ? (
          <p className="text-[#8A9AB0] text-sm">Loading...</p>
        ) : products.length === 0 ? (
          <div className="bg-[#0F1C2E] rounded-lg border border-[#2a3d55] p-8 text-center">
            <p className="text-[#8A9AB0] text-sm">No custom symbols yet</p>
            <p className="text-[#8A9AB0] text-xs mt-1">Add devices not in the global library — they show up in your Designer symbol picker</p>
          </div>
        ) : (
          <div className="space-y-2">
            {products.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-[#0F1C2E] rounded-lg px-4 py-3 border border-[#2a3d55]">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-white text-sm font-medium">{p.name}</p>
                    <p className="text-[#8A9AB0] text-xs font-mono">{p.part_number}{p.model_number ? ` · ${p.model_number}` : ''}</p>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-[#2a3d55] text-[#8A9AB0]">{p.category}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-[#2a3d55] text-[#8A9AB0]">{p.industry}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setEditingAccessories(p)} className="text-xs text-[#C8622A] hover:text-white transition-colors">Accessories</button>
                  <button onClick={() => handleDelete(p.id)} className="text-[#8A9AB0] hover:text-red-400 text-sm transition-colors">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Storage Preferences */}
      <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-6">
        <h3 className="text-white font-bold text-base mb-1">Storage & Cleanup</h3>
        <p className="text-[#8A9AB0] text-xs mb-4">Control when inactive projects are flagged for cleanup.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Flag inactive drafts after</label>
            <select className={inputClass}>
              <option value="30">30 days</option><option value="60">60 days</option>
              <option value="90">90 days</option><option value="180">180 days</option><option value="never">Never</option>
            </select>
          </div>
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Flag lost opportunities after</label>
            <select className={inputClass}>
              <option value="30">30 days</option><option value="60">60 days</option>
              <option value="90">90 days</option><option value="never">Never</option>
            </select>
          </div>
        </div>
      </div>

      {/* Accessories Editor */}
      {editingAccessories && (
        <AccessoriesEditor
          product={editingAccessories}
          tableName="org_products"
          onClose={() => setEditingAccessories(null)}
          onSaved={(updated) => {
            setProducts(prev => prev.map(p => p.id === updated.id ? updated : p))
            setEditingAccessories(null)
          }}
        />
      )}

      {/* Add Symbol Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-bold text-lg mb-5">Add Custom Symbol</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Device Name <span className="text-[#C8622A]">*</span></label>
                  <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Hikvision DS-2CD2143G2-I" className={inputClass} />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Part Number <span className="text-[#C8622A]">*</span></label>
                  <input type="text" value={form.part_number} onChange={e => setForm(p => ({ ...p, part_number: e.target.value }))}
                    placeholder="e.g. DS-2CD2143G2-I" className={inputClass} />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Model Number</label>
                  <input type="text" value={form.model_number} onChange={e => setForm(p => ({ ...p, model_number: e.target.value }))}
                    placeholder="Optional" className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Manufacturer <span className="text-[#C8622A]">*</span></label>
                  <input type="text" value={form.manufacturer} onChange={e => setForm(p => ({ ...p, manufacturer: e.target.value }))}
                    placeholder="e.g. Hikvision" className={inputClass} />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Industry</label>
                  <select value={form.industry} onChange={e => {
                    const ind = e.target.value
                    setForm(p => ({ ...p, industry: ind, category: CATEGORY_MAP[ind][0] }))
                  }} className={inputClass}>
                    {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Category (Icon)</label>
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className={inputClass}>
                    {CATEGORY_MAP[form.industry].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM) }}
                  className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={handleAdd} disabled={saving || !form.name.trim() || !form.part_number.trim() || !form.manufacturer.trim()}
                  className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {saving ? 'Adding...' : 'Add Symbol'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
