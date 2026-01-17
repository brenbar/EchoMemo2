import type {
  FolderItem,
  LibraryItem,
  LibraryItemKind,
  PlaylistEntry,
  PlaylistMeta,
  PlaylistWithData,
  RecordingMeta,
  RecordingWithData,
} from '../types'

const DB_NAME = 'EchoMemoNewDB'
const LEGACY_DB_NAME = 'EchoMemoDB'
const LEGACY_MIGRATION_KEY = '__echoMemoLegacyMigrated'
const STORE_NAME = 'recordings'
const DB_VERSION = 1

type RecordingRecord = RecordingWithData | FolderItem | PlaylistMeta
type LegacyRecordingRecord = Partial<RecordingWithData> &
  Partial<PlaylistMeta> &
  Partial<FolderItem> & {
    startTime?: number | string
    endTime?: number | string
  }

let dbPromise: Promise<IDBDatabase> | null = null

export function hasHandledLegacyMigration(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(LEGACY_MIGRATION_KEY) === 'true'
  } catch {
    return false
  }
}

export function markLegacyMigrationHandled(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(LEGACY_MIGRATION_KEY, 'true')
  } catch {
    // Ignore storage errors, this flag is just a UX hint.
  }
}

function wrapRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
  })
}

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment'))
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
  })

  return dbPromise
}

function safeId(prefix = 'rec') {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}`
}

function normalizeId(value: unknown, fallbackName?: string): string {
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof fallbackName === 'string' && fallbackName.trim()) return fallbackName
  return safeId()
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeLegacyRecord(record: LegacyRecordingRecord): RecordingRecord {
  const legacy = record as LegacyRecordingRecord
  const id = normalizeId(legacy.id ?? legacy.name, legacy.name)
  const createdAt = toNumber(legacy.createdAt) ?? Date.now()
  const parent =
    typeof legacy.parent === 'string' || typeof legacy.parent === 'number' ? String(legacy.parent) : null

  const kind: LibraryItemKind = legacy.kind
    ? (legacy.kind as LibraryItemKind)
    : legacy.isFolder
      ? 'folder'
      : legacy.isPlaylist
        ? 'playlist'
        : 'recording'

  if (kind === 'folder' || legacy.isFolder) {
    return {
      id,
      name: legacy.name ?? 'Folder',
      createdAt,
      parent,
      kind: 'folder',
      isFolder: true,
    }
  }

  if (kind === 'playlist' || legacy.isPlaylist) {
    const entries = Array.isArray(legacy.entries)
      ? legacy.entries
          .map((entry: PlaylistEntry | null | undefined) => {
            if (!entry || typeof entry !== 'object') return null
            const recordingIdRaw = (entry as PlaylistEntry).recordingId
            const hasRecordingId =
              typeof recordingIdRaw === 'string' || typeof recordingIdRaw === 'number'
            if (!hasRecordingId) return null
            const recordingId = normalizeId(recordingIdRaw)
            const repeats = toNumber(entry.repeats) ?? 1
            return { recordingId, repeats: Math.max(1, repeats) }
          })
          .filter(Boolean)
      : []

    return {
      id,
      name: legacy.name ?? 'Playlist',
      createdAt,
      parent,
      kind: 'playlist',
      isPlaylist: true,
      isFolder: false,
      entries: entries as PlaylistEntry[],
    }
  }

  const normalized: RecordingWithData = {
    ...(record as RecordingWithData),
    id,
    createdAt,
    parent,
    kind: 'recording',
    isPlaylist: false,
    isFolder: false,
  }

  const durationValue = toNumber(legacy.duration)
  const start = toNumber(legacy.startTime)
  const end = toNumber(legacy.endTime)
  const sizeValue = toNumber(legacy.size)

  if ((durationValue === null || durationValue === 0) && start !== null && end !== null) {
    normalized.duration = Math.max(0, end - start)
  } else if (durationValue !== null) {
    normalized.duration = durationValue
  }

  if (sizeValue !== null) {
    normalized.size = sizeValue
  } else if (legacy.blob instanceof Blob) {
    normalized.size = legacy.blob.size
  } else if (normalized.size === undefined) {
    normalized.size = 0
  }

  return normalized
}

function isFolderRecord(record: LibraryItem | RecordingRecord): record is FolderItem {
  return record.isFolder === true
}

function isPlaylistRecord(record: LibraryItem | RecordingRecord): record is PlaylistMeta {
  return (record as PlaylistMeta).isPlaylist === true || Array.isArray((record as PlaylistMeta).entries)
}

function isRecordingRecord(record: RecordingRecord): record is RecordingWithData {
  return !isFolderRecord(record) && !isPlaylistRecord(record)
}

function filterByParent<T extends { parent?: string | null }>(records: T[], parent: string | null): T[] {
  return records.filter((record) => (record.parent ?? null) === (parent ?? null))
}

function getKind(item: LibraryItem | RecordingRecord): LibraryItemKind {
  if (item.kind) return item.kind
  if (isFolderRecord(item)) return 'folder'
  if (isPlaylistRecord(item)) return 'playlist'
  return 'recording'
}

function sortForDisplay(a: LibraryItem | RecordingRecord, b: LibraryItem | RecordingRecord): number {
  const order: Record<LibraryItemKind, number> = { folder: 0, playlist: 1, recording: 2 }
  const kindA = getKind(a)
  const kindB = getKind(b)
  if (order[kindA] !== order[kindB]) return order[kindA] - order[kindB]
  return (b.createdAt ?? 0) - (a.createdAt ?? 0)
}

export async function listRecordings(parentId: string | null = null): Promise<LibraryItem[]> {
  const all = await listAllItems()
  return filterByParent(all, parentId).filter((item) => getKind(item) === 'recording')
}

export async function listAllItems(): Promise<LibraryItem[]> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  const records = (await wrapRequest(store.getAll())) as RecordingRecord[]
  await txDone(tx)
  return records
    .map<LibraryItem>((record) => {
      if (isFolderRecord(record)) return record
      if (isPlaylistRecord(record)) return record
      const { blob: _blob, ...meta } = record
      void _blob
      return meta
    })
    .sort(sortForDisplay)
}

export async function listFolders(parentId: string | null = null): Promise<FolderItem[]> {
  const items = await listAllItems()
  return filterByParent(items, parentId).filter((item): item is FolderItem => item.isFolder === true)
}

export async function saveRecording(input: {
  name: string
  duration: number
  blob: Blob
  scriptText: string
  parent?: string | null
}): Promise<RecordingMeta> {
  const db = await getDb()
  const record: RecordingRecord = {
    id: safeId(),
    createdAt: Date.now(),
    size: input.blob.size,
    parent: input.parent ?? null,
    kind: 'recording',
    isPlaylist: false,
    ...input,
    isFolder: false,
  }
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).put(record)
  await txDone(tx)
  const { blob: _blob, ...meta } = record
  void _blob
  return meta
}

export async function saveFolder(input: { name: string; parent?: string | null }): Promise<FolderItem> {
  const db = await getDb()
  const record: FolderItem = {
    id: safeId(),
    name: input.name,
    createdAt: Date.now(),
    parent: input.parent ?? null,
    kind: 'folder',
    isFolder: true,
  }
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).put(record)
  await txDone(tx)
  return record
}

export async function savePlaylist(input: { name: string; parent?: string | null; entries: PlaylistEntry[] }): Promise<PlaylistMeta> {
  const db = await getDb()
  const sanitizedEntries = input.entries.map((entry) => ({
    recordingId: entry.recordingId,
    repeats: Math.max(1, Math.round(entry.repeats || 1)),
  }))
  const record: PlaylistMeta = {
    id: safeId(),
    name: input.name,
    createdAt: Date.now(),
    parent: input.parent ?? null,
    kind: 'playlist',
    isPlaylist: true,
    entries: sanitizedEntries,
  }
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).put(record)
  await txDone(tx)
  return record
}

export async function updatePlaylist(input: {
  id: string
  name: string
  parent?: string | null
  entries: PlaylistEntry[]
}): Promise<PlaylistMeta | null> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  const existing = (await wrapRequest(store.get(input.id))) as RecordingRecord | undefined

  if (!existing || !isPlaylistRecord(existing)) {
    tx.abort()
    await txDone(tx).catch(() => {})
    return null
  }

  const sanitizedEntries = input.entries.map((entry) => ({
    recordingId: entry.recordingId,
    repeats: Math.max(1, Math.round(entry.repeats || 1)),
  }))

  const updated: PlaylistMeta = {
    ...existing,
    name: input.name,
    parent: input.parent ?? existing.parent ?? null,
    kind: 'playlist',
    isPlaylist: true,
    isFolder: false,
    entries: sanitizedEntries,
  }

  store.put(updated)
  await txDone(tx)
  return updated
}

export async function getRecordingWithData(id: string): Promise<RecordingWithData | null> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)

  const record = (await wrapRequest(store.get(id))) as RecordingRecord | undefined

  await txDone(tx)
  if (!record || !isRecordingRecord(record)) return null
  return record
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).delete(id)
  await txDone(tx)
}

export async function deleteCascade(
  id: string,
): Promise<{ ids: string[]; freedBytes: number }> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)

  const records = (await wrapRequest(store.getAll())) as RecordingRecord[]
  const byParent = new Map<string | null, RecordingRecord[]>()
  const byId = new Map<string, RecordingRecord>()

  for (const record of records) {
    const parentKey = record.parent ?? null
    const siblings = byParent.get(parentKey) ?? []
    siblings.push(record)
    byParent.set(parentKey, siblings)
    byId.set(record.id, record)
  }

  const ids: string[] = []
  let freedBytes = 0

  const visit = (targetId: string) => {
    const record = byId.get(targetId)
    if (!record) return
    ids.push(targetId)
    if (isRecordingRecord(record)) {
      freedBytes += record.size ?? 0
    }
    const children = byParent.get(targetId) ?? []
    for (const child of children) visit(child.id)
  }

  visit(id)

  for (const targetId of ids) {
    store.delete(targetId)
  }

  await txDone(tx)
  return { ids, freedBytes }
}

export async function renameRecording(id: string, name: string): Promise<LibraryItem | null> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  const record = (await wrapRequest(store.get(id))) as RecordingRecord | undefined
  if (!record) {
    tx.abort()
    await txDone(tx).catch(() => {})
    return null
  }
  record.name = name
  store.put(record)
  await txDone(tx)
  if (isFolderRecord(record) || isPlaylistRecord(record)) return record
  const { blob: _blob, ...meta } = record
  void _blob
  return meta
}

export async function updateParent(id: string, parent: string | null): Promise<LibraryItem | null> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  const record = (await wrapRequest(store.get(id))) as RecordingRecord | undefined
  if (!record) {
    tx.abort()
    await txDone(tx).catch(() => {})
    return null
  }
  record.parent = parent
  store.put(record)
  await txDone(tx)
  if (isFolderRecord(record) || isPlaylistRecord(record)) return record
  const { blob: _blob, ...meta } = record
  void _blob
  return meta
}

export async function getTotalSize(): Promise<number> {
  const db = await getDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const cursorRequest = store.openCursor()
    let total = 0

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (cursor) {
        const value = cursor.value as RecordingRecord
        if (isRecordingRecord(value)) {
          total += value.size ?? 0
        }
        cursor.continue()
      } else {
        resolve(total)
      }
    }

    cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error('Failed to read total size'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
  })
}

export async function getPlaylistWithData(id: string): Promise<PlaylistWithData | null> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  const record = (await wrapRequest(store.get(id))) as RecordingRecord | undefined
  await txDone(tx)
  if (!record || !isPlaylistRecord(record)) return null

  const resolved: PlaylistWithData['resolved'] = []
  for (const entry of record.entries) {
    const rec = await getRecordingWithData(entry.recordingId)
    if (rec) {
      resolved.push({ recording: rec, repeats: Math.max(1, Math.round(entry.repeats || 1)) })
    }
  }

  return { ...record, resolved }
}

async function openLegacyDbIfPresent(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null

  const databases = (indexedDB as any).databases ? await (indexedDB as any).databases() : null
  if (Array.isArray(databases)) {
    const found = databases.some((db: { name?: string }) => db?.name === LEGACY_DB_NAME)
    if (!found) return null
  }

  return new Promise((resolve) => {
    let created = false
    const request = indexedDB.open(LEGACY_DB_NAME)
    request.onupgradeneeded = () => {
      created = true
      request.transaction?.abort()
    }
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
    request.onsuccess = () => {
      if (created) {
        request.result.close()
        resolve(null)
        return
      }
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.close()
        resolve(null)
        return
      }
      resolve(db)
    }
  })
}

async function readLegacyRecords(): Promise<RecordingRecord[]> {
  const legacyDb = await openLegacyDbIfPresent()
  if (!legacyDb) return []

  const tx = legacyDb.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  try {
    const records = (await wrapRequest(store.getAll())) as LegacyRecordingRecord[]
    await txDone(tx)
    return records.map((record) => normalizeLegacyRecord(record))
  } finally {
    legacyDb.close()
  }
}

export async function hasLegacyData(): Promise<boolean> {
  if (hasHandledLegacyMigration()) return false

  const legacyDb = await openLegacyDbIfPresent()
  if (!legacyDb) return false

  return new Promise((resolve) => {
    const tx = legacyDb.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const countRequest = store.count()

    countRequest.onsuccess = () => {
      resolve((countRequest.result ?? 0) > 0)
    }
    countRequest.onerror = () => {
      legacyDb.close()
      resolve(false)
    }
    tx.onabort = () => {
      legacyDb.close()
      resolve(false)
    }
    tx.onerror = () => {
      legacyDb.close()
      resolve(false)
    }
    tx.oncomplete = () => legacyDb.close()
  })
}

export async function importLegacyData(): Promise<number> {
  const legacyRecords = await readLegacyRecords()
  if (legacyRecords.length === 0) return 0

  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)

  let imported = 0
  for (const record of legacyRecords) {
    const existing = (await wrapRequest(store.get(record.id))) as RecordingRecord | undefined
    if (existing) continue
    store.put(record)
    imported += 1
  }

  await txDone(tx)
  markLegacyMigrationHandled()
  return imported
}
