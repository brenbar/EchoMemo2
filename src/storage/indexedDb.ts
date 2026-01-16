import type { RecordingMeta, RecordingWithData } from '../types'

const DB_NAME = 'EchoMemoDB'
const STORE_NAME = 'recordings'
const DB_VERSION = 1

type RecordingRecord = RecordingWithData
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
  const normalized: RecordingRecord = { ...(record as RecordingRecord) }

  if (!normalized.id) {
    normalized.id = record.name ?? safeId()
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

export async function listRecordings(): Promise<RecordingMeta[]> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  const records = (await wrapRequest(store.getAll())) as LegacyRecordingRecord[]
  await txDone(tx)
  return records
    .map((record) => {
      const { blob: _blob, ...meta } = coalesceRecord(record)
      void _blob
      return meta
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function saveRecording(input: {
  name: string
  duration: number
  blob: Blob
  scriptText: string
}): Promise<RecordingMeta> {
  const db = await getDb()
  const record: RecordingRecord = {
    id: safeId(),
    createdAt: Date.now(),
    size: input.blob.size,
    ...input,
  }
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).put(record)
  await txDone(tx)
  const { blob: _blob, ...meta } = record
  void _blob
  return meta
}

export async function getRecordingWithData(id: string): Promise<RecordingWithData | null> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const record = (await wrapRequest(tx.objectStore(STORE_NAME).get(id))) as LegacyRecordingRecord | undefined
  await txDone(tx)
  return record ? coalesceRecord(record) : null
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).delete(id)
  await txDone(tx)
}

export async function renameRecording(id: string, name: string): Promise<RecordingMeta | null> {
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
        total += value?.size ?? 0
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
