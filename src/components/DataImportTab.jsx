import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { useTags, TagChip, findSimilarTag } from './tags/tags'
import { normalizeLinkedIn } from '../lib/linkedin'

const CLIENT_HEADERS = ['Company Name', 'Contact Name', 'Email', 'Phone', 'Address', 'City', 'State', 'Zip', 'Store ID', 'Industry', 'LinkedIn', 'Tags', 'Notes']
const CONTACT_HEADERS = ['Client Company Name', 'Full Name', 'Title', 'Email', 'Phone', 'LinkedIn', 'Primary Contact', 'Tags', 'Notes']
const LOCATION_HEADERS = ['Client Company Name', 'Location Name', 'Address', 'City', 'State', 'Zip', 'Store ID', 'Site Contact', 'Site Contact Email', 'Site Contact Phone', 'Notes']

const TYPES = {
  clients:   { label: '🏢 Clients',   headers: CLIENT_HEADERS,   sheet: 'Clients',
    example: ['Acme Corp', 'John Smith', 'john@acme.com', '615-555-1234', '123 Main St', 'Nashville', 'TN', '37201', 'STR-001', 'Security', 'linkedin.com/company/acme', 'Tier 1, Hospital', 'VIP client'] },
  contacts:  { label: '👤 Contacts',  headers: CONTACT_HEADERS,  sheet: 'Contacts',
    example: ['Acme Corp', 'Jane Doe', 'Director of Security', 'jane@acme.com', '615-555-5678', 'linkedin.com/in/janedoe', 'Yes', 'Decision Maker', 'Met at ISC West'] },
  locations: { label: '📍 Locations', headers: LOCATION_HEADERS, sheet: 'Locations',
    example: ['Acme Corp', 'Downtown Location', '123 Main St', 'Nashville', 'TN', '37201', 'LOC-001', 'Jane Doe', 'jane@acme.com', '615-555-5678', 'Main branch'] },
}

// Column aliases so common exports (HubSpot, Zoho, Outlook, our own templates) import without renaming
const ALIASES = {
  company:  ['Client Company Name', 'Company Name', 'Company', 'Account Name', 'Organization'],
  fullName: ['Full Name', 'Name', 'Contact Name', 'Contact'],
  first:    ['First Name', 'First'],
  last:     ['Last Name', 'Last'],
  title:    ['Title', 'Job Title', 'Position', 'Role'],
  email:    ['Email', 'Email Address', 'E-mail', 'Work Email'],
  phone:    ['Phone', 'Phone Number', 'Mobile', 'Mobile Phone', 'Mobile Phone Number', 'Work Phone', 'Business Phone', 'Primary Phone', 'Cell'],
  linkedin: ['LinkedIn', 'LinkedIn URL', 'LinkedIn Profile', 'Linkedin Url'],
  primary:  ['Primary Contact', 'Primary', 'Is Primary'],
  tags:     ['Tags', 'Tag', 'Labels'],
  notes:    ['Notes', 'Note', 'Description'],
}
const hkey = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const makeGetter = (headers) => {
  const idx = {}
  headers.forEach((h, i) => { if (idx[hkey(h)] === undefined) idx[hkey(h)] = i })
  return (row, ...names) => {
    for (const n of names.flat()) {
      const i = idx[hkey(n)]
      if (i !== undefined && row[i] !== undefined && row[i] !== null && String(row[i]).trim() !== '') return String(row[i]).trim()
    }
    return ''
  }
}
const splitTags = (s) => {
  const seen = new Map()
  for (const raw of String(s || '').split(/[,;|]/)) {
    const t = raw.trim().replace(/\s+/g, ' ').slice(0, 40)
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t)
  }
  return [...seen.values()]
}
const truthy = (s) => /^(y|yes|true|1|x|primary)$/i.test(String(s || '').trim())

const downloadTemplate = (type) => {
  const t = TYPES[type]
  const ws = XLSX.utils.aoa_to_sheet([t.headers, t.example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, t.sheet)
  XLSX.writeFile(wb, `forgept_${type}_import_template.xlsx`)
}

export default function DataImportTab({
  importType, setImportType, importFile, setImportFile,
  importPreview, setImportPreview, importHeaders, setImportHeaders,
  importing, setImporting, importResults, setImportResults,
  locationMatchType, setLocationMatchType, locationMatchClient, setLocationMatchClient,
  importClients, setImportClients, supabase
}) {
  const tagApi = useTags([])
  const [allRows, setAllRows] = useState([])
  const [createMissing, setCreateMissing] = useState(true)
  const usesTags = importType === 'clients' || importType === 'contacts'
  const usesMatch = importType === 'locations' || importType === 'contacts'

  useEffect(() => {
    // Fetch clients for the "import under one client" dropdown
    const fetchClients = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
      const { data } = await supabase.from('clients').select('id, company').eq('org_id', profile.org_id).order('company')
      setImportClients(data || [])
    }
    fetchClients()
  }, [])

  const resetFile = () => { setImportFile(null); setImportPreview([]); setImportHeaders([]); setImportResults(null); setAllRows([]) }

  const handleFileUpload = async (file) => {
    if (file.size > 10 * 1024 * 1024) return
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
      setAllRows(rows.slice(1).filter(r => r.some(c => c !== undefined && c !== null && String(c).trim() !== '')))
      setImportPreview(rows.slice(1, 6).map(row => {
        const obj = {}
        rows[0].forEach((h, i) => { obj[h] = row[i] || '' })
        return obj
      }))
    }
    reader.readAsArrayBuffer(file)
  }

  // ── Tag plan: what each tag name in the file will become ────────────────────
  const tagPlan = useMemo(() => {
    if (!usesTags || !importHeaders.length) return null
    const get = makeGetter(importHeaders)
    const names = [...new Set(allRows.flatMap(r => splitTags(get(r, ALIASES.tags))))]
    if (!names.length) return null
    const plan = {}
    for (const n of names) {
      const exact = tagApi.tags.find(t => t.name.toLowerCase() === n.toLowerCase())
      if (exact) { plan[n] = { kind: 'existing', tag: exact }; continue }
      const similar = findSimilarTag(n, tagApi.tags)
      if (similar) { plan[n] = { kind: 'mapped', tag: similar }; continue }
      plan[n] = tagApi.canCreate ? { kind: 'new' } : { kind: 'blocked' }
    }
    return plan
  }, [usesTags, importHeaders, allRows, tagApi.tags, tagApi.canCreate])

  const runImport = async () => {
    if (!importFile || !allRows.length) return
    setImporting(true)
    setImportResults(null)

    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    const orgId = profile.org_id
    const get = makeGetter(importHeaders)

    let created = 0, skipped = 0, errors = 0, updated = 0, companiesCreated = 0, badLinkedIn = 0
    const skipReasons = {}
    const skip = (why) => { skipped++; skipReasons[why] = (skipReasons[why] || 0) + 1 }

    // Resolve the file's tag names to tag ids (creating new ones per the plan)
    const tagIdFor = {}
    if (tagPlan) {
      for (const [name, p] of Object.entries(tagPlan)) {
        if (p.kind === 'existing' || p.kind === 'mapped') tagIdFor[name] = p.tag.id
        else if (p.kind === 'new') {
          const t = await tagApi.create(name)
          if (t && !t.error) tagIdFor[name] = t.id
        }
      }
    }
    const tagLinks = { client_tags: [], contact_tags: [] }
    const queueTags = (table, col, id, raw) => {
      for (const n of splitTags(raw)) if (tagIdFor[n]) tagLinks[table].push({ [col]: id, tag_id: tagIdFor[n], org_id: orgId })
    }

    // Company lookup (case-insensitive)
    const { data: existingClients } = await supabase.from('clients').select('id, company').eq('org_id', orgId)
    const companyId = {}
    ;(existingClients || []).forEach(c => { const k = c.company?.toLowerCase().trim(); if (k && !companyId[k]) companyId[k] = c.id })

    if (importType === 'clients') {
      for (const row of allRows) {
        const company = get(row, 'Company Name', ALIASES.company)
        if (!company) { skip('missing company name'); continue }
        const existingId = companyId[company.toLowerCase()]
        if (existingId) {
          // Don't duplicate the company, but still apply the row's tags
          const before = tagLinks.client_tags.length
          queueTags('client_tags', 'client_id', existingId, get(row, ALIASES.tags))
          if (tagLinks.client_tags.length > before) updated++
          else skip('company already exists')
          continue
        }
        const li = normalizeLinkedIn(get(row, ALIASES.linkedin))
        if (li.error) badLinkedIn++
        const { data: newClient, error } = await supabase.from('clients').insert({
          org_id: orgId,
          company,
          client_name: get(row, 'Contact Name') || null,
          email: get(row, ALIASES.email) || null,
          phone: get(row, ALIASES.phone) || null,
          address: get(row, 'Address') || null,
          city: get(row, 'City') || null,
          state: get(row, 'State') || null,
          zip: get(row, 'Zip', 'Zip Code', 'Postal Code') || null,
          store_id: get(row, 'Store ID') || null,
          industry: get(row, 'Industry') || null,
          linkedin_url: li.url || null,
          notes: get(row, ALIASES.notes) || null,
        }).select('id').single()
        if (error) { console.error(error); errors++; continue }
        created++
        companyId[company.toLowerCase()] = newClient.id
        queueTags('client_tags', 'client_id', newClient.id, get(row, ALIASES.tags))
      }

    } else if (importType === 'contacts') {
      const single = locationMatchType === 'single' ? locationMatchClient : null
      // Existing contacts, for duplicate checks: key = client_id|email or client_id|name
      const { data: existingContacts } = await supabase.from('client_contacts').select('id, client_id, full_name, email').eq('org_id', orgId)
      const contactKey = {}
      ;(existingContacts || []).forEach(c => {
        if (c.email) contactKey[`${c.client_id}|e|${c.email.toLowerCase().trim()}`] = c.id
        if (c.full_name) contactKey[`${c.client_id}|n|${c.full_name.toLowerCase().trim()}`] = c.id
      })

      for (const row of allRows) {
        const fullName = get(row, ALIASES.fullName) || [get(row, ALIASES.first), get(row, ALIASES.last)].filter(Boolean).join(' ')
        if (!fullName) { skip('missing name'); continue }

        let clientId = single
        if (!clientId) {
          const company = get(row, ALIASES.company)
          if (!company) { skip('missing company'); continue }
          clientId = companyId[company.toLowerCase()]
          if (!clientId) {
            if (!createMissing) { skip('company not found'); continue }
            const { data: nc, error } = await supabase.from('clients').insert({ org_id: orgId, company }).select('id').single()
            if (error) { console.error(error); errors++; continue }
            clientId = nc.id; companyId[company.toLowerCase()] = nc.id; companiesCreated++
          }
        }

        const email = get(row, ALIASES.email)
        const dupId = (email && contactKey[`${clientId}|e|${email.toLowerCase()}`]) || contactKey[`${clientId}|n|${fullName.toLowerCase()}`]
        if (dupId) {
          const before = tagLinks.contact_tags.length
          queueTags('contact_tags', 'contact_id', dupId, get(row, ALIASES.tags))
          if (tagLinks.contact_tags.length > before) updated++
          else skip('contact already exists')
          continue
        }

        const li = normalizeLinkedIn(get(row, ALIASES.linkedin))
        if (li.error) badLinkedIn++
        const { data: nc, error } = await supabase.from('client_contacts').insert({
          org_id: orgId,
          client_id: clientId,
          full_name: fullName,
          title: get(row, ALIASES.title) || null,
          email: email || null,
          phone: get(row, ALIASES.phone) || null,
          linkedin_url: li.url || null,
          is_primary: truthy(get(row, ALIASES.primary)),
          notes: get(row, ALIASES.notes) || '',
        }).select('id').single()
        if (error) { console.error(error); errors++; continue }
        created++
        if (email) contactKey[`${clientId}|e|${email.toLowerCase()}`] = nc.id
        contactKey[`${clientId}|n|${fullName.toLowerCase()}`] = nc.id
        queueTags('contact_tags', 'contact_id', nc.id, get(row, ALIASES.tags))
      }

    } else {
      // Locations import
      for (const row of allRows) {
        const locationName = get(row, 'Location Name')
        if (!locationName) { skip('missing location name'); continue }
        const clientId = locationMatchType === 'single' ? locationMatchClient : companyId[get(row, ALIASES.company).toLowerCase()]
        if (!clientId) { skip('company not found'); continue }
        const { error } = await supabase.from('client_locations').insert({
          org_id: orgId,
          client_id: clientId,
          site_name: locationName,
          address: get(row, 'Address') || null,
          city: get(row, 'City') || null,
          state: get(row, 'State') || null,
          zip: get(row, 'Zip') || null,
          store_id: get(row, 'Store ID') || null,
          site_contact_name: get(row, 'Site Contact') || null,
          site_contact_email: get(row, 'Site Contact Email') || null,
          site_contact_phone: get(row, 'Site Contact Phone') || null,
          notes: get(row, ALIASES.notes) || null,
        })
        if (error) { console.error(error); errors++ } else { created++ }
      }
    }

    // Apply tags in batches; duplicates (already tagged) are ignored
    let tagsApplied = 0
    for (const [table, col] of [['client_tags', 'client_id'], ['contact_tags', 'contact_id']]) {
      const rows = tagLinks[table]
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500)
        const { error } = await supabase.from(table).upsert(batch, { onConflict: `${col},tag_id`, ignoreDuplicates: true })
        if (error) console.error(error); else tagsApplied += batch.length
      }
    }

    setImportResults({ created, skipped, errors, total: allRows.length, updated, companiesCreated, badLinkedIn, tagsApplied, skipReasons })
    setImporting(false)
    tagApi.reload()
  }

  const counts = tagPlan ? Object.values(tagPlan).reduce((a, p) => ({ ...a, [p.kind]: (a[p.kind] || 0) + 1 }), {}) : {}
  const noun = importType === 'clients' ? 'Clients' : importType === 'contacts' ? 'Contacts' : 'Locations'

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-fp-text font-bold text-lg mb-1">Data & Import</h3>
        <p className="text-fp-muted text-sm">Import clients, contacts and locations from a CSV or Excel file.</p>
      </div>

      {/* Import Type Toggle */}
      <div className="bg-fp-card rounded-xl p-5">
        <p className="text-fp-text font-semibold mb-3">What are you importing?</p>
        <div className="flex flex-wrap gap-3">
          {Object.entries(TYPES).map(([type, t]) => (
            <button key={type} onClick={() => { setImportType(type); resetFile() }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${importType === type ? 'bg-fp-brand text-white' : 'bg-fp-inset text-fp-muted hover:text-fp-text'}`}>
              {t.label}
            </button>
          ))}
        </div>
        {importType === 'contacts' && (
          <p className="text-fp-muted text-xs mt-3">One row per person. Works with exports from HubSpot, Zoho, Outlook and Google Contacts. "First Name" + "Last Name" columns are combined automatically.</p>
        )}
      </div>

      {/* Template Download */}
      <div className="bg-fp-card rounded-xl p-5">
        <div className="flex flex-wrap gap-3 justify-between items-center">
          <div>
            <p className="text-fp-text font-semibold text-sm">Download Template</p>
            <p className="text-fp-muted text-xs mt-0.5">
              Excel template with the right column headers.{usesTags && ' Put several tags in one cell separated by commas.'}
            </p>
          </div>
          <button onClick={() => downloadTemplate(importType)}
            className="bg-fp-inset text-fp-text px-4 py-2 rounded-lg text-sm font-semibold hover:bg-fp-inset transition-colors">
            ⬇ Download {noun} Template
          </button>
        </div>
      </div>

      {/* Company Match Options */}
      {usesMatch && (
        <div className="bg-fp-card rounded-xl p-5">
          <p className="text-fp-text font-semibold mb-3">How should {importType} be matched to clients?</p>
          <div className="flex flex-wrap gap-3 mb-4">
            <button onClick={() => setLocationMatchType('auto')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${locationMatchType === 'auto' ? 'bg-fp-brand text-white' : 'bg-fp-inset text-fp-muted hover:text-fp-text'}`}>
              Auto-match by Company Name
            </button>
            <button onClick={() => setLocationMatchType('single')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${locationMatchType === 'single' ? 'bg-fp-brand text-white' : 'bg-fp-inset text-fp-muted hover:text-fp-text'}`}>
              Import Under One Client
            </button>
          </div>
          {locationMatchType === 'auto' && (
            <p className="text-fp-muted text-xs">Your file needs a company column ("Client Company Name", "Company Name" or "Company"). Matching ignores capitalization.</p>
          )}
          {locationMatchType === 'auto' && importType === 'contacts' && (
            <label className="flex items-center gap-2 mt-3 text-sm text-fp-text cursor-pointer">
              <input id="import-create-missing" type="checkbox" checked={createMissing} onChange={e => setCreateMissing(e.target.checked)} className="accent-[#C8622A]" />
              Create the company if it doesn't exist yet
            </label>
          )}
          {locationMatchType === 'single' && (
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Select Client</label>
              <select value={locationMatchClient} onChange={e => setLocationMatchClient(e.target.value)}
                className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand">
                <option value="">— Select a client —</option>
                {importClients.map(c => <option key={c.id} value={c.id}>{c.company}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* File Upload */}
      <div className="bg-fp-card rounded-xl p-5">
        <p className="text-fp-text font-semibold mb-3">Upload File</p>
        <input type="file" accept=".xlsx,.xls,.csv"
          onChange={e => e.target.files[0] && handleFileUpload(e.target.files[0])}
          className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
        {importFile && <p className="text-fp-muted text-xs mt-1">{importFile.name} — {(importFile.size / 1024).toFixed(1)} KB · {allRows.length} rows</p>}
      </div>

      {/* Preview */}
      {importPreview.length > 0 && (
        <div className="bg-fp-card rounded-xl p-5">
          <p className="text-fp-text font-semibold mb-3">Preview — first {importPreview.length} rows</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-fp-border">
                  {importHeaders.map((h, i) => (
                    <th key={i} className="text-fp-muted text-left py-2 px-3 font-normal whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {importPreview.map((row, i) => (
                  <tr key={i} className="border-b border-fp-border/30">
                    {importHeaders.map((h, j) => (
                      <td key={j} className="text-fp-text py-2 px-3 whitespace-nowrap">{row[h] || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-fp-muted text-xs mt-3">Showing first {importPreview.length} of {allRows.length} rows. All rows will be imported.</p>
        </div>
      )}

      {/* Tag plan */}
      {tagPlan && !importResults && (
        <div className="bg-fp-card rounded-xl p-5 space-y-3">
          <div>
            <p className="text-fp-text font-semibold">Tags in this file</p>
            <p className="text-fp-muted text-xs mt-0.5">
              {[counts.existing && `${counts.existing} already exist`, counts.mapped && `${counts.mapped} matched to an existing tag`, counts.new && `${counts.new} new`, counts.blocked && `${counts.blocked} skipped`].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(tagPlan).map(([name, p]) => (
              <span key={name} className="inline-flex items-center gap-1.5 text-xs">
                {p.kind === 'existing' && <TagChip tag={p.tag} />}
                {p.kind === 'mapped' && <><span className="text-fp-muted line-through">{name}</span><span className="text-fp-muted">→</span><TagChip tag={p.tag} /></>}
                {p.kind === 'new' && <><TagChip tag={{ name, color: 'slate' }} /><span className="text-fp-muted">new</span></>}
                {p.kind === 'blocked' && <span className="text-fp-muted line-through" title="Only admins can create new tags">{name}</span>}
              </span>
            ))}
          </div>
          {counts.mapped > 0 && <p className="text-fp-muted text-xs">Close matches are merged into your existing tag to keep the list clean.</p>}
          {counts.blocked > 0 && <p className="text-fp-muted text-xs">Crossed-out tags don't exist and only admins can create new tags, so they'll be left off.</p>}
        </div>
      )}

      {/* Import Results */}
      {importResults && (
        <div className={`rounded-xl p-5 border ${importResults.errors > 0 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-green-500/10 border-green-500/20'}`}>
          <p className={`font-semibold mb-2 ${importResults.errors > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
            {importResults.errors > 0 ? '⚠ Import completed with errors' : '✓ Import complete'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-fp-inset rounded-lg p-3 text-center">
              <p className="text-fp-muted text-xs mb-1">Total Rows</p>
              <p className="text-fp-text font-bold">{importResults.total}</p>
            </div>
            <div className="bg-fp-inset rounded-lg p-3 text-center">
              <p className="text-fp-muted text-xs mb-1">Created</p>
              <p className="text-green-400 font-bold">{importResults.created}</p>
            </div>
            <div className="bg-fp-inset rounded-lg p-3 text-center">
              <p className="text-fp-muted text-xs mb-1">Skipped</p>
              <p className="text-yellow-400 font-bold">{importResults.skipped}</p>
            </div>
            <div className="bg-fp-inset rounded-lg p-3 text-center">
              <p className="text-fp-muted text-xs mb-1">Errors</p>
              <p className={`font-bold ${importResults.errors > 0 ? 'text-red-400' : 'text-fp-text'}`}>{importResults.errors}</p>
            </div>
          </div>
          <ul className="text-fp-muted text-xs mt-3 space-y-1">
            {importResults.updated > 0 && <li>{importResults.updated} existing {importType === 'clients' ? 'client' : 'contact'}{importResults.updated === 1 ? '' : 's'} got new tags instead of being duplicated.</li>}
            {importResults.companiesCreated > 0 && <li>{importResults.companiesCreated} new compan{importResults.companiesCreated === 1 ? 'y was' : 'ies were'} created for contacts.</li>}
            {importResults.tagsApplied > 0 && <li>{importResults.tagsApplied} tag{importResults.tagsApplied === 1 ? '' : 's'} applied.</li>}
            {importResults.badLinkedIn > 0 && <li>{importResults.badLinkedIn} LinkedIn value{importResults.badLinkedIn === 1 ? ' wasn’t a' : 's weren’t'} LinkedIn link{importResults.badLinkedIn === 1 ? '' : 's'} and {importResults.badLinkedIn === 1 ? 'was' : 'were'} left blank.</li>}
            {Object.entries(importResults.skipReasons || {}).map(([why, n]) => <li key={why}>Skipped {n}: {why}.</li>)}
          </ul>
          <button onClick={resetFile} className="mt-4 text-sm text-fp-brand font-semibold">Import another file</button>
        </div>
      )}

      {/* Import Button */}
      {importPreview.length > 0 && !importResults && (
        <button onClick={runImport} disabled={importing || (usesMatch && locationMatchType === 'single' && !locationMatchClient)}
          className="w-full bg-fp-brand text-white py-3 rounded-xl font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
          {importing ? 'Importing...' : `Import ${allRows.length} ${noun} →`}
        </button>
      )}
    </div>
  )
}

