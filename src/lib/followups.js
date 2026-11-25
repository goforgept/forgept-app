import { supabase } from '../supabase'

/** Call the followup-action function. Resolves { followup, proposal }; throws Error with a readable message. */
export async function followupAction(token, action = 'get', extra = {}) {
  const { data, error } = await supabase.functions.invoke('followup-action', { body: { token, action, ...extra } })
  if (error) {
    let msg = 'Something went wrong. Please try again.'
    try { msg = (await error.context.json()).error || msg } catch { /* not JSON */ }
    throw new Error(msg)
  }
  return data
}

export const SKIP_REASONS = ['Talked to them recently', 'Deal is on hold', 'Waiting on the client', 'Sending my own email']

export const STATUS_STYLE = {
  scheduled: { label: 'Scheduled', cls: 'bg-blue-500/15 text-blue-400' },
  sending:   { label: 'Sending', cls: 'bg-blue-500/15 text-blue-400' },
  sent:      { label: 'Sent', cls: 'bg-green-500/15 text-green-400' },
  skipped:   { label: 'Skipped', cls: 'bg-fp-inset text-fp-muted' },
  cancelled: { label: 'Not sent', cls: 'bg-fp-inset text-fp-muted' },
  failed:    { label: 'Failed', cls: 'bg-red-500/15 text-red-400' },
}

export const STEP_LABEL = { early: 'First check-in', '14day': 'Check-in', '7day': 'One week out', close: 'Close day' }

export const longDate = (ymd) => ymd
  ? new Date(ymd + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  : ''
