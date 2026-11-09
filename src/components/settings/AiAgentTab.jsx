import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useProfile } from '../../context/ProfileContext'

const MCP_SERVER_URL = 'https://app.goforgept.com/api/mcp'

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateRawKey() {
  const arr = new Uint8Array(24)
  crypto.getRandomValues(arr)
  return 'fpk_' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function AiAgentTab({ featureApi }) {
  const { profile } = useProfile()
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [newKey, setNewKey] = useState(null)
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState(null)
  const [keyName, setKeyName] = useState('')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (profile?.id && featureApi) loadKeys()
    else setLoading(false)
  }, [profile?.id, featureApi])

  const loadKeys = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('api_keys')
      .select('*')
      .eq('org_id', profile.org_id)
      .eq('user_id', profile.id)
      .contains('scopes', ['agent:mcp'])
      .order('created_at', { ascending: false })
    setKeys(data || [])
    setLoading(false)
  }

  const handleGenerate = async () => {
    if (!keyName.trim()) return
    setGenerating(true)
    const raw = generateRawKey()
    const hash = await sha256hex(raw)
    const prefix = raw.slice(0, 12)
    const { error } = await supabase.from('api_keys').insert({
      org_id:    profile.org_id,
      user_id:   profile.id,
      name:      keyName.trim(),
      key_prefix: prefix,
      key_hash:  hash,
      scopes:    ['agent:mcp'],
      is_active: true,
    })
    if (!error) {
      setNewKey(raw)
      setKeyName('')
      setShowForm(false)
      await loadKeys()
    }
    setGenerating(false)
  }

  const handleRevoke = async (id) => {
    if (!window.confirm('Remove this connection? Your AI agent will lose access immediately.')) return
    setRevoking(id)
    await supabase.from('api_keys').delete().eq('id', id)
    setKeys(prev => prev.filter(k => k.id !== id))
    setRevoking(null)
  }

  const copyKey = async (val) => {
    await navigator.clipboard.writeText(val)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!featureApi) {
    return (
      <div className="bg-fp-card rounded-xl p-8 text-center border border-fp-border">
        <p className="text-fp-text font-bold text-lg mb-2">AI Agent Access</p>
        <p className="text-fp-muted text-sm max-w-md mx-auto">Connecting an AI agent to ForgePt requires an API-enabled plan. Contact your admin to enable this feature.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* New key banner */}
      {newKey && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-5">
          <p className="text-green-400 font-semibold text-sm mb-1">Key generated — copy it now</p>
          <p className="text-fp-muted text-xs mb-3">This key will not be shown again. Paste it into your AI agent's connector settings.</p>
          <div className="flex items-center gap-3">
            <code className="flex-1 bg-fp-inset text-green-400 font-mono text-xs px-4 py-3 rounded-lg border border-green-500/20 break-all">{newKey}</code>
            <button onClick={() => copyKey(newKey)} className="bg-green-600 text-white px-4 py-3 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors shrink-0">
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="mt-3 text-fp-muted hover:text-fp-text text-xs transition-colors">I've saved it — dismiss</button>
        </div>
      )}

      {/* Header */}
      <div>
        <h3 className="text-fp-text font-bold text-lg">AI Agent</h3>
        <p className="text-fp-muted text-sm mt-0.5">Connect Claude, ChatGPT, Grok, or any MCP-compatible assistant to your ForgePt account. Your agent will act as you — with access to your org's data.</p>
      </div>

      {/* Existing keys */}
      {loading ? (
        <p className="text-fp-muted text-sm">Loading...</p>
      ) : keys.length > 0 ? (
        <div className="space-y-2">
          <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide">Your connections</p>
          {keys.map(k => (
            <div key={k.id} className="bg-fp-card border border-fp-border rounded-xl px-4 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-fp-text font-medium text-sm">{k.name}</p>
                <p className="font-mono text-fp-muted text-xs mt-0.5">{k.key_prefix}••••••••••••••</p>
                <p className="text-fp-muted text-xs mt-1">Connected {new Date(k.created_at).toLocaleDateString()} · Last used: {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}</p>
              </div>
              <button onClick={() => handleRevoke(k.id)} disabled={revoking === k.id}
                className="text-red-400 hover:text-red-300 text-xs transition-colors disabled:opacity-50 shrink-0">
                {revoking === k.id ? 'Removing...' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Generate form */}
      {showForm ? (
        <div className="bg-fp-card border border-fp-border rounded-xl p-5 space-y-4">
          <p className="text-fp-text font-semibold text-sm">Name this connection</p>
          <input
            type="text"
            value={keyName}
            onChange={e => setKeyName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGenerate()}
            placeholder="e.g. My Claude, Work Grok, ChatGPT"
            className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
            autoFocus
          />
          <div className="flex gap-3">
            <button onClick={() => { setShowForm(false); setKeyName('') }}
              className="flex-1 py-2 border border-fp-border text-fp-muted rounded-lg text-sm hover:text-fp-text transition-colors">Cancel</button>
            <button onClick={handleGenerate} disabled={generating || !keyName.trim()}
              className="flex-1 py-2 bg-fp-brand text-white rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {generating ? 'Generating...' : 'Generate Key'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="bg-fp-brand text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
          + Connect an AI Agent
        </button>
      )}

      {/* Setup instructions */}
      <div className="bg-fp-inset border border-fp-border rounded-xl p-5 space-y-4">
        <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide">Setup instructions</p>

        <div>
          <p className="text-fp-text text-sm font-semibold mb-1">Server URL</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-fp-card text-fp-brand font-mono text-xs px-3 py-2 rounded-lg border border-fp-border break-all">{MCP_SERVER_URL}</code>
            <button onClick={() => copyKey(MCP_SERVER_URL)} className="text-fp-muted hover:text-fp-text text-xs transition-colors shrink-0 px-2 py-2 border border-fp-border rounded-lg">
              Copy
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {[
            {
              platform: 'Claude Desktop',
              where: 'Settings → Developer → Edit Config',
              code: `{\n  "mcpServers": {\n    "forgept": {\n      "url": "${MCP_SERVER_URL}",\n      "headers": {\n        "Authorization": "Bearer fpk_your_key_here"\n      }\n    }\n  }\n}`,
            },
            {
              platform: 'ChatGPT (Custom GPT)',
              where: 'GPT Editor → Actions → Add Action',
              code: `Server URL:   ${MCP_SERVER_URL}\nAuth type:    API Key\nHeader name:  Authorization\nHeader value: Bearer fpk_your_key_here`,
            },
            {
              platform: 'Grok / xAI',
              where: 'MCP connector settings',
              code: `URL:   ${MCP_SERVER_URL}\nAuth:  Bearer fpk_your_key_here`,
            },
          ].map(p => (
            <div key={p.platform}>
              <p className="text-fp-text text-xs font-semibold mb-0.5">{p.platform} <span className="text-fp-muted font-normal">— {p.where}</span></p>
              <pre className="bg-fp-card text-fp-brand font-mono text-xs px-3 py-3 rounded-lg overflow-x-auto whitespace-pre border border-fp-border">{p.code}</pre>
            </div>
          ))}
        </div>

        <p className="text-fp-muted text-xs">Replace <code className="text-fp-brand font-mono bg-fp-card px-1 rounded">fpk_your_key_here</code> with the key you generate above. Each person on your team should generate their own key so actions are attributed to the right rep.</p>
      </div>

    </div>
  )
}
