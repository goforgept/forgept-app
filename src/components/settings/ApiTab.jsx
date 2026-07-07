import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useProfile } from '../../context/ProfileContext'

const SCOPES = [
  { value: 'read:proposals',  label: 'Proposals',         desc: 'Read proposals, BOM line items, labor' },
  { value: 'read:clients',    label: 'Clients',            desc: 'Read clients and contacts' },
  { value: 'read:jobs',       label: 'Jobs',               desc: 'Read jobs and job details' },
  { value: 'read:drawings',   label: 'Designer (read)',    desc: 'Read floor plans and device placements via API' },
  { value: 'embed:designer',  label: 'Designer (embed)',   desc: 'Embed the interactive designer in your own platform' },
]

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateRawKey() {
  const arr = new Uint8Array(24)
  crypto.getRandomValues(arr)
  return 'fpk_' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function ApiTab({ featureApi }) {
  const { profile } = useProfile()
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', scopes: ['read:proposals'], allowedOrigins: '' })
  const [generating, setGenerating] = useState(false)
  const [newKey, setNewKey] = useState(null)
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState(null)

  useEffect(() => {
    if (profile?.org_id && featureApi) loadKeys()
    else setLoading(false)
  }, [profile?.org_id, featureApi])

  const loadKeys = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('api_keys')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })
    setKeys(data || [])
    setLoading(false)
  }

  const handleGenerate = async () => {
    if (!form.name.trim() || form.scopes.length === 0) return
    setGenerating(true)
    const raw = generateRawKey()
    const hash = await sha256hex(raw)
    const prefix = raw.slice(0, 12)
    const allowedOrigins = form.allowedOrigins
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    const { error } = await supabase.from('api_keys').insert({
      org_id:          profile.org_id,
      name:            form.name.trim(),
      key_prefix:      prefix,
      key_hash:        hash,
      scopes:          form.scopes,
      is_active:       true,
      allowed_origins: allowedOrigins,
    })
    if (!error) {
      setNewKey(raw)
      setForm({ name: '', scopes: ['read:proposals'], allowedOrigins: '' })
      setShowForm(false)
      await loadKeys()
    }
    setGenerating(false)
  }

  const handleRevoke = async (id) => {
    if (!window.confirm('Delete this API key? Any integrations using it will stop working immediately.')) return
    setRevoking(id)
    const { error } = await supabase.from('api_keys').delete().eq('id', id)
    if (error) {
      alert(`Failed to delete key: ${error.message}`)
      setRevoking(null)
      return
    }
    setKeys(prev => prev.filter(k => k.id !== id))
    setRevoking(null)
  }

  const copyKey = async () => {
    await navigator.clipboard.writeText(newKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const toggleScope = (scope) => {
    setForm(p => ({
      ...p,
      scopes: p.scopes.includes(scope) ? p.scopes.filter(s => s !== scope) : [...p.scopes, scope],
    }))
  }

  if (!featureApi) {
    return (
      <div className="space-y-6">
        <div className="bg-[#1a2d45] rounded-xl p-8 text-center border border-[#2a3d55]">
          <div className="w-16 h-16 bg-[#C8622A]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#C8622A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
            </svg>
          </div>
          <h3 className="text-white font-bold text-lg mb-2">API Access</h3>
          <p className="text-[#8A9AB0] text-sm max-w-md mx-auto mb-6">Connect ForgePt to your CRM, export BOMs programmatically, and build custom integrations. API access is available on upgraded plans.</p>
          <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto mb-6 text-left">
            {[
              { icon: '🔗', title: 'CRM Sync', desc: 'Push proposals to Salesforce, HubSpot, or any CRM' },
              { icon: '📦', title: 'BOM Export', desc: 'Pull device lists and quantities programmatically' },
              { icon: '🤖', title: 'AI Integrations', desc: 'Let AI agents read and act on your ForgePt data' },
              { icon: '🔄', title: 'Webhooks', desc: 'Get notified when proposals are won or jobs created' },
            ].map(f => (
              <div key={f.title} className="bg-[#0F1C2E] rounded-lg p-3 border border-[#2a3d55]">
                <p className="text-lg mb-1">{f.icon}</p>
                <p className="text-white text-sm font-medium">{f.title}</p>
                <p className="text-[#8A9AB0] text-xs mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-[#4a5d75] text-xs">Contact us to enable API access for your account.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* New key banner */}
      {newKey && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-5">
          <p className="text-green-400 font-semibold text-sm mb-1">API key generated — copy it now</p>
          <p className="text-[#8A9AB0] text-xs mb-3">This key will not be shown again. Store it somewhere safe.</p>
          <div className="flex items-center gap-3">
            <code className="flex-1 bg-[#0F1C2E] text-green-400 font-mono text-sm px-4 py-3 rounded-lg border border-green-500/20 break-all">{newKey}</code>
            <button onClick={copyKey} className="bg-green-600 text-white px-4 py-3 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors shrink-0">
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="mt-3 text-[#8A9AB0] hover:text-white text-xs transition-colors">I've saved it — dismiss</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-bold text-lg">API Keys</h3>
          <p className="text-[#8A9AB0] text-sm mt-0.5">Keys authenticate your API requests. Treat them like passwords — never share or commit them.</p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
            + Generate Key
          </button>
        )}
      </div>

      {/* Key type overview */}
      {!showForm && (
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              title: 'Data API',
              scopes: 'read:proposals · read:clients · read:jobs · read:drawings',
              desc: 'Pull proposals, BOMs, clients, jobs, and drawing projects into your CRM, ERP, or automation tools like n8n, Zapier, or Make.',
              examples: ['Push won proposals to Salesforce or HubSpot', 'Export BOMs to your ordering system', 'Sync job status with your project management tool'],
            },
            {
              title: 'Embedded Designer',
              scopes: 'embed:designer',
              desc: 'Drop the ForgePt system design canvas into your own platform. Customers design on your site; you receive the BOM via postMessage.',
              examples: ['Embed on a manufacturer or distributor portal', 'Let customers configure their own system', 'Receive device & cable list for quoting or ordering'],
            },
          ].map(card => (
            <div key={card.title} className="bg-[#0F1C2E] border border-[#2a3d55] rounded-xl p-4">
              <p className="text-white font-semibold text-sm mb-1">{card.title}</p>
              <p className="text-[#C8622A] font-mono text-xs mb-2">{card.scopes}</p>
              <p className="text-[#8A9AB0] text-xs mb-3">{card.desc}</p>
              <ul className="space-y-1">
                {card.examples.map(ex => (
                  <li key={ex} className="text-[#4a5d75] text-xs flex gap-1.5">
                    <span className="text-[#C8622A] shrink-0">›</span>{ex}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Generate form */}
      {showForm && (
        <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-5 space-y-4">
          <h4 className="text-white font-semibold">New API Key</h4>
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Key Name <span className="text-[#C8622A]">*</span></label>
            <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Salesforce Integration, n8n Automation"
              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
          </div>
          <div>
            <label className="text-[#8A9AB0] text-xs mb-2 block">Scopes <span className="text-[#C8622A]">*</span></label>
            <div className="space-y-2">
              {SCOPES.map(s => (
                <label key={s.value} className="flex items-start gap-3 cursor-pointer group">
                  <input type="checkbox" checked={form.scopes.includes(s.value)} onChange={() => toggleScope(s.value)}
                    className="mt-0.5 accent-[#C8622A]" />
                  <div>
                    <p className="text-white text-sm font-medium group-hover:text-[#C8622A] transition-colors">{s.label}</p>
                    <p className="text-[#8A9AB0] text-xs">{s.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {form.scopes.includes('embed:designer') && (
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Allowed Origins <span className="text-[#4a5d75] font-normal">(optional)</span></label>
              <input type="text" value={form.allowedOrigins} onChange={e => setForm(p => ({ ...p, allowedOrigins: e.target.value }))}
                placeholder="https://yoursite.com, https://portal.example.com"
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
              <p className="text-[#4a5d75] text-xs mt-1">Comma-separated domains allowed to call embed-session from a browser. Leave blank to allow any origin (server-to-server calls are always allowed).</p>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={() => { setShowForm(false); setForm({ name: '', scopes: ['read:proposals'], allowedOrigins: '' }) }}
              className="flex-1 py-2 border border-[#2a3d55] text-[#8A9AB0] rounded-lg text-sm hover:text-white transition-colors">Cancel</button>
            <button onClick={handleGenerate} disabled={generating || !form.name.trim() || form.scopes.length === 0}
              className="flex-1 py-2 bg-[#C8622A] text-white rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {generating ? 'Generating...' : 'Generate Key'}
            </button>
          </div>
        </div>
      )}

      {/* Keys list */}
      {loading ? (
        <p className="text-[#8A9AB0] text-sm">Loading...</p>
      ) : keys.length === 0 && !showForm ? (
        <div className="bg-[#1a2d45] border border-dashed border-[#2a3d55] rounded-xl p-6 text-center">
          <p className="text-white font-medium mb-1">No API keys yet</p>
          <p className="text-[#8A9AB0] text-xs mb-4">Choose a key type above and click Generate Key to get started.</p>
          <button onClick={() => setShowForm(true)} className="bg-[#C8622A] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
            + Generate Your First Key
          </button>
        </div>
      ) : keys.length > 0 ? (
        <div className="space-y-2">
          {keys.map(k => (
            <div key={k.id} className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-white font-medium text-sm truncate">{k.name}</p>
                  <p className="font-mono text-[#8A9AB0] text-xs mt-0.5 truncate">{k.key_prefix}••••••••••••••</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {k.scopes.map(s => (
                      <span key={s} className="text-xs bg-[#C8622A]/15 text-[#C8622A] px-2 py-0.5 rounded font-medium">
                        {s.replace('read:', '').replace('embed:', '')}
                      </span>
                    ))}
                  </div>
                  {k.allowed_origins?.length > 0 && (
                    <p className="text-[#4a5d75] text-xs mt-1">Origins: {k.allowed_origins.join(', ')}</p>
                  )}
                </div>
                <div className="shrink-0 text-right space-y-1">
                  <p className="text-[#4a5d75] text-xs">Created {new Date(k.created_at).toLocaleDateString()}</p>
                  <p className="text-[#4a5d75] text-xs">Last used: {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}</p>
                  <button onClick={() => handleRevoke(k.id)} disabled={revoking === k.id}
                    className="text-red-400 hover:text-red-300 text-xs transition-colors disabled:opacity-50 block ml-auto">
                    {revoking === k.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Docs */}
      {keys.length > 0 && (
        <div className="space-y-4">
          <div className="bg-[#0F1C2E] rounded-xl p-4 border border-[#2a3d55]">
            <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Authentication</p>
            <p className="text-[#8A9AB0] text-xs mb-2">Include your key in the Authorization header on every request:</p>
            <code className="block bg-[#1a2d45] text-[#C8622A] font-mono text-xs px-3 py-2 rounded-lg">
              Authorization: Bearer fpk_your_key_here
            </code>
            <p className="text-[#4a5d75] text-xs mt-2">Base URL: https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/api/v1</p>
          </div>

          <div className="bg-[#0F1C2E] rounded-xl p-4 border border-[#2a3d55] space-y-5">
            <div>
              <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-1">Embedded Designer API</p>
              <p className="text-[#8A9AB0] text-xs">Drop the ForgePt designer canvas into your own platform. Your server generates a short-lived session token; the iframe never sees your API key.</p>
              <p className="text-[#4a5d75] text-xs mt-1">Required scope: <span className="text-[#C8622A] font-mono">embed:designer</span></p>
            </div>

            {/* Step 1 */}
            <div>
              <p className="text-white text-xs font-semibold mb-1">Step 1 — Exchange API key for session token <span className="text-[#4a5d75] font-normal">(server-side only)</span></p>
              <pre className="bg-[#1a2d45] text-[#C8622A] font-mono text-xs px-3 py-3 rounded-lg overflow-x-auto whitespace-pre">{`POST https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/embed-session
Authorization: Bearer fpk_your_key_here
Content-Type: application/json

# Optional: pass your logged-in user so sessions are tracked per user
{
  "user": {
    "id":    "your-internal-user-id",
    "email": "user@example.com",
    "name":  "Jane Smith"
  }
}

# Response 200
{
  "access_token": "eyJhbGciOiJIUzI1NiJ9...",
  "expires_at":   "2026-06-26T10:00:00.000Z",
  "org_id":       "uuid",
  "user_id":      "uuid"
}`}</pre>
              <p className="text-[#4a5d75] text-xs mt-1">Token is valid for 2 hours; cache and reuse server-side. Passing <code className="text-[#C8622A]">user</code> creates a persistent per-user session. Omit for anonymous shared sessions.</p>
            </div>

            {/* Step 2 */}
            <div>
              <p className="text-white text-xs font-semibold mb-1">Step 2 — Render the iframe</p>
              <pre className="bg-[#1a2d45] text-[#C8622A] font-mono text-xs px-3 py-3 rounded-lg overflow-x-auto whitespace-pre">{`<iframe
  src="https://app.goforgept.com/embed?session=ACCESS_TOKEN&proposal=PROPOSAL_UUID"
  width="100%"
  height="700"
  frameborder="0"
  allow="clipboard-write"
/>`}</pre>
              <div className="mt-2 space-y-1">
                {[
                  { param: 'session',  req: true,  desc: 'The access_token from Step 1.' },
                  { param: 'proposal', req: false, desc: 'UUID of an existing proposal/design to load. Omit to auto-create a new blank project.' },
                ].map(p => (
                  <div key={p.param} className="flex items-start gap-2">
                    <code className="shrink-0 text-[#C8622A] font-mono text-xs w-20">{p.param}</code>
                    <span className={`shrink-0 text-xs w-16 ${p.req ? 'text-yellow-400' : 'text-[#4a5d75]'}`}>{p.req ? 'required' : 'optional'}</span>
                    <span className="text-[#8A9AB0] text-xs">{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 3 */}
            <div>
              <p className="text-white text-xs font-semibold mb-1">Step 3 — Listen for the BOM export</p>
              <p className="text-[#8A9AB0] text-xs mb-2">When the user clicks <strong>Export BOM</strong> inside the designer, the iframe fires a <code className="text-[#C8622A]">postMessage</code> to your page:</p>
              <pre className="bg-[#1a2d45] text-[#C8622A] font-mono text-xs px-3 py-3 rounded-lg overflow-x-auto whitespace-pre">{`window.addEventListener('message', (event) => {
  if (event.data?.type !== 'forgept:export') return

  const { proposal_id, devices, cables } = event.data
  // push to CRM, cart, quoting system, etc.
})`}</pre>
            </div>

            {/* Payload schema */}
            <div>
              <p className="text-white text-xs font-semibold mb-2">Export payload schema</p>
              <div className="space-y-3">
                <div>
                  <p className="text-[#8A9AB0] text-xs font-semibold mb-1">devices — array</p>
                  <div className="space-y-1 pl-2">
                    {[
                      { field: 'part_number',  type: 'string | null', desc: 'Manufacturer part number' },
                      { field: 'name',         type: 'string',        desc: 'Product / component name' },
                      { field: 'manufacturer', type: 'string | null', desc: 'Manufacturer name' },
                      { field: 'category',     type: 'string | null', desc: 'Product category (Camera, NVR, Switch, …)' },
                      { field: 'quantity',     type: 'number',        desc: 'Total count across all sheets' },
                    ].map(f => (
                      <div key={f.field} className="flex items-start gap-2">
                        <code className="shrink-0 text-[#C8622A] font-mono text-xs w-28">{f.field}</code>
                        <span className="shrink-0 text-[#4a5d75] text-xs w-24">{f.type}</span>
                        <span className="text-[#8A9AB0] text-xs">{f.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[#8A9AB0] text-xs font-semibold mb-1">cables — array</p>
                  <div className="space-y-1 pl-2">
                    {[
                      { field: 'cable_type', type: 'string', desc: 'Cable type label (e.g. CAT6, Fiber, Coax)' },
                      { field: 'footage',    type: 'number', desc: 'Total footage across all runs on all sheets' },
                    ].map(f => (
                      <div key={f.field} className="flex items-start gap-2">
                        <code className="shrink-0 text-[#C8622A] font-mono text-xs w-28">{f.field}</code>
                        <span className="shrink-0 text-[#4a5d75] text-xs w-24">{f.type}</span>
                        <span className="text-[#8A9AB0] text-xs">{f.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Errors */}
            <div>
              <p className="text-white text-xs font-semibold mb-2">Error responses (embed-session)</p>
              <div className="space-y-1">
                {[
                  { status: '401', msg: 'Missing API key / Invalid or revoked API key' },
                  { status: '403', msg: 'Key lacks embed:designer scope / API not enabled / Origin not allowed' },
                  { status: '400', msg: 'Key requires proposal_id but none was provided' },
                  { status: '500', msg: 'Failed to create embed session user (contact support)' },
                ].map(e => (
                  <div key={e.status} className="flex items-start gap-2">
                    <span className="shrink-0 text-red-400 font-mono text-xs w-8">{e.status}</span>
                    <span className="text-[#8A9AB0] text-xs">{e.msg}</span>
                  </div>
                ))}
              </div>
              <p className="text-[#4a5d75] text-xs mt-2">If the session token expires mid-session, the iframe shows an expiry message. Regenerate a token server-side and reload the iframe src.</p>
            </div>
          </div>

          <div className="bg-[#0F1C2E] rounded-xl p-4 border border-[#2a3d55]">
            <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-3">Available Endpoints</p>
            <div className="space-y-2">
              {[
                { method: 'GET', path: '/proposals',                         desc: 'List all proposals (filter with ?status=Won)',                scope: 'proposals' },
                { method: 'GET', path: '/proposals/:id',                     desc: 'Get proposal with full BOM and labor',                        scope: 'proposals' },
                { method: 'GET', path: '/clients',                           desc: 'List clients',                                                scope: 'clients' },
                { method: 'GET', path: '/clients/:id',                       desc: 'Get client details',                                          scope: 'clients' },
                { method: 'GET', path: '/jobs',                              desc: 'List jobs',                                                   scope: 'jobs' },
                { method: 'GET', path: '/jobs/:id',                          desc: 'Get job details',                                             scope: 'jobs' },
                { method: 'GET', path: '/drawings',                          desc: 'List proposals with drawing projects',                         scope: 'drawings' },
                { method: 'GET', path: '/drawings/:proposalId',              desc: 'Get drawing project and sheet list',                           scope: 'drawings' },
                { method: 'GET', path: '/drawings/:proposalId/placements',   desc: 'All device placements with position, label, FOV, notes',       scope: 'drawings' },
                { method: 'GET', path: '/drawings/:proposalId/bom',          desc: 'Aggregate BOM by part number across all sheets',               scope: 'drawings' },
              ].map(e => (
                <div key={e.path} className="flex items-start gap-3">
                  <span className="shrink-0 text-xs font-mono font-bold text-green-400 w-10">{e.method}</span>
                  <span className="shrink-0 text-xs font-mono text-[#C8622A] w-64">{e.path}</span>
                  <span className="text-xs text-[#8A9AB0]">{e.desc}</span>
                  <span className="shrink-0 text-xs text-[#4a5d75] italic">{e.scope}</span>
                </div>
              ))}
            </div>
            <p className="text-[#4a5d75] text-xs mt-3">Full schema: /v1/openapi.json</p>
          </div>

        </div>
      )}
    </div>
  )
}
