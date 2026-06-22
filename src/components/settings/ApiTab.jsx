import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useProfile } from '../../context/ProfileContext'

const SCOPES = [
  { value: 'read:proposals',  label: 'Proposals', desc: 'Read proposals, BOM line items, labor' },
  { value: 'read:clients',    label: 'Clients',   desc: 'Read clients and contacts' },
  { value: 'read:jobs',       label: 'Jobs',       desc: 'Read jobs and job details' },
  { value: 'read:drawings',   label: 'Designer (read)', desc: 'Read floor plans and device placements via API' },
  { value: 'embed:designer',  label: 'Designer (embed)', desc: 'Embed the interactive designer in your own platform' },
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
  const [form, setForm] = useState({ name: '', scopes: ['read:proposals'] })
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
    const { data } = await supabase.from('api_keys').select('*').eq('org_id', profile.org_id).order('created_at', { ascending: false })
    setKeys(data || [])
    setLoading(false)
  }

  const handleGenerate = async () => {
    if (!form.name.trim() || form.scopes.length === 0) return
    setGenerating(true)
    const raw = generateRawKey()
    const hash = await sha256hex(raw)
    const prefix = raw.slice(0, 12)
    const { error } = await supabase.from('api_keys').insert({
      org_id: profile.org_id,
      name: form.name.trim(),
      key_prefix: prefix,
      key_hash: hash,
      scopes: form.scopes,
      is_active: true,
    })
    if (!error) {
      setNewKey(raw)
      setForm({ name: '', scopes: ['read:proposals'] })
      setShowForm(false)
      await loadKeys()
    }
    setGenerating(false)
  }

  const handleRevoke = async (id) => {
    if (!window.confirm('Revoke this API key? Any integrations using it will stop working immediately.')) return
    setRevoking(id)
    await supabase.from('api_keys').delete().eq('id', id)
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
      scopes: p.scopes.includes(scope) ? p.scopes.filter(s => s !== scope) : [...p.scopes, scope]
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
          <div className="flex gap-3 pt-1">
            <button onClick={() => { setShowForm(false); setForm({ name: '', scopes: ['read:proposals'] }) }}
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
        <div className="bg-[#1a2d45] border border-dashed border-[#2a3d55] rounded-xl p-8 text-center">
          <p className="text-[#8A9AB0]">No API keys yet.</p>
          <p className="text-[#8A9AB0] text-xs mt-1">Generate a key to start integrating with external tools.</p>
        </div>
      ) : keys.length > 0 ? (
        <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a3d55] bg-[#0F1C2E]">
                <th className="text-left px-4 py-3 text-[#8A9AB0] font-medium">Name</th>
                <th className="text-left px-4 py-3 text-[#8A9AB0] font-medium">Key</th>
                <th className="text-left px-4 py-3 text-[#8A9AB0] font-medium">Scopes</th>
                <th className="text-left px-4 py-3 text-[#8A9AB0] font-medium">Last Used</th>
                <th className="text-left px-4 py-3 text-[#8A9AB0] font-medium">Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a3d55]/50">
              {keys.map(k => (
                <tr key={k.id} className="hover:bg-[#0F1C2E]/30">
                  <td className="px-4 py-3 text-white font-medium">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-[#8A9AB0] text-xs">{k.key_prefix}••••••••••••••••••••••••••••••••••••••</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {k.scopes.map(s => (
                        <span key={s} className="text-xs bg-[#C8622A]/15 text-[#C8622A] px-2 py-0.5 rounded font-medium">
                          {s.replace('read:', '')}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#8A9AB0] text-xs">{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}</td>
                  <td className="px-4 py-3 text-[#8A9AB0] text-xs">{new Date(k.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleRevoke(k.id)} disabled={revoking === k.id}
                      className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors disabled:opacity-50">
                      {revoking === k.id ? 'Revoking...' : 'Revoke'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

          {keys.some(k => k.scopes.includes('embed:designer')) && (
            <div className="bg-[#0F1C2E] rounded-xl p-4 border border-[#2a3d55]">
              <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-3">Embedding the Designer</p>
              <p className="text-[#8A9AB0] text-xs mb-3">
                Your server exchanges an API key for a 24-hour session token, then passes it to an iframe. The API key never touches the browser.
              </p>
              <div className="space-y-3">
                <div>
                  <p className="text-[#8A9AB0] text-xs mb-1 font-semibold">Step 1 — Generate a session token (server-side)</p>
                  <pre className="bg-[#1a2d45] text-[#C8622A] font-mono text-xs px-3 py-3 rounded-lg overflow-x-auto whitespace-pre">{`POST https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/embed-session
Authorization: Bearer fpk_your_key_here

# Response:
{ "access_token": "eyJ...", "expires_at": "..." }`}</pre>
                </div>
                <div>
                  <p className="text-[#8A9AB0] text-xs mb-1 font-semibold">Step 2 — Embed the iframe</p>
                  <pre className="bg-[#1a2d45] text-[#C8622A] font-mono text-xs px-3 py-3 rounded-lg overflow-x-auto whitespace-pre">{`<iframe
  src="https://app.forgept.com/embed?session=SESSION_TOKEN&proposal=PROPOSAL_UUID"
  width="100%" height="700" frameborder="0"
/>`}</pre>
                </div>
                <div>
                  <p className="text-[#8A9AB0] text-xs mb-1 font-semibold">Step 3 — Receive the BOM export</p>
                  <pre className="bg-[#1a2d45] text-[#C8622A] font-mono text-xs px-3 py-3 rounded-lg overflow-x-auto whitespace-pre">{`window.addEventListener('message', (e) => {
  if (e.data?.type === 'forgept:export') {
    const { proposal_id, devices, cables } = e.data
    // push to your CRM, cart, or quoting system
  }
})`}</pre>
                </div>
              </div>
              <p className="text-[#4a5d75] text-xs mt-3">Omit <code>?proposal=</code> to auto-create a new design project on load.</p>
            </div>
          )}

          <div className="bg-[#0F1C2E] rounded-xl p-4 border border-[#2a3d55]">
            <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-3">Available Endpoints</p>
            <div className="space-y-2">
              {[
                { method: 'GET', path: '/proposals', desc: 'List all proposals (filter with ?status=Won)', scope: 'proposals' },
                { method: 'GET', path: '/proposals/:id', desc: 'Get proposal with full BOM and labor', scope: 'proposals' },
                { method: 'GET', path: '/clients', desc: 'List clients', scope: 'clients' },
                { method: 'GET', path: '/clients/:id', desc: 'Get client details', scope: 'clients' },
                { method: 'GET', path: '/jobs', desc: 'List jobs', scope: 'jobs' },
                { method: 'GET', path: '/jobs/:id', desc: 'Get job details', scope: 'jobs' },
                { method: 'GET', path: '/drawings', desc: 'List proposals with drawing projects', scope: 'drawings' },
                { method: 'GET', path: '/drawings/:proposalId', desc: 'Get drawing project and sheet list', scope: 'drawings' },
                { method: 'GET', path: '/drawings/:proposalId/placements', desc: 'All device placements with position, label, FOV, notes', scope: 'drawings' },
                { method: 'GET', path: '/drawings/:proposalId/bom', desc: 'Aggregate BOM by part number across all sheets', scope: 'drawings' },
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
