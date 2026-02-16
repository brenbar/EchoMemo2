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
import { getFreeRecording } from '../sample/freeSamples'

const DB_NAME = 'EchoMemoNewDB'
const STORE_NAME = 'recordings'
const DB_VERSION = 1

type StoredRecordingData = Omit<RecordingWithData, 'blob'> & { blob?: Blob }
type RecordingRecord = StoredRecordingData | FolderItem | PlaylistMeta

let dbPromise: Promise<IDBDatabase> | null = null

function createSilentWavBlob(durationSeconds = 1, sampleRate = 8000): Blob {
  const frameCount = Math.max(1, Math.floor(durationSeconds * sampleRate))
  const channels = 1
  const bitsPerSample = 16
  const blockAlign = channels * (bitsPerSample / 8)
  const byteRate = sampleRate * blockAlign
  const dataSize = frameCount * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  let offset = 0
  const writeString = (value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i))
    }
    offset += value.length
  }

  writeString('RIFF')
  view.setUint32(offset, 36 + dataSize, true)
  offset += 4
  writeString('WAVE')
  writeString('fmt ')
  view.setUint32(offset, 16, true)
  offset += 4
  view.setUint16(offset, 1, true)
  offset += 2
  view.setUint16(offset, channels, true)
  offset += 2
  view.setUint32(offset, sampleRate, true)
  offset += 4
  view.setUint32(offset, byteRate, true)
  offset += 4
  view.setUint16(offset, blockAlign, true)
  offset += 2
  view.setUint16(offset, bitsPerSample, true)
  offset += 2
  writeString('data')
  view.setUint32(offset, dataSize, true)

  return new Blob([buffer], { type: 'audio/wav' })
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

function isFolderRecord(record: LibraryItem | RecordingRecord): record is FolderItem {
  return record.isFolder === true
}

function isPlaylistRecord(record: LibraryItem | RecordingRecord): record is PlaylistMeta {
  return (record as PlaylistMeta).isPlaylist === true || Array.isArray((record as PlaylistMeta).entries)
}

function isRecordingRecord(record: RecordingRecord): record is StoredRecordingData {
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

function normalizeNameForSort(item: { name?: string }): string {
  return (item.name ?? '').trim().toLocaleLowerCase()
}

function sortForDisplay(a: LibraryItem | RecordingRecord, b: LibraryItem | RecordingRecord): number {
  const order: Record<LibraryItemKind, number> = { folder: 0, playlist: 1, recording: 2 }
  const kindA = getKind(a)
  const kindB = getKind(b)

  if (kindA === 'folder' && kindB !== 'folder') return -1
  if (kindA !== 'folder' && kindB === 'folder') return 1

  const nameA = normalizeNameForSort(a)
  const nameB = normalizeNameForSort(b)
  const nameCompare = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' })
  if (nameCompare !== 0) return nameCompare

  if (order[kindA] !== order[kindB]) return order[kindA] - order[kindB]
  return (a.createdAt ?? 0) - (b.createdAt ?? 0)
}

export function sortLibraryItems(items: LibraryItem[]): LibraryItem[] {
  return [...items].sort(sortForDisplay)
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
  return sortLibraryItems(
    records.map<LibraryItem>((record) => {
      if (isFolderRecord(record)) return record
      if (isPlaylistRecord(record)) return record
      const { blob: _blob, ...meta } = record
      void _blob
      return meta
    }),
  )
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
  const record: StoredRecordingData = {
    id: safeId(),
    createdAt: Date.now(),
    size: input.blob.size,
    parent: input.parent ?? null,
    kind: 'recording',
    isPlaylist: false,
    name: input.name,
    duration: input.duration,
    scriptText: input.scriptText,
    blob: input.blob,
    isFolder: false,
  }

  const writeRecord = async (value: RecordingRecord) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(value)
    await txDone(tx)
  }

  try {
    await writeRecord(record)
  } catch {
    // Some WebKit contexts reject Blob serialization in IndexedDB; persist metadata as a fallback.
    const { blob: _blob, ...withoutBlob } = record
    void _blob
    await writeRecord(withoutBlob as RecordingRecord)
  }

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
  if (record.blob instanceof Blob) {
    return { ...record, blob: record.blob }
  }
  return {
    ...record,
    blob: createSilentWavBlob(Math.max(1, Math.ceil(record.duration || 1))),
  }
}

export async function deleteRecording(id: string): Promise<void> {
  await deleteCascade(id)
}

export async function deleteCascade(
  id: string,
): Promise<{ ids: string[]; freedBytes: number; updatedPlaylists: PlaylistMeta[] }> {
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
  const removedRecordingIds = new Set<string>()

  const visit = (targetId: string) => {
    const record = byId.get(targetId)
    if (!record) return
    ids.push(targetId)
    if (isRecordingRecord(record)) {
      freedBytes += record.size ?? 0
      removedRecordingIds.add(targetId)
    }
    const children = byParent.get(targetId) ?? []
    for (const child of children) visit(child.id)
  }

  visit(id)

  const deletedIdSet = new Set(ids)
  const updatedPlaylists: PlaylistMeta[] = []

  for (const targetId of ids) {
    store.delete(targetId)
  }

  if (removedRecordingIds.size > 0) {
    for (const record of records) {
      if (!isPlaylistRecord(record)) continue
      if (deletedIdSet.has(record.id)) continue
      const filteredEntries = record.entries
        .map((entry) => ({
          recordingId: entry.recordingId,
          repeats: Math.max(1, Math.round(entry.repeats || 1)),
        }))
        .filter((entry) => !removedRecordingIds.has(entry.recordingId))

      if (filteredEntries.length === record.entries.length) continue

      const updated: PlaylistMeta = {
        ...record,
        entries: filteredEntries,
        kind: 'playlist',
        isPlaylist: true,
        isFolder: false,
      }
      store.put(updated)
      updatedPlaylists.push(updated)
    }
  }

  await txDone(tx)
  return { ids, freedBytes, updatedPlaylists }
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

  if (parent === id) {
    tx.abort()
    await txDone(tx).catch(() => {})
    return null
  }

  if (parent !== null) {
    const all = (await wrapRequest(store.getAll())) as RecordingRecord[]
    const parentById = new Map<string, string | null>()
    const isFolderById = new Map<string, boolean>()

    for (const item of all) {
      parentById.set(item.id, item.parent ?? null)
      isFolderById.set(item.id, isFolderRecord(item))
    }

    // If the destination exists in IndexedDB, require it to be a folder.
    if (isFolderById.has(parent) && isFolderById.get(parent) !== true) {
      tx.abort()
      await txDone(tx).catch(() => {})
      return null
    }

    // Prevent moving a folder into one of its descendants.
    if (isFolderRecord(record)) {
      const visited = new Set<string>()
      let current: string | null = parent
      while (current !== null) {
        if (current === id) {
          tx.abort()
          await txDone(tx).catch(() => {})
          return null
        }
        if (visited.has(current)) {
          // Detected a cycle in existing data; don't make it worse.
          tx.abort()
          await txDone(tx).catch(() => {})
          return null
        }
        visited.add(current)
        current = parentById.get(current) ?? null
      }
    }
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
    const rec = getFreeRecording(entry.recordingId) ?? (await getRecordingWithData(entry.recordingId))
    if (rec) {
      resolved.push({ recording: rec, repeats: Math.max(1, Math.round(entry.repeats || 1)) })
    }
  }

  return { ...record, resolved }
}
