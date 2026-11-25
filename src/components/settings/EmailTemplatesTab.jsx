import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'

const VARIABLES = ['{{clientName}}', '{{proposalName}}', '{{proposalValue}}', '{{companyName}}', '{{repName}}']
const RFQ_VARIABLES = ['{{contactName}}', '{{vendorName}}', '{{proposalName}}', '{{itemCount}}', '{{repName}}', '{{companyName}}']
const SEND_VARIABLES = ['{{clientName}}', '{{proposalName}}', '{{repName}}', '{{companyName}}']

const STAGES = [
  { key: 'early', label: 'Early Follow-up', daysKey: 'early_days', subjectKey: 'early_subject', bodyKey: 'early_body', color: 'text-blue-400', desc: 'Sent when the proposal is furthest from close date' },
  { key: 'day14', label: '14-Day Follow-up', daysKey: 'day14_days', subjectKey: 'day14_subject', bodyKey: 'day14_body', color: 'text-yellow-400', desc: 'Mid-range check-in' },
  { key: 'day7', label: '7-Day Follow-up', daysKey: 'day7_days', subjectKey: 'day7_subject', bodyKey: 'day7_body', color: 'text-orange-400', desc: 'Urgency ramp-up as close date approaches' },
  { key: 'close', label: 'Close Date Email', daysKey: null, subjectKey: 'close_subject', bodyKey: 'close_body', color: 'text-red-400', desc: 'Sent on the close date itself' },
]

const inputClass = "w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"

const HOURS = Array.from({ length: 15 }, (_, i) => i + 6) // 6 AM – 8 PM
const hourLabel = (h) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'}`

/** Company-wide follow-up sending: what time they go out, and template vs AI-written drafts. */
function FollowupSending() {
  const [org, setOrg] = useState(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: p } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
      const { data, error } = await supabase.from('organizations').select('id, timezone, followup_send_hour, followup_ai').eq('id', p.org_id).single()
      if (error) { setStatus('Follow-up sending settings need a database update first.'); return }
      setOrg(data)
    })()
  }, [])

  const save = async (patch) => {
    const prev = org
    setOrg(o => ({ ...o, ...patch })); setStatus('')
    const { error } = await supabase.from('organizations').update(patch).eq('id', org.id)
    if (error) { setOrg(prev); setStatus(`Couldn’t save: ${error.message}`) } else setStatus('Saved')
  }

  return (
    <div className="bg-fp-card rounded-xl p-5 space-y-4">
      <div>
        <h3 className="text-fp-text font-bold mb-1">Sending</h3>
        <p className="text-fp-muted text-sm">The day before each follow-up, the rep gets a preview by email and in their notifications. They can edit or skip it; if they do nothing, it sends at this time. Applies to everyone’s follow-ups.</p>
      </div>
      {!org ? <p className="text-fp-muted text-sm">{status || 'Loading…'}</p> : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="fu-hour" className="text-fp-text text-sm font-medium">Send time</label>
            <select id="fu-hour" value={org.followup_send_hour ?? 9} onChange={e => save({ followup_send_hour: parseInt(e.target.value) })}
              className="h-9 bg-fp-inset text-fp-text border border-fp-border rounded-lg px-2 text-sm">
              {HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
            <span className="text-fp-muted text-xs">{(org.timezone || 'America/Chicago').replace('_', ' ')} (company time zone)</span>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-fp-text text-sm font-medium mb-1">Who writes them</legend>
            {[
              [false, 'Your templates', 'The templates below, filled in with the proposal details.'],
              [true, 'AI-written, from your templates', 'Uses the proposal’s scope, recent activity and earlier follow-ups to write a short, professional email in the spirit of your template. Never invents prices, dates or promises. Falls back to the template if anything goes wrong.'],
            ].map(([val, label, hint]) => (
              <label key={label} className="flex items-start gap-3 cursor-pointer">
                <input type="radio" name="fu-ai" checked={!!org.followup_ai === val} onChange={() => save({ followup_ai: val })} className="accent-fp-brand mt-1" />
                <span><span className="block text-fp-text text-sm">{label}</span><span className="block text-fp-muted text-xs">{hint}</span></span>
              </label>
            ))}
          </fieldset>
          {status && <p role="status" className={`text-xs ${status === 'Saved' ? 'text-green-400' : 'text-red-400'}`}>{status}</p>}
        </>
      )}
    </div>
  )
}

export default function EmailTemplatesTab({ emailTemplates, setEmailTemplates, expandedStage, setExpandedStage, savingTemplates, handleSaveTemplates }) {
  return (
    <div className="space-y-6">
      <FollowupSending />
      <div className="bg-fp-card rounded-xl p-5">
        <h3 className="text-fp-text font-bold mb-1">Follow-up Email Templates</h3>
        <p className="text-fp-muted text-sm mb-4">Customize the emails sent to clients at each stage. These apply to the whole team. Use variables to personalize each message.</p>
        <div className="flex flex-wrap gap-2">
          {VARIABLES.map(v => (
            <span key={v} className="bg-fp-inset text-fp-brand text-xs px-2 py-1 rounded font-mono border border-fp-border">{v}</span>
          ))}
        </div>
      </div>

      {STAGES.map(stage => (
        <div key={stage.key} className="bg-fp-card rounded-xl overflow-hidden border border-fp-border">
          <div className="flex justify-between items-center p-5 cursor-pointer hover:bg-fp-hover transition-colors"
            onClick={() => setExpandedStage(expandedStage === stage.key ? null : stage.key)}>
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full bg-current ${stage.color}`} />
              <div>
                <p className="text-fp-text font-semibold">{stage.label}</p>
                <p className="text-fp-muted text-xs">{stage.desc}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {stage.daysKey && (
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <span className="text-fp-muted text-xs">Send at</span>
                  <input type="number" value={emailTemplates[stage.daysKey]}
                    onChange={e => setEmailTemplates(prev => ({ ...prev, [stage.daysKey]: e.target.value }))}
                    className="w-16 bg-fp-inset text-fp-text border border-fp-border rounded px-2 py-1 text-xs focus:outline-none focus:border-fp-brand text-center" />
                  <span className="text-fp-muted text-xs">days before close</span>
                </div>
              )}
              {!stage.daysKey && <span className="text-fp-muted text-xs">Sent on close date</span>}
              <span className="text-fp-muted text-sm">{expandedStage === stage.key ? '▲' : '▼'}</span>
            </div>
          </div>
          {expandedStage === stage.key && (
            <div className="border-t border-fp-border p-5 space-y-4">
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Subject Line</label>
                <input type="text" value={emailTemplates[stage.subjectKey]}
                  onChange={e => setEmailTemplates(prev => ({ ...prev, [stage.subjectKey]: e.target.value }))}
                  className={inputClass} placeholder="Email subject..." />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-fp-muted text-xs">Email Body</label>
                  <div className="flex gap-1">
                    {VARIABLES.map(v => (
                      <button key={v}
                        onClick={() => setEmailTemplates(prev => ({ ...prev, [stage.bodyKey]: (prev[stage.bodyKey] || '') + v }))}
                        className="bg-fp-inset text-fp-brand text-xs px-2 py-0.5 rounded border border-fp-border hover:border-fp-brand transition-colors font-mono">
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea value={emailTemplates[stage.bodyKey]}
                  onChange={e => setEmailTemplates(prev => ({ ...prev, [stage.bodyKey]: e.target.value }))}
                  rows={10}
                  className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none font-mono"
                  placeholder="Email body..." />
              </div>
            </div>
          )}
        </div>
      ))}

      {/* RFQ Email Template */}
      <div className="bg-fp-card rounded-xl overflow-hidden border border-fp-border">
        <div className="flex justify-between items-center p-5 cursor-pointer hover:bg-fp-hover transition-colors"
          onClick={() => setExpandedStage(expandedStage === 'rfq' ? null : 'rfq')}>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-purple-400" />
            <div>
              <p className="text-fp-text font-semibold">RFQ Email</p>
              <p className="text-fp-muted text-xs">Sent to vendors when requesting pricing</p>
            </div>
          </div>
          <span className="text-fp-muted text-sm">{expandedStage === 'rfq' ? '▲' : '▼'}</span>
        </div>
        {expandedStage === 'rfq' && (
          <div className="border-t border-fp-border p-5 space-y-4">
            <div className="flex flex-wrap gap-2 mb-2">
              {RFQ_VARIABLES.map(v => (
                <span key={v} className="bg-fp-inset text-fp-brand text-xs px-2 py-1 rounded font-mono border border-fp-border">{v}</span>
              ))}
            </div>
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Subject Line</label>
              <input type="text" value={emailTemplates.rfq_subject}
                onChange={e => setEmailTemplates(prev => ({ ...prev, rfq_subject: e.target.value }))}
                className={inputClass} placeholder="RFQ subject..." />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-fp-muted text-xs">Email Body (intro text — appears above the item table)</label>
                <div className="flex gap-1">
                  {RFQ_VARIABLES.map(v => (
                    <button key={v}
                      onClick={() => setEmailTemplates(prev => ({ ...prev, rfq_body: (prev.rfq_body || '') + v }))}
                      className="bg-fp-inset text-fp-brand text-xs px-2 py-0.5 rounded border border-fp-border hover:border-fp-brand transition-colors font-mono">
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <textarea value={emailTemplates.rfq_body}
                onChange={e => setEmailTemplates(prev => ({ ...prev, rfq_body: e.target.value }))}
                rows={8}
                className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none font-mono"
                placeholder="RFQ intro message..." />
            </div>
          </div>
        )}
      </div>

      {/* Proposal Send Default Template */}
      <div className="bg-fp-card rounded-xl overflow-hidden border border-fp-border">
        <div className="flex justify-between items-center p-5 cursor-pointer hover:bg-fp-hover transition-colors"
          onClick={() => setExpandedStage(expandedStage === 'send' ? null : 'send')}>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <div>
              <p className="text-fp-text font-semibold">Proposal Send Default</p>
              <p className="text-fp-muted text-xs">Pre-fills the message when emailing a proposal to a client</p>
            </div>
          </div>
          <span className="text-fp-muted text-sm">{expandedStage === 'send' ? '▲' : '▼'}</span>
        </div>
        {expandedStage === 'send' && (
          <div className="border-t border-fp-border p-5 space-y-4">
            <div className="flex flex-wrap gap-2 mb-2">
              {SEND_VARIABLES.map(v => (
                <span key={v} className="bg-fp-inset text-fp-brand text-xs px-2 py-1 rounded font-mono border border-fp-border">{v}</span>
              ))}
            </div>
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Subject Line</label>
              <input type="text" value={emailTemplates.send_subject}
                onChange={e => setEmailTemplates(prev => ({ ...prev, send_subject: e.target.value }))}
                className={inputClass} placeholder="Proposal email subject..." />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-fp-muted text-xs">Email Body</label>
                <div className="flex gap-1">
                  {SEND_VARIABLES.map(v => (
                    <button key={v}
                      onClick={() => setEmailTemplates(prev => ({ ...prev, send_body: (prev.send_body || '') + v }))}
                      className="bg-fp-inset text-fp-brand text-xs px-2 py-0.5 rounded border border-fp-border hover:border-fp-brand transition-colors font-mono">
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <textarea value={emailTemplates.send_body}
                onChange={e => setEmailTemplates(prev => ({ ...prev, send_body: e.target.value }))}
                rows={8}
                className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none font-mono"
                placeholder="Proposal email body..." />
            </div>
          </div>
        )}
      </div>

      <button onClick={handleSaveTemplates} disabled={savingTemplates}
        className="bg-fp-brand text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
        {savingTemplates ? 'Saving...' : 'Save Email Templates'}
      </button>
    </div>
  )
}
