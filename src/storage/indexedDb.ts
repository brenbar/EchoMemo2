import { openDB, type IDBPDatabase } from 'idb'
import type { RecordingMeta, RecordingWithData } from '../types'

const DB_NAME = 'echo-memo-db'
const STORE_NAME = 'recordings'
const DB_VERSION = 1

interface RecordingRecord extends RecordingWithData {}

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

function safeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `rec-${Date.now()}`
}

export async function listRecordings(): Promise<RecordingMeta[]> {
  const db = await getDb()
  const records = (await db.getAll(STORE_NAME)) as RecordingRecord[]
  return records
    .map(({ blob, ...meta }) => meta)
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
  await db.put(STORE_NAME, record)
  const { blob, ...meta } = record
  return meta
}

export async function getRecordingWithData(id: string): Promise<RecordingWithData | null> {
  const db = await getDb()
  const record = (await db.get(STORE_NAME, id)) as RecordingRecord | undefined
  return record ?? null
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_NAME, id)
}

export async function renameRecording(id: string, name: string): Promise<RecordingMeta | null> {
  const db = await getDb()
  const record = (await db.get(STORE_NAME, id)) as RecordingRecord | undefined
  if (!record) return null
  record.name = name
  await db.put(STORE_NAME, record)
  const { blob, ...meta } = record
  return meta
}

export async function getTotalSize(): Promise<number> {
  const db = await getDb()
  const records = (await db.getAllKeys(STORE_NAME)) as string[]
  if (!records.length) return 0
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  let total = 0
  for (const id of records) {
    const record = (await store.get(id)) as RecordingRecord | undefined
    if (record) total += record.size
  }
  await tx.done
  return total
}
