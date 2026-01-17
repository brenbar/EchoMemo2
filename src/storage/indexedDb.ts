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

const DB_NAME = 'EchoMemoDB'
const STORE_NAME = 'recordings'
const DB_VERSION = 1

type RecordingRecord = RecordingWithData | FolderItem | PlaylistMeta
type LegacyRecordingRecord = Partial<RecordingRecord> & {
  startTime?: number | string
  endTime?: number | string
}

let dbPromise: Promise<IDBDatabase> | null = null

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

function safeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `rec-${Date.now()}`
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function coalesceRecord(record: LegacyRecordingRecord): RecordingRecord {
  const id = record.id ?? record.name ?? safeId()
  const createdAt = toNumber(record.createdAt) ?? Date.now()
  const parent = typeof record.parent === 'string' ? record.parent : null

  const kind: LibraryItemKind = record.kind
    ? (record.kind as LibraryItemKind)
    : record.isFolder
      ? 'folder'
      : record.isPlaylist
        ? 'playlist'
        : 'recording'

  if (kind === 'folder' || record.isFolder) {
    return {
      id,
      name: record.name ?? 'Folder',
      createdAt,
      parent,
      kind: 'folder',
      isFolder: true,
    }
  }

  if (kind === 'playlist' || record.isPlaylist) {
    const entries = Array.isArray(record.entries)
      ? record.entries
          .map((entry) => {
            if (!entry || typeof entry !== 'object') return null
            const recordingId = typeof entry.recordingId === 'string' ? entry.recordingId : null
            const repeats = toNumber((entry as PlaylistEntry).repeats) ?? 1
            if (!recordingId) return null
            return { recordingId, repeats: Math.max(1, repeats) }
          })
          .filter(Boolean)
      : []

    return {
      id,
      name: record.name ?? 'Playlist',
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

  const durationValue = toNumber(record.duration)
  const start = toNumber(record.startTime)
  const end = toNumber(record.endTime)
  const sizeValue = toNumber(record.size)

  if ((durationValue === null || durationValue === 0) && start !== null && end !== null) {
    normalized.duration = Math.max(0, end - start)
  } else if (durationValue !== null) {
    normalized.duration = durationValue
  }

  if (sizeValue !== null) {
    normalized.size = sizeValue
  } else if (record.blob instanceof Blob) {
    normalized.size = record.blob.size
  } else if (normalized.size === undefined) {
    normalized.size = 0
  }

  return normalized
}

function filterByParent(records: RecordingRecord[], parent: string | null): RecordingRecord[] {
  return records.filter((record) => (record.parent ?? null) === (parent ?? null))
}

function getKind(item: RecordingRecord): LibraryItemKind {
  if (item.kind) return item.kind
  if (item.isFolder) return 'folder'
  if ((item as PlaylistMeta).isPlaylist) return 'playlist'
  return 'recording'
}

function sortForDisplay(a: RecordingRecord, b: RecordingRecord): number {
  const order: Record<LibraryItemKind, number> = { folder: 0, playlist: 1, recording: 2 }
  const kindA = getKind(a)
  const kindB = getKind(b)
  if (order[kindA] !== order[kindB]) return order[kindA] - order[kindB]
  return (b.createdAt ?? 0) - (a.createdAt ?? 0)
}

export async function listRecordings(parentId: string | null = null): Promise<LibraryItem[]> {
  const all = await listAllItems()
  return filterByParent(all, parentId).filter((item) => getKind(item as RecordingRecord) === 'recording')
}

export async function listAllItems(): Promise<LibraryItem[]> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  const records = (await wrapRequest(store.getAll())) as LegacyRecordingRecord[]
  await txDone(tx)
  return records
    .map((record) => coalesceRecord(record))
    .map((record) => {
      if (record.isFolder) return record
      if ((record as PlaylistMeta).kind === 'playlist' || (record as PlaylistMeta).isPlaylist) return record
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

export async function getRecordingWithData(id: string): Promise<RecordingWithData | null> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)

  // Old databases sometimes used numeric keys; new ones use string UUIDs. If the
  // string id lookup misses, fall back to a numeric key so legacy entries load.
  const candidateKeys: (string | number)[] = [id]
  const numericId = toNumber(id)
  if (numericId !== null) candidateKeys.push(numericId)

  let record: LegacyRecordingRecord | undefined
  for (const key of candidateKeys) {
    record = (await wrapRequest(store.get(key))) as LegacyRecordingRecord | undefined
    if (record) break
  }

  await txDone(tx)
  if (!record) return null
  const normalized = coalesceRecord(record)
  if (normalized.isFolder || (normalized as PlaylistMeta).isPlaylist) return null
  return normalized
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).delete(id)
  await txDone(tx)
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
  if (record.isFolder || (record as PlaylistMeta).isPlaylist) return record
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
  if (record.isFolder || (record as PlaylistMeta).isPlaylist) return record
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
        if (getKind(value) === 'recording') {
          total += value?.size ?? 0
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
  if (!record) return null
  const normalized = coalesceRecord(record)
  if (!('entries' in normalized)) return null

  const resolved: PlaylistWithData['resolved'] = []
  for (const entry of normalized.entries) {
    const rec = await getRecordingWithData(entry.recordingId)
    if (rec) {
      resolved.push({ recording: rec, repeats: Math.max(1, Math.round(entry.repeats || 1)) })
    }
  }

  return { ...(normalized as PlaylistMeta), resolved }
}
