import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'

const DEFAULT_COMPONENTS = {
  // Security — Cameras
  'Dome Camera':         ['Mount', 'Housing', 'Junction Box', 'Surge Protector'],
  'Bullet Camera':       ['Mount', 'Housing', 'Junction Box', 'Surge Protector'],
  'PTZ Camera':          ['Mount', 'Housing', 'Junction Box', 'Surge Protector'],
  'NVR':                 ['Hard Drive', 'Rail Kit', 'UPS', 'Surge Protector'],
  'Multi-Lens Camera':   ['Mount', 'Housing', 'Junction Box', 'Surge Protector'],
  'Fisheye Camera':      ['Mount', 'Housing', 'Junction Box', 'Surge Protector'],
  'LPR Camera':          ['Mount', 'IR Illuminator', 'Junction Box', 'Surge Protector'],

  // Security — Access Control
  'Access Reader':       ['Back Box', 'Surge Protector', 'REX', 'Door Contact', 'Strike', 'Lock', 'Power Supply'],
  'Access Control Door': ['Lock', 'Reader', 'REX', 'Door Contact', 'Power Supply', 'Controller', 'Push to Exit'],
  'Controller':          ['Power Supply', 'Cabinet', 'Battery Backup', 'Surge Protector'],
  'Motion Sensor':       ['Back Box', 'Surge Protector'],
  'Intercom':            ['Power Supply', 'Back Box', 'Strike', 'Door Release', 'Surge Protector'],
  'Sensor':              ['Back Box', 'Power Supply', 'Surge Protector'],
  'Wireless Lock':       ['Battery Pack', 'Wireless Gateway', 'Credential', 'Door Coordinator'],
  'Guard Tour':          ['Charging Cradle', 'Software License'],

  // Security — Fire Alarm
  'Smoke Detector':      ['Base'],
  'Heat Detector':       ['Base'],
  'Horn Strobe':         ['Back Box', 'Power Supply'],
  'Pull Station':        ['Back Box'],
  'FACP':                ['Cabinet', 'Power Supply', 'Battery'],
  'Duct Detector':       ['Sampling Tube'],

  // AV
  'Speaker':             ['Amplifier', 'Volume Control', 'Back Box', 'Cable'],
  'Display':             ['Mount', 'Media Player', 'HDMI Cable'],
  'Projector':           ['Mount', 'Screen', 'HDMI Cable'],
  'Microphone':          ['DSP', 'Cable'],
  'Amplifier':           ['Rack Mount', 'Power Conditioner'],
  'DSP':                 ['Rack Mount'],
  'Control':             ['Rack Mount', 'Cable'],
  'Network':             ['Patch Cable', 'SFP Module', 'Rack Mount'],
  'Rack':                ['Cable Management', 'PDU', 'Shelf', 'Rail Kit'],

  // Low Voltage / DataCom
  'Data Drop':           ['Cat6 Jack', 'Faceplate', 'Back Box', 'RJ45 Connector', 'Cat6 Cable', 'Patch Cable'],
  'Data':                ['Cat6 Jack', 'Faceplate', 'Back Box', 'RJ45 Connector', 'Cat6 Cable'],
  'Fiber Panel':         ['LC Fiber Connector', 'LC Adapter', 'Fiber Cable', 'Cable Management'],
  'Cable Tray':          ['Cable', 'Straps', 'Mounting Brackets'],
  'UPS':                 ['PDU', 'Battery', 'Rack Mount'],
  'Wireless AP':         ['Mount', 'PoE Injector', 'Cat6 Cable'],

  // Electrical
  'Panel':               ['Breakers', 'Lugs', 'Surge Protection'],
  'Outlet':              ['Cover Plate', 'Box'],
  'Lighting':            ['Driver', 'Mount', 'Wire'],
  'Conduit':             ['Fittings', 'Straps', 'Pull String'],
  'Junction Box':        ['Cover Plate', 'Wire Connectors'],
  'Disconnect':          ['Fuses', 'Wire'],

  // HVAC
  'Diffuser':            ['Collar', 'Duct', 'Damper'],
  'Thermostat':          ['Sub Base', 'Wire', 'Wall Plate'],
  'VAV':                 ['Actuator', 'Controller', 'Duct'],
}

export default function ComponentsSection({ placementId, orgId, category, product }) {
  const [components,   setComponents]   = useState([])
  const [accessories,  setAccessories]  = useState(null) // from global_products
  const [loading,      setLoading]      = useState(true)
  const [adding,       setAdding]       = useState(false)

  useEffect(() => {
    setAccessories(null) // reset on placement change
    loadComponents()
    if (product?.id) loadAccessories()
  }, [placementId, product?.id])

  const loadAccessories = async () => {
    if (product?.accessories) {
      setAccessories(product.accessories)
    } else {
      // Fallback — fetch from DB
      const { data } = await supabase
        .from('global_products')
        .select('accessories')
        .eq('id', product.id)
        .single()
      if (data?.accessories) setAccessories(data.accessories)
      else setAccessories(null)
    }
  }

  const loadComponents = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('placement_components')
      .select('*')
      .eq('placement_id', placementId)
      .order('created_at')
    setComponents(data || [])
    setLoading(false)
  }

  const handleAdd = async (type) => {
    const { data, error } = await supabase
      .from('placement_components')
      .insert({
        org_id:         orgId,
        placement_id:   placementId,
        component_type: type,
        name:           type,
        quantity:       1,
      })
      .select()
      .single()
    if (!error && data) setComponents(prev => [...prev, data])
    setAdding(false)
  }

  const handleUpdate = (id, field, value) => {
    // Update local state immediately for responsive UI
    setComponents(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
  }

  const handleSave = async (id, field, value) => {
    // Only save to DB on blur
    await supabase.from('placement_components').update({ [field]: value }).eq('id', id)
  }

  const handleDelete = async (id) => {
    await supabase.from('placement_components').delete().eq('id', id)
    setComponents(prev => prev.filter(c => c.id !== id))
  }

  const defaultTypes = DEFAULT_COMPONENTS[category] || ['Mount', 'Housing', 'Power Supply', 'Surge Protector']
  const inputClass   = "w-full bg-fp-inset text-fp-text border border-fp-border rounded px-2 py-1 text-xs focus:outline-none focus:border-fp-brand placeholder-[#4a5a6a]"

  const handleSelectOption = async (group, choice) => {
    // Remove any existing component of this group type
    const existing = components.find(c => c.component_type === group.group)
    if (existing) {
      await supabase.from('placement_components').delete().eq('id', existing.id)
    }
    // Add selected choice
    const { data, error } = await supabase
      .from('placement_components')
      .insert({
        org_id:         orgId,
        placement_id:   placementId,
        component_type: group.group,
        name:           choice.name,
        part_number:    choice.part_number,
        manufacturer:   choice.manufacturer,
        quantity:       1,
      })
      .select()
      .single()
    if (!error && data) {
      setComponents(prev => [
        ...prev.filter(c => c.component_type !== group.group),
        data
      ])
    }
  }

  return (
    <div className="border-t border-fp-border pt-3">

      {/* Accessories option groups */}
      {accessories?.options?.map((group, gi) => {
        const selected = components.find(c => c.component_type === group.group)
        return (
          <div key={gi} className="mb-3">
            <p className="text-fp-muted text-xs font-medium mb-1.5">
              {group.group}
              {group.required && <span className="text-[#C8622A] ml-1">*</span>}
            </p>
            <div className="space-y-1.5">
              {(group.choices || []).map((choice, ci) => {
                const existing = components.find(c => c.component_type === group.group && c.part_number === choice.part_number)
                return (
                  <div key={ci} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!existing}
                      onChange={async (e) => {
                        if (e.target.checked) {
                          // Add this choice
                          const { data, error } = await supabase
                            .from('placement_components')
                            .insert({
                              org_id:         orgId,
                              placement_id:   placementId,
                              component_type: group.group,
                              name:           choice.name,
                              part_number:    choice.part_number,
                              manufacturer:   choice.manufacturer,
                              quantity:       1,
                            })
                            .select()
                            .single()
                          if (!error && data) setComponents(prev => [...prev, data])
                        } else {
                          // Remove this choice
                          if (existing) {
                            await supabase.from('placement_components').delete().eq('id', existing.id)
                            setComponents(prev => prev.filter(c => c.id !== existing.id))
                          }
                        }
                      }}
                      className="accent-fp-brand flex-shrink-0"
                    />
                    <div className="flex-1">
                      <span className="text-fp-text text-xs">{choice.name}</span>
                      <span className="text-[#C8622A] font-mono text-xs ml-2">{choice.part_number}</span>
                    </div>
                    {existing && (
                      <div className="flex items-center gap-1">
                        <span className="text-fp-muted text-xs">×</span>
                        <input
                          type="number" min="1" value={existing.quantity || 1}
                          onChange={async (e) => {
                            const qty = parseInt(e.target.value) || 1
                            await supabase.from('placement_components').update({ quantity: qty }).eq('id', existing.id)
                            setComponents(prev => prev.map(c => c.id === existing.id ? { ...c, quantity: qty } : c))
                          }}
                          className="w-10 bg-fp-inset text-fp-text border border-fp-border rounded px-1 py-0.5 text-xs text-center focus:outline-none focus:border-fp-brand"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="flex items-center justify-between mb-2">
        <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide">Components</p>
        <button
          onClick={() => setAdding(s => !s)}
          className="text-xs text-[#C8622A] hover:text-fp-text transition-colors flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          Add
        </button>
      </div>

      {/* Add component picker */}
      {adding && (
        <div className="mb-3 bg-fp-card rounded-lg p-2 border border-fp-border">
          <p className="text-fp-muted text-xs mb-2">Select component type:</p>
          <div className="flex flex-wrap gap-1 mb-2">
            {defaultTypes.map(type => (
              <button key={type} onClick={() => handleAdd(type)}
                className="px-2 py-1 text-xs bg-fp-inset text-fp-muted hover:text-[#C8622A] hover:border-fp-brand border border-fp-border rounded transition-colors">
                {type}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              type="text"
              placeholder="Custom type..."
              className={inputClass}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target.value.trim()) {
                  handleAdd(e.target.value.trim())
                  e.target.value = ''
                }
              }}
            />
            <button onClick={() => setAdding(false)}
              className="text-fp-muted hover:text-fp-text text-xs px-2">✕</button>
          </div>
        </div>
      )}

      {/* Component list */}
      {loading ? (
        <p className="text-fp-muted text-xs">Loading...</p>
      ) : components.length === 0 ? (
        <p className="text-fp-muted text-xs">No components added yet</p>
      ) : (
        <div className="space-y-2">
          {components.map(component => (
            <div key={component.id} className="bg-fp-card rounded-lg p-2 border border-fp-border group">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[#C8622A] text-xs font-medium">{component.component_type}</span>
                <button onClick={() => handleDelete(component.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-fp-muted hover:text-red-400">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <div className="space-y-1">
                <input type="text" placeholder="Name / description"
                  value={component.name || ''}
                  onChange={e => handleUpdate(component.id, 'name', e.target.value)}
                  onBlur={e => handleSave(component.id, 'name', e.target.value)}
                  className={inputClass} />
                <div className="flex gap-1">
                  <input type="text" placeholder="Part #"
                    value={component.part_number || ''}
                    onChange={e => handleUpdate(component.id, 'part_number', e.target.value)}
                    onBlur={e => handleSave(component.id, 'part_number', e.target.value)}
                    className={inputClass} />
                  <input type="text" placeholder="Mfr"
                    value={component.manufacturer || ''}
                    onChange={e => handleUpdate(component.id, 'manufacturer', e.target.value)}
                    onBlur={e => handleSave(component.id, 'manufacturer', e.target.value)}
                    className="w-20 bg-fp-inset text-fp-text border border-fp-border rounded px-2 py-1 text-xs focus:outline-none focus:border-fp-brand placeholder-[#4a5a6a]" />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-fp-muted text-xs">Qty:</span>
                  <input type="number" min="1"
                    value={component.quantity || 1}
                    onChange={e => handleUpdate(component.id, 'quantity', parseInt(e.target.value) || 1)}
                    onBlur={e => handleSave(component.id, 'quantity', parseInt(e.target.value) || 1)}
                    className="w-14 bg-fp-inset text-fp-text border border-fp-border rounded px-2 py-1 text-xs focus:outline-none focus:border-fp-brand text-center" />
                  {component.notes !== undefined && (
                    <input type="text" placeholder="Notes"
                      value={component.notes || ''}
                      onChange={e => handleUpdate(component.id, 'notes', e.target.value)}
                      onBlur={e => handleSave(component.id, 'notes', e.target.value)}
                      className="flex-1 bg-fp-inset text-fp-text border border-fp-border rounded px-2 py-1 text-xs focus:outline-none focus:border-fp-brand placeholder-[#4a5a6a]" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
