const VARIABLES = ['{{clientName}}', '{{proposalName}}', '{{proposalValue}}', '{{companyName}}', '{{repName}}']

const STAGES = [
  { key: 'early', label: 'Early Follow-up', daysKey: 'early_days', subjectKey: 'early_subject', bodyKey: 'early_body', color: 'text-blue-400', desc: 'Sent when the proposal is furthest from close date' },
  { key: 'day14', label: '14-Day Follow-up', daysKey: 'day14_days', subjectKey: 'day14_subject', bodyKey: 'day14_body', color: 'text-yellow-400', desc: 'Mid-range check-in' },
  { key: 'day7', label: '7-Day Follow-up', daysKey: 'day7_days', subjectKey: 'day7_subject', bodyKey: 'day7_body', color: 'text-orange-400', desc: 'Urgency ramp-up as close date approaches' },
  { key: 'close', label: 'Close Date Email', daysKey: null, subjectKey: 'close_subject', bodyKey: 'close_body', color: 'text-red-400', desc: 'Sent on the close date itself' },
]

const inputClass = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"

export default function EmailTemplatesTab({ emailTemplates, setEmailTemplates, expandedStage, setExpandedStage, savingTemplates, handleSaveTemplates }) {
  return (
    <div className="space-y-6">
      <div className="bg-[#1a2d45] rounded-xl p-5">
        <h3 className="text-white font-bold mb-1">Follow-up Email Templates</h3>
        <p className="text-[#8A9AB0] text-sm mb-4">Customize the emails sent to clients at each stage. Use variables to personalize each message.</p>
        <div className="flex flex-wrap gap-2">
          {VARIABLES.map(v => (
            <span key={v} className="bg-[#0F1C2E] text-[#C8622A] text-xs px-2 py-1 rounded font-mono border border-[#2a3d55]">{v}</span>
          ))}
        </div>
      </div>

      {STAGES.map(stage => (
        <div key={stage.key} className="bg-[#1a2d45] rounded-xl overflow-hidden border border-[#2a3d55]">
          <div className="flex justify-between items-center p-5 cursor-pointer hover:bg-[#1f3550] transition-colors"
            onClick={() => setExpandedStage(expandedStage === stage.key ? null : stage.key)}>
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full bg-current ${stage.color}`} />
              <div>
                <p className="text-white font-semibold">{stage.label}</p>
                <p className="text-[#8A9AB0] text-xs">{stage.desc}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {stage.daysKey && (
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <span className="text-[#8A9AB0] text-xs">Send at</span>
                  <input type="number" value={emailTemplates[stage.daysKey]}
                    onChange={e => setEmailTemplates(prev => ({ ...prev, [stage.daysKey]: e.target.value }))}
                    className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A] text-center" />
                  <span className="text-[#8A9AB0] text-xs">days before close</span>
                </div>
              )}
              {!stage.daysKey && <span className="text-[#8A9AB0] text-xs">Sent on close date</span>}
              <span className="text-[#8A9AB0] text-sm">{expandedStage === stage.key ? '▲' : '▼'}</span>
            </div>
          </div>
          {expandedStage === stage.key && (
            <div className="border-t border-[#2a3d55] p-5 space-y-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Subject Line</label>
                <input type="text" value={emailTemplates[stage.subjectKey]}
                  onChange={e => setEmailTemplates(prev => ({ ...prev, [stage.subjectKey]: e.target.value }))}
                  className={inputClass} placeholder="Email subject..." />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[#8A9AB0] text-xs">Email Body</label>
                  <div className="flex gap-1">
                    {VARIABLES.map(v => (
                      <button key={v}
                        onClick={() => setEmailTemplates(prev => ({ ...prev, [stage.bodyKey]: (prev[stage.bodyKey] || '') + v }))}
                        className="bg-[#0F1C2E] text-[#C8622A] text-xs px-2 py-0.5 rounded border border-[#2a3d55] hover:border-[#C8622A] transition-colors font-mono">
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea value={emailTemplates[stage.bodyKey]}
                  onChange={e => setEmailTemplates(prev => ({ ...prev, [stage.bodyKey]: e.target.value }))}
                  rows={10}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none font-mono"
                  placeholder="Email body..." />
              </div>
            </div>
          )}
        </div>
      ))}

      <button onClick={handleSaveTemplates} disabled={savingTemplates}
        className="bg-[#C8622A] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
        {savingTemplates ? 'Saving...' : 'Save Email Templates'}
      </button>
    </div>
  )
}
