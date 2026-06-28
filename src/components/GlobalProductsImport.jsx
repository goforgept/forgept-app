import { useState, useRef, useCallback } from 'react'
import { supabase } from '../supabase'

// ─── Element type → ForgePt category mapping ──────────────────────────────────
const ELEMENT_TYPE_MAP = {
  'Fixed Camera Element Profile Template':   { industry: 'security', defaultCategory: 'Dome Camera' },
  'PTZ Camera Element Profile Template':     { industry: 'security', defaultCategory: 'PTZ Camera' },
  'Dome Camera Element Profile Template':    { industry: 'security', defaultCategory: 'Dome Camera' },
  'Bullet Camera Element Profile Template':  { industry: 'security', defaultCategory: 'Bullet Camera' },
  'Multi Sensor Camera Element Profile Template': { industry: 'security', defaultCategory: 'Multi Sensor Camera', preserveCategory: true },
  'Multi-Lens Camera Element Profile Template':   { industry: 'security', defaultCategory: 'Multi Sensor Camera', preserveCategory: true },
  'Access Reader Element Profile Template':  { industry: 'security', defaultCategory: 'Access Reader' },
  'Access Control Element Profile Template': { industry: 'security', defaultCategory: 'Access Control Door' },
  'Controller Element Profile Template':     { industry: 'security', defaultCategory: 'Controller' },
  'Video Intercom Element Profile Template': { industry: 'security', defaultCategory: 'Intercom' },
  'Intercom Element Profile Template':       { industry: 'security', defaultCategory: 'Intercom' },
  'Motion Sensor Element Profile Template':  { industry: 'security', defaultCategory: 'Motion Sensor' },
  'Vape Sensor Element Profile Template':    { industry: 'security', defaultCategory: 'Sensor' },
  'Sensor Element Profile Template':         { industry: 'security', defaultCategory: 'Sensor' },
  'NVR Element Profile Template':            { industry: 'security', defaultCategory: 'NVR' },
  'Speaker Element Profile Template':        { industry: 'av',       defaultCategory: 'Ceiling Speaker' },
  'Display Element Profile Template':        { industry: 'av',       defaultCategory: 'Display' },
  'Switch Element Profile Template':         { industry: 'low_voltage', defaultCategory: 'Network' },
  'Wireless Lock Element Profile Template':  { industry: 'security', defaultCategory: 'Wireless Lock' },
  // Intrusion detection
  'PIR Detector Element Profile Template':          { industry: 'security', defaultCategory: 'PIR Detector' },
  'PIR Sensor Element Profile Template':            { industry: 'security', defaultCategory: 'PIR Detector' },
  'Dual Tech Detector Element Profile Template':    { industry: 'security', defaultCategory: 'Dual Tech Detector' },
  'Door Contact Element Profile Template':          { industry: 'security', defaultCategory: 'Door Contact' },
  'Glass Break Element Profile Template':           { industry: 'security', defaultCategory: 'Glass Break' },
  'Glass Break Detector Element Profile Template':  { industry: 'security', defaultCategory: 'Glass Break' },
  'Alarm Panel Element Profile Template':           { industry: 'security', defaultCategory: 'Alarm Panel' },
  'Alarm Keypad Element Profile Template':          { industry: 'security', defaultCategory: 'Alarm Keypad' },
  'Keypad Element Profile Template':                { industry: 'security', defaultCategory: 'Alarm Keypad' },
  'Interior Siren Element Profile Template':        { industry: 'security', defaultCategory: 'Interior Siren' },
  'Exterior Siren Element Profile Template':        { industry: 'security', defaultCategory: 'Exterior Siren' },
  'Siren Element Profile Template':                 { industry: 'security', defaultCategory: 'Interior Siren' },
  'Panic Button Element Profile Template':          { industry: 'security', defaultCategory: 'Panic Button' },
  'Shock Sensor Element Profile Template':          { industry: 'security', defaultCategory: 'Shock Sensor' },
  'Door Operator Element Profile Template':         { industry: 'security', defaultCategory: 'Door Operator' },
  'Automatic Door Element Profile Template':        { industry: 'security', defaultCategory: 'Door Operator' },
  'Door Opener Element Profile Template':           { industry: 'security', defaultCategory: 'Door Operator' },
  // Fire Alarm
  'Smoke Detector Element Profile Template':        { industry: 'fire_alarm', defaultCategory: 'Smoke Detector' },
  'Heat Detector Element Profile Template':         { industry: 'fire_alarm', defaultCategory: 'Heat Detector' },
  'Duct Detector Element Profile Template':         { industry: 'fire_alarm', defaultCategory: 'Smoke Detector' },
  'Horn Strobe Element Profile Template':           { industry: 'fire_alarm', defaultCategory: 'Horn Strobe' },
  'Strobe Element Profile Template':                { industry: 'fire_alarm', defaultCategory: 'Horn Strobe' },
  'Pull Station Element Profile Template':          { industry: 'fire_alarm', defaultCategory: 'Pull Station' },
  'Manual Pull Station Element Profile Template':   { industry: 'fire_alarm', defaultCategory: 'Pull Station' },
  'FACP Element Profile Template':                  { industry: 'fire_alarm', defaultCategory: 'FACP' },
  'Fire Alarm Control Panel Element Profile Template': { industry: 'fire_alarm', defaultCategory: 'FACP' },
  'Fire Alarm Panel Element Profile Template':      { industry: 'fire_alarm', defaultCategory: 'FACP' },
  'Notification Appliance Element Profile Template': { industry: 'fire_alarm', defaultCategory: 'Horn Strobe' },
  // ACS Expansion
  'ACS Expansion Module Element Profile Template':  { industry: 'security', defaultCategory: 'Controller' },
}

// Camera style → category override
const STYLE_CATEGORY_MAP = {
  'Bullet':  'Bullet Camera',
  'Dome':    'Dome Camera',
  'Wedge':   'Dome Camera',
  'PTZ':     'PTZ Camera',
  'Turret':  'Dome Camera',
  'Box':     'Bullet Camera',
  'Covert':  'Dome Camera',
  'Fisheye':       'Fisheye Camera',
  'Multi-Sensor':        'Multi Sensor Camera',
  'Multi Sensor':        'Multi Sensor Camera',
  'Multi-image sensor':  'Multi Sensor Camera',
  'Multi-Image Sensor':  'Multi Sensor Camera',
  'Panoramic':           'Multi Sensor Camera',
  'Other':   'Dome Camera',
}

// ─── Parse System Surveyor Excel ──────────────────────────────────────────────
async function parseSystemSurveyorFile(file) {
  const { read, utils } = await import('xlsx')
  const buffer    = await file.arrayBuffer()
  const workbook  = read(buffer)
  const ws        = workbook.Sheets[workbook.SheetNames[0]]
  const rawRows   = utils.sheet_to_json(ws, { header: 1, defval: null })

  // Search first 10 rows for the element type label instead of assuming a fixed cell
  let elementType = ''
  outer: for (let ri = 0; ri < Math.min(rawRows.length, 10); ri++) {
    const row = rawRows[ri] || []
    for (let ci = 0; ci < row.length; ci++) {
      const v = String(row[ci] || '').trim()
      if (v.includes('Element Profile Template')) {
        elementType = v
        break outer
      }
    }
  }
  if (!elementType) elementType = String(rawRows[0]?.[3] || '').trim()

  // Debug: find which row has the model numbers
  // Model numbers start at col index 4 in row 3 (0-indexed)
  // But xlsx library may shift cols — find by looking for 'Component Model #'
  let modelRowIdx   = 2  // default row 3
  let labelColIdx   = 3  // default col D
  let productColStart = 4 // default col E

  // Find the label column by searching for known labels
  for (let ri = 0; ri < Math.min(rawRows.length, 15); ri++) {
    const row = rawRows[ri] || []
    for (let ci = 0; ci < row.length; ci++) {
      const v = String(row[ci] || '').trim()
      if (v === 'Component Manufacturer' || v === 'Component Model #' || v === 'Descriptive Label') {
        labelColIdx     = ci
        productColStart = ci + 1
      }
      if (v === 'Component Model #' || (ri === 2 && v === 'Attribute Tab')) {
        modelRowIdx = ri === 2 ? ri : ri
      }
    }
  }

  // Get model numbers from row 3 (index 2), cols after label col
  const modelRow    = rawRows[modelRowIdx] || []
  const productCols = []
  for (let i = productColStart; i < modelRow.length; i++) {
    const v = modelRow[i]
    const s = String(v || '').trim()
    if (s && s !== 'None' && s !== 'Fixed Camera Element Attributes' && 
        s !== 'Vape Sensor Element Attributes' && !s.includes('Element Attributes')) {
      productCols.push({ colIdx: i, model: s })
    }
  }

  // Build label -> values map (lowercase keys for case-insensitive lookup)
  const labelMap = {}
  for (const row of rawRows.slice(3)) {
    if (!row || row.length <= labelColIdx) continue
    const label = String(row[labelColIdx] || '').trim().toLowerCase()
    if (!label || label === 'none') continue
    labelMap[label] = row.slice(productColStart)
  }

  // Also index by col A label (some rows use col A)
  for (const row of rawRows.slice(3)) {
    if (!row) continue
    const labelA = String(row[0] || '').trim().toLowerCase()
    if (labelA && labelA !== 'none' && !labelMap[labelA]) {
      labelMap[labelA] = row.slice(productColStart)
    }
  }

  // Helper — get value for a specific product column (case-insensitive label lookup)
  const getVal = (label, offset) => {
    const vals = labelMap[label.toLowerCase()] || []
    const v    = vals[offset]
    return v && String(v).trim() && String(v).toLowerCase() !== 'none' ? String(v).trim() : null
  }

  // Extract products
  const products = []
  for (const { colIdx, model } of productCols) {
    const offset = colIdx - productColStart
    const mfr    = getVal('Component Manufacturer', offset)
    if (!mfr) continue  // skip empty columns

    const partNum = getVal('Component Model #', offset) || model
        const style   = getVal('Camera Style', offset) || getVal('Camera Type', offset)
    const fovAngle = getVal('AOC Angle', offset)



    const intExt  = getVal('Interior or Exterior?', offset)
    const hasIR   = getVal('      Embedded Infra-red (IR)', offset) === 'YES'

    // Determine category — exact match first, then fuzzy, then keyword fallback
    let mapping = ELEMENT_TYPE_MAP[elementType]
    if (!mapping && elementType) {
      const etLower = elementType.toLowerCase()
      for (const [key, val] of Object.entries(ELEMENT_TYPE_MAP)) {
        if (etLower.includes(key.toLowerCase()) || key.toLowerCase().includes(etLower)) {
          mapping = val
          break
        }
      }
    }

    let category = mapping?.defaultCategory || null
    const isCameraType = !!category?.toLowerCase().includes('camera')

    // Case-insensitive style map lookup
    const styleKey = style
      ? Object.keys(STYLE_CATEGORY_MAP).find(k => k.toLowerCase() === style.toLowerCase())
      : null


    // Apply camera style override — but not for element types with a definitive category
    if (isCameraType && styleKey && !mapping?.preserveCategory) {
      category = STYLE_CATEGORY_MAP[styleKey]
    }

    // Keyword-based fallback when element type didn't match anything
    if (!category) {
      const etLower = elementType.toLowerCase()
      if (styleKey)                                          category = STYLE_CATEGORY_MAP[styleKey]
      else if (etLower.includes('ptz'))                      category = 'PTZ Camera'
      else if (etLower.includes('access control'))           category = 'Access Control Door'
      else if (etLower.includes('access reader') ||
               etLower.includes('reader'))                   category = 'Access Reader'
      else if (etLower.includes('sensor'))                   category = 'Sensor'
      else if (etLower.includes('intercom'))                 category = 'Intercom'
      else if (etLower.includes('nvr'))                      category = 'NVR'
      else if (etLower.includes('controller'))               category = 'Controller'
      else if (etLower.includes('lock'))                     category = 'Wireless Lock'
      else if (etLower.includes('multi sensor') ||
               etLower.includes('multisensor') ||
               etLower.includes('multi-sensor') ||
               etLower.includes('multi-lens') ||
               etLower.includes('multi lens'))               category = 'Multi Sensor Camera'
      else if (etLower.includes('fisheye'))                  category = 'Fisheye Camera'
      else if (etLower.includes('pir') || etLower.includes('passive infrared')) category = 'PIR Detector'
      else if (etLower.includes('dual tech'))                category = 'Dual Tech Detector'
      else if (etLower.includes('door contact') || etLower.includes('contact sensor')) category = 'Door Contact'
      else if (etLower.includes('glass break'))              category = 'Glass Break'
      else if (etLower.includes('keypad'))                   category = 'Alarm Keypad'
      else if (etLower.includes('alarm panel') || etLower.includes('alarm control')) category = 'Alarm Panel'
      else if (etLower.includes('siren') || etLower.includes('sounder')) category = 'Interior Siren'
      else if (etLower.includes('panic'))                    category = 'Panic Button'
      else if (etLower.includes('shock'))                    category = 'Shock Sensor'
      else if (etLower.includes('door operator') || etLower.includes('automatic door') || etLower.includes('door opener')) category = 'Door Operator'
      else if (etLower.includes('smoke') || etLower.includes('duct detector')) category = 'Smoke Detector'
      else if (etLower.includes('heat detector')) category = 'Heat Detector'
      else if (etLower.includes('detector')) category = 'PIR Detector'
      else if (etLower.includes('camera') ||
               etLower.includes('fixed') ||
               etLower.includes('dome') ||
               etLower.includes('bullet'))                   category = 'Dome Camera'
      else                                                   category = 'Dome Camera'
    }


    // Determine industry
    const industry = ELEMENT_TYPE_MAP[elementType]?.industry || 'security'

    // Build specs
    const specs = {}
    if (fovAngle) specs.fov_angle = parseFloat(fovAngle)
    if (hasIR)    specs.has_ir    = true
    if (intExt)   specs.location  = intExt

    // IR range defaults by category if not specified
    const irRangeStr = getVal('IR Range', offset) || getVal('IR Distance', offset) || getVal('Night Vision Range', offset)
    if (irRangeStr) {
      specs.ir_range = parseFloat(irRangeStr)
    } else if (hasIR) {
      // Default IR ranges by camera type
      if (category === 'PTZ Camera')         specs.ir_range = 200
      else if (category === 'Bullet Camera') specs.ir_range = 100
      else if (category === 'LPR Camera')    specs.ir_range = 150
      else                                   specs.ir_range = 60  // dome default
    } else {
      specs.ir_range = 30 // no IR — short range
    }
    const lensDetail    = getVal('Lens Detail', offset)
    const installNotes  = getVal('Installation Notes', offset) || getVal('Installation Considerations', offset)
    const mountHeight   = getVal('Mount Height to Center Line (ft above floor)', offset)

    if (lensDetail)   specs.lens_detail   = lensDetail
    if (installNotes) specs.install_notes = installNotes
    if (mountHeight)  specs.mount_height  = parseFloat(mountHeight)

    products.push({
      industry,
      manufacturer: mfr,
      category,
      name:         (() => {
        const label = getVal('Descriptive Label', offset) || getVal('Product Description', offset) || getVal('Description', offset)
        if (label && label !== partNum) return `${partNum} — ${label}`
        return `${mfr} ${partNum}`
      })(),
      part_number:  partNum,
      is_basic:     false,
      is_active:    true,
      specs:        Object.keys(specs).length > 0 ? specs : null,
    })
  }

  return { elementType, products: dedupeByPartNumber(products) }
}

// ─── Parse ForgePt CSV template ───────────────────────────────────────────────
async function parseForgePtCSV(file) {
  const text = await file.text()
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length < 2) throw new Error('CSV appears empty')

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const products = []

  for (const line of lines.slice(1)) {
    if (line.startsWith('EXAMPLE-')) continue
    if (line.startsWith('#')) continue
    const vals = parseCSVLine(line)
    if (vals.length < 2) continue

    const get = (name) => {
      const idx = headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()))
      return idx >= 0 ? (vals[idx] || '').trim() : ''
    }

    const partNum = get('Part Number')
    const mfr     = get('Manufacturer')
    if (!partNum || !mfr) continue

    const fovStr = get('FOV Angle')
    const specs  = {}
    if (fovStr) specs.fov_angle = parseFloat(fovStr)
    const irStr = get('IR Range')
    if (irStr)  specs.ir_range  = parseFloat(irStr)
    const wattsStr = get('Watts')
    if (wattsStr) specs.power_watts = parseFloat(wattsStr)

    const installNotes = get('Installation Notes')
    if (installNotes) specs.install_notes = installNotes

    products.push({
      industry:     guessIndustry(get('Category')),
      manufacturer: mfr,
      category:     get('Category') || 'Dome Camera',
      name:         get('Product Name') || `${mfr} ${partNum}`,
      part_number:  partNum,
      is_basic:     false,
      is_active:    true,
      specs:        Object.keys(specs).length > 0 ? specs : null,
    })
  }

  return { elementType: 'ForgePt CSV Template', products: dedupeByPartNumber(products) }
}

function parseCSVLine(line) {
  const result = []
  let current  = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(current); current = '' }
    else { current += ch }
  }
  result.push(current)
  return result
}

function guessIndustry(category) {
  const cat = (category || '').toLowerCase()
  if (['camera', 'reader', 'controller', 'nvr', 'sensor', 'intercom', 'lock', 'motion',
       'keypad', 'alarm', 'contact', 'siren', 'panic', 'detector', 'glass break', 'shock',
       'door operator', 'door opener', 'automatic door'].some(k => cat.includes(k))) return 'security'
  if (['speaker', 'display', 'projector', 'amplifier', 'dsp', 'ceiling speaker', 'subwoofer', 'microphone'].some(k => cat.includes(k))) return 'av'
  if (['switch', 'patch', 'fiber', 'data', 'ups', 'rack', 'wireless ap'].some(k => cat.includes(k))) return 'low_voltage'
  if (['outlet', 'panel', 'conduit', 'lighting'].some(k => cat.includes(k))) return 'electrical'
  if (['diffuser', 'thermostat', 'vav'].some(k => cat.includes(k))) return 'hvac'
  if (['smoke', 'heat', 'horn', 'pull', 'facp', 'duct'].some(k => cat.includes(k))) return 'fire_alarm'
  return 'security'
}

function dedupeByPartNumber(products) {
  const seen = new Set()
  return products.filter(p => {
    if (seen.has(p.part_number)) return false
    seen.add(p.part_number)
    return true
  })
}

// ─── GlobalProductsImport component ──────────────────────────────────────────
export default function GlobalProductsImport({ onClose, onImported }) {
  const fileRef = useRef(null)
  const [step,       setStep]       = useState('upload') // upload | preview | importing | done
  const [parsed,     setParsed]     = useState(null)
  const [error,      setError]      = useState(null)
  const [importing,  setImporting]  = useState(false)
  const [progress,   setProgress]   = useState(0)
  const [imported,   setImported]   = useState(0)
  const [skipped,    setSkipped]    = useState(0)
  const [selected,   setSelected]   = useState(new Set())
  const [fileType,   setFileType]   = useState(null) // 'ss' | 'csv'
  const [isDragging, setIsDragging] = useState(false)

  const processFile = useCallback(async (file) => {
    if (!file) return
    setError(null)
    setParsed(null)

    try {
      const isCSV = file.name.toLowerCase().endsWith('.csv')
      setFileType(isCSV ? 'csv' : 'ss')
      const result = isCSV ? await parseForgePtCSV(file) : await parseSystemSurveyorFile(file)

      if (result.products.length === 0) {
        setError('No products found in this file. Make sure it is a valid System Surveyor Element Profile or ForgePt CSV template.')
        return
      }

      setParsed(result)
      setSelected(new Set(result.products.map(p => p.part_number)))
      setStep('preview')
    } catch (err) {
      setError(`Failed to parse file: ${err.message}`)
    }
  }, [])

  const handleFile = useCallback(async (e) => {
    await processFile(e.target.files?.[0])
    e.target.value = ''
  }, [processFile])

  const handleDrop = useCallback(async (e) => {
    e.preventDefault()
    setIsDragging(false)
    await processFile(e.dataTransfer.files?.[0])
  }, [processFile])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false)
  }, [])

  const handleImport = async () => {
    if (!parsed) return
    setImporting(true)
    setStep('importing')
    setProgress(0)

    const toImport = parsed.products
      .filter(p => selected.has(p.part_number))
      .map(p => ({ ...p, part_number: p.part_number.toUpperCase().trim() }))
    let importedCount = 0
    let skippedCount  = 0
    const BATCH = 50

    for (let i = 0; i < toImport.length; i += BATCH) {
      const batch = toImport.slice(i, i + BATCH)
      const { data, error } = await supabase
        .from('global_products')
        .upsert(batch, { onConflict: 'part_number' })
        .select('id')

            if (error) {
        console.error('Batch import error:', error)
        console.error('Error details:', JSON.stringify(error))
        console.error('Batch sample:', batch[0])
        skippedCount += batch.length
      } else {
        importedCount += data?.length || batch.length
      }


      setProgress(Math.round(((i + BATCH) / toImport.length) * 100))
    }

    setImported(importedCount)
    setSkipped(skippedCount)
    setImporting(false)
    setStep('done')
    onImported?.()
  }

  const toggleAll = () => {
    if (selected.size === parsed?.products.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(parsed.products.map(p => p.part_number)))
    }
  }

  const toggleOne = (partNum) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(partNum)) next.delete(partNum)
      else next.add(partNum)
      return next
    })
  }

  const inputClass = "bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a3d55] flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">Import Manufacturer Products</h2>
            <p className="text-[#8A9AB0] text-xs mt-0.5">
              System Surveyor Element Profile (.xlsx) or ForgePt CSV template (.csv)
            </p>
          </div>
          <button onClick={onClose} className="text-[#8A9AB0] hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Upload step ── */}
          {step === 'upload' && (
            <div className="p-6 space-y-6">

              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileRef.current?.click()}
                className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-[#C8622A] bg-[#C8622A]/10'
                    : 'border-[#2a3d55] bg-[#0F1C2E] hover:border-[#C8622A]/50 hover:bg-[#0F1C2E]/80'
                }`}
              >
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile}/>
                <svg className={`w-8 h-8 transition-colors ${isDragging ? 'text-[#C8622A]' : 'text-[#2a3d55]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
                <div className="text-center">
                  <p className="text-white text-sm font-medium">Drop your file here</p>
                  <p className="text-[#8A9AB0] text-xs mt-0.5">or click to browse — .xlsx and .csv supported</p>
                </div>
              </div>

              {/* Format options */}
              <div className="grid grid-cols-2 gap-4">
                {/* System Surveyor */}
                <div className="bg-[#0F1C2E] border border-[#2a3d55] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">📊</span>
                    <p className="text-white font-semibold text-sm">System Surveyor Format</p>
                  </div>
                  <p className="text-[#8A9AB0] text-xs mb-3">
                    Upload any manufacturer's Element Profile Excel file downloaded from System Surveyor's website.
                    Automatically extracts part numbers, FOV angles, and specifications.
                  </p>
                  <label className="flex items-center gap-2 px-3 py-2 bg-[#C8622A] text-white text-xs font-semibold rounded-lg cursor-pointer hover:bg-[#b5571f] transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                    </svg>
                    Upload .xlsx File
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile}/>
                  </label>
                </div>

                {/* ForgePt CSV */}
                <div className="bg-[#0F1C2E] border border-[#2a3d55] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">📋</span>
                    <p className="text-white font-semibold text-sm">ForgePt CSV Template</p>
                  </div>
                  <p className="text-[#8A9AB0] text-xs mb-3">
                    Use our CSV template for any device type — cameras, AV equipment, intrusion detection, access control, and more. Set the <strong className="text-white">Category</strong> column to any valid ForgePt category.
                  </p>
                  <div className="flex gap-2">
                    <a
                      href="/forgept_manufacturer_import_template.csv"
                      download="forgept_manufacturer_import_template.csv"
                      className="flex items-center gap-1.5 px-3 py-2 bg-[#2a3d55] text-[#8A9AB0] text-xs font-medium rounded-lg hover:text-white transition-colors"
                      onClick={(e) => {
                        // Generate and download the template
                        e.preventDefault()
                        const csv = `Part Number,Product Name,Category,Manufacturer,Description,FOV Angle (degrees),IR Range (feet),Watts,Installation Notes
# ── Security Cameras ──────────────────────────────────────────────────────────
# Valid categories: Dome Camera | Bullet Camera | PTZ Camera | Fisheye Camera | Multi Sensor Camera | Indoor Camera
EXAMPLE-CAM-001,Example Dome Camera,Dome Camera,Example Corp,2MP IR Dome Camera,90,98,7.5,PoE required
EXAMPLE-CAM-002,Example Bullet Camera,Bullet Camera,Example Corp,4MP Varifocal Bullet,70,164,12,PoE or 12VDC
# ── Access Control ────────────────────────────────────────────────────────────
# Valid categories: Access Reader | Access Control Door | Controller | Intercom | Wireless Lock | Door Operator
EXAMPLE-ACC-001,Example Card Reader,Access Reader,Example Corp,Multi-format RFID reader,,,3,
EXAMPLE-ACC-002,Example Door Controller,Access Control Door,Example Corp,2-door access controller,,,15,
# ── Intrusion Detection ────────────────────────────────────────────────────────
# Valid categories: PIR Detector | Door Contact | Glass Break | Alarm Keypad | Alarm Panel | Interior Siren | Exterior Siren | Panic Button | Shock Sensor | Dual Tech Detector | Motion Sensor
EXAMPLE-INT-001,Example PIR Detector,PIR Detector,Example Corp,Ceiling mount PIR,,,1,
EXAMPLE-INT-002,Example Door Contact,Door Contact,Example Corp,Surface mount contact,,,0.5,
EXAMPLE-INT-003,Example Alarm Keypad,Alarm Keypad,Example Corp,LCD alarm keypad,,,5,
# ── AV ────────────────────────────────────────────────────────────────────────
# Valid categories: Projector | Projection Screen | Ceiling Speaker | Subwoofer | Microphone | Wireless Mic | Touch Panel | Control Processor | Video Conference | Media Player | HDMI Extender | AV Receiver | Digital Signage | Display | Document Camera | Streaming Encoder | Wall Plate | Clock
EXAMPLE-AV-001,Example Ceiling Speaker,Ceiling Speaker,Example Corp,8-inch 2-way ceiling speaker,,,70,
EXAMPLE-AV-002,Example Projector,Projector,Example Corp,5000 lumen laser projector,,,500,
EXAMPLE-AV-003,Example Touch Panel,Touch Panel,Example Corp,10-inch control touch panel,,,25,
# ── Other ─────────────────────────────────────────────────────────────────────
# Valid categories: NVR | Network | Sensor | Smoke Detector | Horn Strobe
EXAMPLE-NVR-001,Example 16ch NVR,NVR,Example Corp,16-channel 4K NVR,,,65,`
                        const blob = new Blob([csv], { type: 'text/csv' })
                        const url  = URL.createObjectURL(blob)
                        const a    = document.createElement('a')
                        a.href     = url
                        a.download = 'forgept_manufacturer_import_template.csv'
                        a.click()
                        URL.revokeObjectURL(url)
                      }}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                      </svg>
                      Download Template
                    </a>
                    <label className="flex items-center gap-1.5 px-3 py-2 bg-[#C8622A] text-white text-xs font-semibold rounded-lg cursor-pointer hover:bg-[#b5571f] transition-colors">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                      </svg>
                      Upload CSV
                      <input type="file" accept=".csv" className="hidden" onChange={handleFile}/>
                    </label>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-4 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Supported manufacturers note */}
              <div className="bg-[#0F1C2E] rounded-xl p-4 border border-[#2a3d55]">
                <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">System Surveyor Files Available From</p>
                <div className="flex flex-wrap gap-2 text-xs text-[#8A9AB0]">
                  {['Axis', 'Hikvision', 'Pelco', 'Hanwha', 'Bosch', 'Avigilon', 'Verkada',
                    'HID', 'Allegion', 'ASSA ABLOY', 'Lenel', 'Software House',
                    'Triton Sensors', 'Verkada', 'Motorola', 'Genetec'].map(m => (
                    <span key={m} className="px-2 py-1 bg-[#1a2d45] rounded border border-[#2a3d55]">{m}</span>
                  ))}
                  <span className="px-2 py-1 bg-[#1a2d45] rounded border border-[#2a3d55]">+ hundreds more</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Preview step ── */}
          {step === 'preview' && parsed && (
            <div className="flex flex-col h-full">
              {/* Summary */}
              <div className="px-6 py-3 border-b border-[#2a3d55] bg-[#0F1C2E] flex items-center gap-6 text-xs flex-shrink-0">
                <div>
                  <span className="text-[#8A9AB0]">File type</span>
                  <span className="ml-2 text-white font-medium">{fileType === 'csv' ? 'ForgePt CSV' : 'System Surveyor'}</span>
                </div>
                <div>
                  <span className="text-[#8A9AB0]">Element</span>
                  <span className="ml-2 text-white font-medium">{parsed.elementType}</span>
                </div>
                <div>
                  <span className="text-[#8A9AB0]">Products found</span>
                  <span className="ml-2 text-[#C8622A] font-bold">{parsed.products.length}</span>
                </div>
                <div>
                  <span className="text-[#8A9AB0]">Selected</span>
                  <span className="ml-2 text-white font-bold">{selected.size}</span>
                </div>
                <button onClick={toggleAll} className="text-[#C8622A] hover:text-white transition-colors ml-auto">
                  {selected.size === parsed.products.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {/* Product table */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0">
                    <tr className="bg-[#1a2d45] border-b border-[#2a3d55]">
                      <th className="w-8 px-3 py-2"/>
                      <th className="text-left px-3 py-2 font-medium text-[#8A9AB0]">Part Number</th>
                      <th className="text-left px-3 py-2 font-medium text-[#8A9AB0]">Name</th>
                      <th className="text-left px-3 py-2 font-medium text-[#8A9AB0]">Manufacturer</th>
                      <th className="text-left px-3 py-2 font-medium text-[#8A9AB0]">Category</th>
                      <th className="text-left px-3 py-2 font-medium text-[#8A9AB0]">Industry</th>
                      <th className="text-center px-3 py-2 font-medium text-[#8A9AB0]">FOV°</th>
                      <th className="text-center px-3 py-2 font-medium text-[#8A9AB0]">IR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a3d55]/50">
                    {parsed.products.map(p => (
                      <tr key={p.part_number}
                        onClick={() => toggleOne(p.part_number)}
                        className={`cursor-pointer transition-colors ${
                          selected.has(p.part_number) ? 'bg-[#C8622A]/5' : 'hover:bg-[#1a2d45]/50'
                        }`}>
                        <td className="px-3 py-2 text-center">
                          <input type="checkbox" checked={selected.has(p.part_number)}
                            onChange={() => toggleOne(p.part_number)}
                            className="accent-[#C8622A]" onClick={e => e.stopPropagation()}/>
                        </td>
                        <td className="px-3 py-2 font-mono text-[#C8622A] whitespace-nowrap">{p.part_number}</td>
                        <td className="px-3 py-2 text-white max-w-xs">
                          <div className="truncate">{p.name}</div>
                        </td>
                        <td className="px-3 py-2 text-[#8A9AB0] whitespace-nowrap">{p.manufacturer}</td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded-full bg-[#2a3d55] text-[#8A9AB0] whitespace-nowrap">{p.category}</span>
                        </td>
                        <td className="px-3 py-2 text-[#8A9AB0] capitalize">{p.industry?.replace('_', ' ')}</td>
                        <td className="px-3 py-2 text-center text-[#8A9AB0]">
                          {p.specs?.fov_angle ? `${p.specs.fov_angle}°` : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {p.specs?.has_ir
                            ? <span className="text-green-400">✓</span>
                            : <span className="text-[#4a5a6a]">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Importing step ── */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <svg className="w-10 h-10 animate-spin text-[#C8622A]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              <p className="text-white font-semibold">Importing products...</p>
              <div className="w-64 bg-[#0F1C2E] rounded-full h-2">
                <div className="bg-[#C8622A] h-2 rounded-full transition-all" style={{ width: `${progress}%` }}/>
              </div>
              <p className="text-[#8A9AB0] text-sm">{progress}% complete</p>
            </div>
          )}

          {/* ── Done step ── */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-16 h-16 rounded-full bg-green-900/30 border border-green-800/40 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <p className="text-white font-bold text-lg">Import Complete</p>
              <div className="flex gap-8 text-center">
                <div>
                  <p className="text-[#C8622A] text-2xl font-bold">{imported}</p>
                  <p className="text-[#8A9AB0] text-xs">Products imported</p>
                </div>
                {skipped > 0 && (
                  <div>
                    <p className="text-yellow-400 text-2xl font-bold">{skipped}</p>
                    <p className="text-[#8A9AB0] text-xs">Skipped / errors</p>
                  </div>
                )}
              </div>
              <p className="text-[#8A9AB0] text-sm text-center max-w-sm">
                Products are now available in the symbol picker for all organizations.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#2a3d55] flex-shrink-0">
          <button onClick={() => { setStep('upload'); setParsed(null); setError(null) }}
            className="px-4 py-2 text-sm text-[#8A9AB0] hover:text-white transition-colors">
            {step === 'done' ? 'Import Another File' : 'Cancel'}
          </button>

          {step === 'preview' && (
            <button
              onClick={handleImport}
              disabled={selected.size === 0}
              className={`px-6 py-2 text-sm font-semibold rounded-lg transition-colors ${
                selected.size === 0
                  ? 'bg-[#2a3d55] text-[#8A9AB0] cursor-not-allowed'
                  : 'bg-[#C8622A] text-white hover:bg-[#b5571f]'
              }`}>
              Import {selected.size} Product{selected.size !== 1 ? 's' : ''}
            </button>
          )}

          {step === 'done' && (
            <button onClick={onClose}
              className="px-6 py-2 text-sm font-semibold rounded-lg bg-[#C8622A] text-white hover:bg-[#b5571f] transition-colors">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}