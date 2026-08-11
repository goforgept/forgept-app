import { useState } from 'react'

export default function WarrantySection({ proposal, warrantyTemplates = [], onSaveTemplateId, onSave, onToggle, canEdit }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedTemplate = warrantyTemplates.find(t => t.id === proposal?.warranty_template_id)
  const effectiveText = proposal?.warranty_text || selectedTemplate?.text || null
  const hasCustomText = !!proposal?.warranty_text
  const isOn = proposal?.show_warranty !== false

  // Always show to editors so they can add warranty; hide for non-editors with no content
  if (!canEdit && !effectiveText) return null

  const handleSelectTemplate = async (templateId) => {
    setSaving(true)
    setEditing(false)
    await onSaveTemplateId(templateId || null)
    setSaving(false)
  }

  const startEdit = () => {
    setDraft(effectiveText || '')
    setEditing(true)
  }

  const startCustom = () => {
    setDraft('')
    setEditing(true)
  }

  const handleSave = async () => {
    setSaving(true)
    await onSave(draft)
    setSaving(false)
    setEditing(false)
  }

  const resetToTemplate = async () => {
    setSaving(true)
    await onSave(null)
    setSaving(false)
    setEditing(false)
  }

  return (
    <div className="bg-fp-card rounded-xl p-6 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-fp-text font-bold text-lg">Warranty</h3>
        {canEdit && effectiveText && (
          <div className="flex items-center gap-3">
            {!editing && (
              <button onClick={startEdit} className="text-fp-muted hover:text-fp-text text-xs transition-colors">
                Edit
              </button>
            )}
            <div className="flex items-center gap-2">
              <span className="text-fp-muted text-xs">{isOn ? 'On' : 'Off'}</span>
              <button
                onClick={onToggle}
                className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${isOn ? 'bg-fp-brand' : 'bg-fp-border'}`}
              >
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isOn ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Template selector — shown when templates exist */}
      {canEdit && warrantyTemplates.length > 0 && (
        <div className="mb-3">
          <select
            value={proposal?.warranty_template_id || ''}
            onChange={e => handleSelectTemplate(e.target.value)}
            disabled={saving}
            className="w-full bg-fp-bg text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
          >
            <option value="">No warranty selected</option>
            {warrantyTemplates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Text area — editing mode */}
      {editing && (
        <div className="space-y-3">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={6}
            autoFocus
            placeholder="Enter warranty text for this proposal..."
            className="w-full bg-fp-bg text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-y"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} className="text-fp-muted hover:text-fp-text text-sm transition-colors px-2">
              Cancel
            </button>
            {hasCustomText && selectedTemplate && (
              <button onClick={resetToTemplate} disabled={saving} className="text-fp-muted hover:text-fp-text text-xs transition-colors ml-auto">
                Reset to "{selectedTemplate.name}"
              </button>
            )}
          </div>
        </div>
      )}

      {/* Text display */}
      {!editing && effectiveText && (
        <div>
          <p className={`text-fp-muted text-sm leading-relaxed whitespace-pre-wrap ${!isOn ? 'opacity-40' : ''}`}>
            {effectiveText}
          </p>
          {hasCustomText && selectedTemplate && (
            <p className="text-fp-muted text-xs mt-2 opacity-60">Customized — based on "{selectedTemplate.name}"</p>
          )}
        </div>
      )}

      {/* Empty state — no text yet */}
      {!editing && !effectiveText && canEdit && (
        <div className="text-center py-4 space-y-2">
          {warrantyTemplates.length === 0 ? (
            <p className="text-fp-muted text-sm">
              No warranty templates configured.{' '}
              <a href="/settings?tab=proposals" className="text-fp-brand hover:underline">Add one in Settings</a>
              {' '}or write a custom warranty for this proposal below.
            </p>
          ) : (
            <p className="text-fp-muted text-sm opacity-60">Select a template above or write a custom warranty.</p>
          )}
          <button
            onClick={startCustom}
            className="text-fp-brand hover:opacity-80 text-sm font-semibold transition-opacity"
          >
            + Write custom warranty
          </button>
        </div>
      )}
    </div>
  )
}
