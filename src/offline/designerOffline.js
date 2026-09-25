/**
 * Designer offline storage layer.
 *
 * Pure IndexedDB utilities — no React, no side-effects beyond the DB itself.
 * All async functions are safe to call on web and in Capacitor; IDB is
 * available in both environments.
 *
 * IDB schema (v1)
 * ───────────────
 *  image_cache      { storagePath, data: ArrayBuffer, cachedAt }
 *  proposal_cache   { proposalId, proposal, sheets, orgId, org, cachedAt }
 *  placements_cache { sheetId, placements: [], cachedAt }
 *  queue            { id, proposalId, type, payload, status, createdAt }
 *  pending_files    { id, data: ArrayBuffer }
 *
 * Queue op types
 * ──────────────
 *  upload_sheet     — a file queued for R2 upload + sheet insert
 *  insert_placement — a device placement pending insert
 *  delete_placement — a real-DB placement pending delete
 *  update_placement — a real-DB placement position/rotation change
 */

const DB_NAME    = 'forgept_designer_v1'
const DB_VERSION = 1

let _db = null

async function openDB() {
  if (_db) return _db
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('image_cache'))
        db.createObjectStore('image_cache', { keyPath: 'storagePath' })
      if (!db.objectStoreNames.contains('proposal_cache'))
        db.createObjectStore('proposal_cache', { keyPath: 'proposalId' })
      if (!db.objectStoreNames.contains('placements_cache'))
        db.createObjectStore('placements_cache', { keyPath: 'sheetId' })
      if (!db.objectStoreNames.contains('queue'))
        db.createObjectStore('queue', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('pending_files'))
        db.createObjectStore('pending_files', { keyPath: 'id' })
    }

    req.onsuccess  = e => { _db = e.target.result; resolve(_db) }
    req.onerror    = e => reject(e.target.error)
  })
}

// ── Low-level helpers ──────────────────────────────────────────────────────────

async function put(store, value) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(value)
    tx.oncomplete = () => resolve()
    tx.onerror    = e => reject(e.target.error)
  })
}

async function get(store, key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror   = e => reject(e.target.error)
  })
}

async function getAll(store) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result ?? [])
    req.onerror   = e => reject(e.target.error)
  })
}

async function remove(store, key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror    = e => reject(e.target.error)
  })
}

// ── Image cache ────────────────────────────────────────────────────────────────

export async function cacheSheetImage(storagePath, data) {
  if (!storagePath || ['blank', 'pending'].includes(storagePath)) return
  try { await put('image_cache', { storagePath, data, cachedAt: Date.now() }) }
  catch (e) { console.warn('[offline] cacheSheetImage:', e) }
}

export async function getCachedSheetImage(storagePath) {
  if (!storagePath || ['blank', 'pending'].includes(storagePath)) return null
  try { return (await get('image_cache', storagePath))?.data ?? null }
  catch { return null }
}

// ── Proposal cache ─────────────────────────────────────────────────────────────

export async function cacheProposalData(proposalId, data) {
  try { await put('proposal_cache', { proposalId, ...data, cachedAt: Date.now() }) }
  catch (e) { console.warn('[offline] cacheProposalData:', e) }
}

export async function getCachedProposalData(proposalId) {
  try { return await get('proposal_cache', proposalId) }
  catch { return null }
}

// ── Placements cache ───────────────────────────────────────────────────────────

export async function cachePlacementsForSheet(sheetId, placements) {
  try { await put('placements_cache', { sheetId, placements, cachedAt: Date.now() }) }
  catch (e) { console.warn('[offline] cachePlacementsForSheet:', e) }
}

export async function getCachedPlacementsForSheet(sheetId) {
  try { return (await get('placements_cache', sheetId))?.placements ?? null }
  catch { return null }
}

// ── Queue ──────────────────────────────────────────────────────────────────────

export async function enqueueOp(proposalId, op) {
  const item = { id: crypto.randomUUID(), proposalId, ...op, status: 'pending', createdAt: Date.now() }
  try { await put('queue', item) }
  catch (e) { console.warn('[offline] enqueueOp:', e) }
  return item
}

/** Cancel a queued insert_placement by its localId (e.g. user deleted it offline). */
export async function cancelOp(proposalId, localId) {
  try {
    const all = await getAll('queue')
    for (const item of all) {
      if (item.proposalId === proposalId && item.status === 'pending' && item.payload?.localId === localId) {
        await put('queue', { ...item, status: 'cancelled' })
      }
    }
  } catch (e) { console.warn('[offline] cancelOp:', e) }
}

/** Update the payload of a queued insert_placement (e.g. user moved it offline). */
export async function updateQueuedOp(proposalId, localId, payloadPatch) {
  try {
    const all = await getAll('queue')
    for (const item of all) {
      if (item.proposalId === proposalId && item.status === 'pending' && item.payload?.localId === localId) {
        await put('queue', { ...item, payload: { ...item.payload, ...payloadPatch } })
      }
    }
  } catch (e) { console.warn('[offline] updateQueuedOp:', e) }
}

export async function getPendingOps(proposalId) {
  try {
    const all = await getAll('queue')
    return all
      .filter(r => r.proposalId === proposalId && r.status === 'pending')
      .sort((a, b) => a.createdAt - b.createdAt)
  } catch { return [] }
}

export async function getPendingCount(proposalId) {
  return (await getPendingOps(proposalId)).length
}

/** Reconstruct pending placement objects for a given sheet so they render in the canvas. */
export async function getPendingPlacements(sheetId, proposalId) {
  const ops = await getPendingOps(proposalId)
  return ops
    .filter(op => op.type === 'insert_placement' && op.payload.sheetLocalId === sheetId)
    .map(op => ({
      ...op.payload.data,
      id:              op.payload.localId,
      _pending:        true,
      global_products: op.payload.symbolData,
    }))
}

// ── Pending files ──────────────────────────────────────────────────────────────

export async function storePendingFile(fileId, data) {
  try { await put('pending_files', { id: fileId, data }) }
  catch (e) { console.warn('[offline] storePendingFile:', e) }
}

export async function getPendingFile(fileId) {
  try { return (await get('pending_files', fileId))?.data ?? null }
  catch { return null }
}

async function deletePendingFile(fileId) {
  try { await remove('pending_files', fileId) }
  catch (e) { console.warn('[offline] deletePendingFile:', e) }
}

// ── Internal queue helpers ─────────────────────────────────────────────────────

async function markDone(id) {
  try {
    const item = await get('queue', id)
    if (item) await put('queue', { ...item, status: 'done' })
  } catch (e) { console.warn('[offline] markDone:', e) }
}

async function markError(id, err) {
  try {
    const item = await get('queue', id)
    if (item) await put('queue', { ...item, status: 'error', error: String(err) })
  } catch (e) { console.warn('[offline] markError:', e) }
}

// ── Flush queue (sync) ─────────────────────────────────────────────────────────

/**
 * Process all pending ops for a proposal in order.
 *
 * Returns { synced, errors, newSheets, idMap }
 *   idMap — maps every offline localId to its real Supabase ID so callers
 *           can update local React state if needed.
 */
export async function flushQueue(proposalId, { supabase, uploadToR2 }) {
  const ops    = await getPendingOps(proposalId)
  if (!ops.length) return { synced: 0, errors: 0, newSheets: [], idMap: {} }

  const idMap     = {}   // localId → real Supabase ID
  let synced      = 0
  let errors      = 0
  const newSheets = []

  for (const op of ops) {
    try {
      switch (op.type) {

        case 'upload_sheet': {
          const { localId, orgId, name, fileId, contentType, ext, pageNumber, sortOrder } = op.payload
          const fileData = await getPendingFile(fileId)
          if (!fileData) throw new Error('Pending file not found in local storage')

          const storagePath = `${orgId}/${proposalId}/${fileId}.${ext}`
          const blob        = new Blob([fileData], { type: contentType })
          await uploadToR2(storagePath, blob, contentType)

          const { data: sheet, error } = await supabase
            .from('drawing_sheets')
            .insert({ org_id: orgId, proposal_id: proposalId, name, storage_path: storagePath, page_number: pageNumber, sort_order: sortOrder, last_activity_at: new Date().toISOString() })
            .select().single()
          if (error) throw error

          idMap[localId] = sheet.id
          newSheets.push(sheet)
          await cacheSheetImage(storagePath, fileData)
          await deletePendingFile(fileId)
          await markDone(op.id)
          synced++
          break
        }

        case 'insert_placement': {
          const { localId, sheetLocalId, data } = op.payload
          const realSheetId = idMap[sheetLocalId] ?? sheetLocalId

          if (typeof realSheetId === 'string' && realSheetId.startsWith('OFFLINE_')) {
            // Parent sheet hasn't synced yet — should not happen if ops are ordered
            throw new Error(`Parent sheet ${sheetLocalId} not yet synced`)
          }

          const { data: placement, error } = await supabase
            .from('drawing_placements')
            .insert({ ...data, drawing_sheet_id: realSheetId })
            .select('*, global_products(id, name, part_number, manufacturer, category, industry, specs, accessories, description)')
            .single()
          if (error) throw error

          idMap[localId] = placement.id
          await markDone(op.id)
          synced++
          break
        }

        case 'delete_placement': {
          const { id } = op.payload
          await supabase.from('drawing_placements').delete().eq('id', id)
          await markDone(op.id)
          synced++
          break
        }

        case 'update_placement': {
          const { id, changes } = op.payload
          await supabase.from('drawing_placements').update(changes).eq('id', id)
          await markDone(op.id)
          synced++
          break
        }

        default:
          await markDone(op.id)
      }
    } catch (err) {
      console.error('[offline] Sync error:', op.type, err)
      await markError(op.id, err?.message ?? String(err))
      errors++
    }
  }

  return { synced, errors, newSheets, idMap }
}
