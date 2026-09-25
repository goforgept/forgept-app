/**
 * useOfflineSync
 *
 * Manages the offline ↔ online sync lifecycle for the Designer.
 * Handles:
 *   - Detecting reconnect and triggering a queue flush
 *   - Exposing pending op count for the UI badge
 *   - Calling back to Designer so it can reload after sync
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabase'
import { flushQueue, getPendingCount } from './designerOffline'

export function useOfflineSync(proposalId, { onSyncComplete } = {}) {
  const [pendingCount, setPendingCount] = useState(0)
  const [isSyncing,    setIsSyncing]    = useState(false)
  const [syncError,    setSyncError]    = useState(null)
  const wasOfflineRef  = useRef(!navigator.onLine)

  // Refresh pending count whenever it might have changed
  const refreshCount = useCallback(async () => {
    if (!proposalId) return
    setPendingCount(await getPendingCount(proposalId))
  }, [proposalId])

  // Run the queue flush
  const flush = useCallback(async () => {
    if (!proposalId || isSyncing) return
    setIsSyncing(true)
    setSyncError(null)
    try {
      const { uploadToR2 } = await import('../r2')
      const result = await flushQueue(proposalId, { supabase, uploadToR2 })
      await refreshCount()
      onSyncComplete?.(result)
    } catch (err) {
      console.error('[offline] Flush failed:', err)
      setSyncError(err?.message ?? 'Sync failed')
    } finally {
      setIsSyncing(false)
    }
  }, [proposalId, isSyncing, refreshCount, onSyncComplete])

  // Watch online/offline transitions
  useEffect(() => {
    const handleOnline = () => {
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false
        flush()
      }
    }
    const handleOffline = () => { wasOfflineRef.current = true }

    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [flush])

  // Refresh count on mount and whenever proposalId changes
  useEffect(() => { refreshCount() }, [refreshCount])

  return { pendingCount, isSyncing, syncError, flush, refreshCount }
}
