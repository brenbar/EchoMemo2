import type { RecordingMeta, RecordingWithData } from '../types'

const DB_NAME = 'EchoMemoDB'
const STORE_NAME = 'recordings'
const DB_VERSION = 1

type RecordingRecord = RecordingWithData

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

export async function listRecordings(): Promise<RecordingMeta[]> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  const records = (await wrapRequest(store.getAll())) as RecordingRecord[]
  await txDone(tx)
  return records
    .map((record) => {
      const { blob: _blob, ...meta } = record
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
  const record = (await wrapRequest(tx.objectStore(STORE_NAME).get(id))) as RecordingRecord | undefined
  await txDone(tx)
  return record ?? null
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
