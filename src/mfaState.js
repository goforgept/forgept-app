// Module-level flag so ProfileContext can pause session setting while Login handles MFA
export const mfaState = { pending: false, onClear: null }

export function clearMfaPending(session, applySession) {
  mfaState.pending = false
  if (mfaState.onClear) {
    mfaState.onClear(session)
    mfaState.onClear = null
  } else if (applySession) {
    applySession()
  }
}
