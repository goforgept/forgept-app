import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'

const CLIENT_HEADERS = ['Company Name', 'Contact Name', 'Email', 'Phone', 'Address', 'City', 'State', 'Zip', 'Store ID', 'Industry', 'Notes']
const LOCATION_HEADERS = ['Client Company Name', 'Location Name', 'Address', 'City', 'State', 'Zip', 'Store ID', 'Site Contact', 'Site Contact Email', 'Site Contact Phone', 'Notes']

const downloadTemplate = (type) => {
  const headers = type === 'clients' ? CLIENT_HEADERS : LOCATION_HEADERS
  const exampleRow = type === 'clients'
    ? ['Acme Corp', 'John Smith', 'john@acme.com', '615-555-1234', '123 Main St', 'Nashville', 'TN', '37201', 'STR-001', 'Security', 'VIP client']
    : ['Acme Corp', 'Downtown Location', '123 Main St', 'Nashville', 'TN', '37201', 'LOC-001', 'Jane Doe', 'jane@acme.com', '615-555-5678', 'Main branch']
  const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, type === 'clients' ? 'Clients' : 'Locations')
  XLSX.writeFile(wb, `forgept_${type}_import_template.xlsx`)
}

export default function DataImportTab({
  importType, setImportType, importFile, setImportFile,
  importPreview, setImportPreview, importHeaders, setImportHeaders,
  importing, setImporting, importResults, setImportResults,
  locationMatchType, setLocationMatchType, locationMatchClient, setLocationMatchClient,
  importClients, setImportClients, supabase
}) {

  useEffect(() => {
    // Fetch clients for location matching dropdown
    const fetchClients = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
      const { data } = await supabase.from('clients').select('id, company').eq('org_id', profile.org_id).order('company')
      setImportClients(data || [])
    }
    fetchClients()
  }, [])

  const handleFileUpload = async (file) => {
    setImportFile(file)
    setImportPreview([])
    setImportHeaders([])
    setImportResults(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result)
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
      if (rows.length < 2) return
      setImportHeaders(rows[0])
      setImportPreview(rows.slice(1, 6).map(row => {
        const obj = {}
        rows[0].forEach((h, i) => { obj[h] = row[i] || '' })
        return obj
      }))
    }
    reader.readAsArrayBuffer(file)
  }

  const runImport = async () => {
    if (!importFile) return
    setImporting(true)
    setImportResults(null)

    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    const orgId = profile.org_id

    const reader = new FileReader()
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target.result)
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
      const headers = rows[0]
      const dataRows = rows.slice(1).filter(r => r.some(c => c))

      let created = 0
      let skipped = 0
      let errors = 0

      if (importType === 'clients') {
        // Fetch existing clients to check duplicates
        const { data: existing } = await supabase.from('clients').select('company').eq('org_id', orgId)
        const existingNames = new Set((existing || []).map(c => c.company?.toLowerCase().trim()))

        for (const row of dataRows) {
          const obj = {}
          headers.forEach((h, i) => { obj[h] = row[i] || '' })

          const company = String(obj['Company Name'] || '').trim()
          if (!company) { skipped++; continue }
          if (existingNames.has(company.toLowerCase())) { skipped++; continue }

          const { error } = await supabase.from('clients').insert({
            org_id: orgId,
            company: company,
            client_name: String(obj['Contact Name'] || '').trim() || null,
            email: String(obj['Email'] || '').trim() || null,
            phone: String(obj['Phone'] || '').trim() || null,
            address: String(obj['Address'] || '').trim() || null,
            city: String(obj['City'] || '').trim() || null,
            state: String(obj['State'] || '').trim() || null,
            zip: String(obj['Zip'] || '').trim() || null,
            store_id: String(obj['Store ID'] || '').trim() || null,
            industry: String(obj['Industry'] || '').trim() || null,
            notes: String(obj['Notes'] || '').trim() || null,
          })

          if (error) { console.error(error); errors++ } else { created++; existingNames.add(company.toLowerCase()) }
        }

      } else {
        // Locations import
        let clientMap = {}

        if (locationMatchType === 'single' && locationMatchClient) {
          // All locations go under one client
          dataRows.forEach((row, i) => { clientMap[i] = locationMatchClient })
        } else {
          // Auto-match by company name
          const { data: allClients } = await supabase.from('clients').select('id, company').eq('org_id', orgId)
          const clientNameMap = {}
          ;(allClients || []).forEach(c => { clientNameMap[c.company?.toLowerCase().trim()] = c.id })

          dataRows.forEach((row, i) => {
            const obj = {}
            headers.forEach((h, j) => { obj[h] = row[j] || '' })
            const company = String(obj['Client Company Name'] || '').toLowerCase().trim()
            clientMap[i] = clientNameMap[company] || null
          })
        }

        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i]
          const obj = {}
          headers.forEach((h, j) => { obj[h] = row[j] || '' })

          const locationName = String(obj['Location Name'] || '').trim()
          if (!locationName) { skipped++; continue }

          const clientId = clientMap[i]
          if (!clientId) { skipped++; continue }

          const { error } = await supabase.from('client_locations').insert({
            org_id: orgId,
            client_id: clientId,
            site_name: locationName,
            address: String(obj['Address'] || '').trim() || null,
            city: String(obj['City'] || '').trim() || null,
            state: String(obj['State'] || '').trim() || null,
            zip: String(obj['Zip'] || '').trim() || null,
            store_id: String(obj['Store ID'] || '').trim() || null,
            site_contact_name: String(obj['Site Contact'] || '').trim() || null,
            site_contact_email: String(obj['Site Contact Email'] || '').trim() || null,
            site_contact_phone: String(obj['Site Contact Phone'] || '').trim() || null,
            notes: String(obj['Notes'] || '').trim() || null,
          })

          if (error) { console.error(error); errors++ } else { created++ }
        }
      }

      setImportResults({ created, skipped, errors, total: dataRows.length })
      setImporting(false)
    }
    reader.readAsArrayBuffer(importFile)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-white font-bold text-lg mb-1">Data & Import</h3>
        <p className="text-[#8A9AB0] text-sm">Import clients and locations from a CSV or Excel file.</p>
      </div>

      {/* Import Type Toggle */}
      <div className="bg-[#1a2d45] rounded-xl p-5">
        <p className="text-white font-semibold mb-3">What are you importing?</p>
        <div className="flex gap-3">
          {['clients', 'locations'].map(type => (
            <button key={type} onClick={() => { setImportType(type); setImportFile(null); setImportPreview([]); setImportHeaders([]); setImportResults(null) }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${importType === type ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'}`}>
              {type === 'clients' ? '🏢 Clients' : '📍 Locations'}
            </button>
          ))}
        </div>
      </div>

      {/* Template Download */}
      <div className="bg-[#1a2d45] rounded-xl p-5">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-white font-semibold text-sm">Download Template</p>
            <p className="text-[#8A9AB0] text-xs mt-0.5">Download the Excel template with the correct column headers</p>
          </div>
          <button onClick={() => downloadTemplate(importType)}
            className="bg-[#0F1C2E] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#2a3d55] transition-colors">
            ⬇ Download {importType === 'clients' ? 'Clients' : 'Locations'} Template
          </button>
        </div>
      </div>

      {/* Location Match Options */}
      {importType === 'locations' && (
        <div className="bg-[#1a2d45] rounded-xl p-5">
          <p className="text-white font-semibold mb-3">How should locations be matched to clients?</p>
          <div className="flex gap-3 mb-4">
            <button onClick={() => setLocationMatchType('auto')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${locationMatchType === 'auto' ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'}`}>
              Auto-match by Company Name
            </button>
            <button onClick={() => setLocationMatchType('single')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${locationMatchType === 'single' ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'}`}>
              Import Under One Client
            </button>
          </div>
          {locationMatchType === 'auto' && (
            <p className="text-[#8A9AB0] text-xs">Your file must have a "Client Company Name" column that matches an existing client name exactly.</p>
          )}
          {locationMatchType === 'single' && (
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Select Client</label>
              <select value={locationMatchClient} onChange={e => setLocationMatchClient(e.target.value)}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                <option value="">— Select a client —</option>
                {importClients.map(c => <option key={c.id} value={c.id}>{c.company}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* File Upload */}
      <div className="bg-[#1a2d45] rounded-xl p-5">
        <p className="text-white font-semibold mb-3">Upload File</p>
        <input type="file" accept=".xlsx,.xls,.csv"
          onChange={e => e.target.files[0] && handleFileUpload(e.target.files[0])}
          className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
        {importFile && <p className="text-[#8A9AB0] text-xs mt-1">{importFile.name} — {(importFile.size / 1024).toFixed(1)} KB</p>}
      </div>

      {/* Preview */}
      {importPreview.length > 0 && (
        <div className="bg-[#1a2d45] rounded-xl p-5">
          <p className="text-white font-semibold mb-3">Preview — first {importPreview.length} rows</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2a3d55]">
                  {importHeaders.map((h, i) => (
                    <th key={i} className="text-[#8A9AB0] text-left py-2 px-3 font-normal whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {importPreview.map((row, i) => (
                  <tr key={i} className="border-b border-[#2a3d55]/30">
                    {importHeaders.map((h, j) => (
                      <td key={j} className="text-white py-2 px-3 whitespace-nowrap">{row[h] || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[#8A9AB0] text-xs mt-3">Showing first {importPreview.length} rows. All rows will be imported.</p>
        </div>
      )}

      {/* Import Results */}
      {importResults && (
        <div className={`rounded-xl p-5 border ${importResults.errors > 0 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-green-500/10 border-green-500/20'}`}>
          <p className={`font-semibold mb-2 ${importResults.errors > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
            {importResults.errors > 0 ? '⚠ Import completed with errors' : '✓ Import complete'}
          </p>
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-[#0F1C2E] rounded-lg p-3 text-center">
              <p className="text-[#8A9AB0] text-xs mb-1">Total Rows</p>
              <p className="text-white font-bold">{importResults.total}</p>
            </div>
            <div className="bg-[#0F1C2E] rounded-lg p-3 text-center">
              <p className="text-[#8A9AB0] text-xs mb-1">Created</p>
              <p className="text-green-400 font-bold">{importResults.created}</p>
            </div>
            <div className="bg-[#0F1C2E] rounded-lg p-3 text-center">
              <p className="text-[#8A9AB0] text-xs mb-1">Skipped</p>
              <p className="text-yellow-400 font-bold">{importResults.skipped}</p>
            </div>
            <div className="bg-[#0F1C2E] rounded-lg p-3 text-center">
              <p className="text-[#8A9AB0] text-xs mb-1">Errors</p>
              <p className={`font-bold ${importResults.errors > 0 ? 'text-red-400' : 'text-white'}`}>{importResults.errors}</p>
            </div>
          </div>
          {importResults.skipped > 0 && importType === 'clients' && (
            <p className="text-[#8A9AB0] text-xs mt-3">Skipped rows had missing company names or already exist in your account.</p>
          )}
          {importResults.skipped > 0 && importType === 'locations' && (
            <p className="text-[#8A9AB0] text-xs mt-3">Skipped rows had missing location names or couldn't be matched to a client.</p>
          )}
        </div>
      )}

      {/* Import Button */}
      {importPreview.length > 0 && !importResults && (
        <button onClick={runImport} disabled={importing || (importType === 'locations' && locationMatchType === 'single' && !locationMatchClient)}
          className="w-full bg-[#C8622A] text-white py-3 rounded-xl font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
          {importing ? 'Importing...' : `Import ${importType === 'clients' ? 'Clients' : 'Locations'} →`}
        </button>
      )}
    </div>
  )
}