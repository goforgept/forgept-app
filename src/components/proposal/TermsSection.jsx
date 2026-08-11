import { useState } from 'react'

export default function TermsSection({ proposal, orgTermsText, onToggle, onSave, canEdit }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const effectiveText = proposal?.terms_text || orgTermsText
  const hasCustomText = !!proposal?.terms_text
  const isOn = proposal?.show_terms !== false

  if (!effectiveText) return null

  const startEdit = () => {
    setDraft(proposal?.terms_text || orgTermsText || '')
    setEditing(true)
  }

  const handleSave = async () => {
    setSaving(true)
    await onSave(draft)
    setSaving(false)
    setEditing(false)
  }

  const resetToDefault = async () => {
    setSaving(true)
    await onSave(null)
    setSaving(false)
    setEditing(false)
  }

  return (
    <div className="bg-fp-card rounded-xl p-6 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-fp-text font-bold text-lg">Terms & Conditions</h3>
        {canEdit && (
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

      {editing ? (
        <div className="space-y-3">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={8}
            autoFocus
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
            {hasCustomText && orgTermsText && (
              <button onClick={resetToDefault} disabled={saving} className="text-fp-muted hover:text-fp-text text-xs transition-colors ml-auto">
                Reset to default
              </button>
            )}
          </div>
        </div>
      ) : (
        <div>
          <p className={`text-fp-muted text-sm leading-relaxed whitespace-pre-wrap ${!isOn ? 'opacity-40' : ''}`}>
            {effectiveText}
          </p>
          {hasCustomText && orgTermsText && (
            <p className="text-fp-muted text-xs mt-2 opacity-60">Custom — overrides org default</p>
          )}
        </div>
      )}
    </div>
  )
}
