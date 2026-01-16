import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { RecordingMeta, RecordingWithData } from '../types'
import {
  deleteRecording,
  getRecordingWithData,
  getTotalSize,
  listRecordings,
  renameRecording,
  saveRecording,
} from '../storage/indexedDb'

interface RecordingsContextValue {
  recordings: RecordingMeta[]
  totalBytes: number
  loading: boolean
  refresh(): Promise<void>
  addRecording(input: { name: string; duration: number; blob: Blob; scriptText: string }): Promise<void>
  removeRecording(id: string): Promise<void>
  updateName(id: string, name: string): Promise<void>
  fetchRecording(id: string): Promise<RecordingWithData | null>
}

const RecordingsContext = createContext<RecordingsContextValue | undefined>(undefined)

export function RecordingsProvider({ children }: { children: ReactNode }) {
  const [recordings, setRecordings] = useState<RecordingMeta[]>([])
  const [totalBytes, setTotalBytes] = useState(0)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    const [items, total] = await Promise.all([listRecordings(), getTotalSize()])
    setRecordings(items)
    setTotalBytes(total)
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [])

  const addRecording = async (input: {
    name: string
    duration: number
    blob: Blob
    scriptText: string
  }) => {
    const meta = await saveRecording(input)
    setRecordings((prev) => [meta, ...prev])
    setTotalBytes((prev) => prev + meta.size)
  }

  const removeRecording = async (id: string) => {
    const current = recordings.find((item) => item.id === id)
    await deleteRecording(id)
    setRecordings((prev) => prev.filter((item) => item.id !== id))
    if (current) setTotalBytes((prev) => Math.max(0, prev - current.size))
  }

  const updateName = async (id: string, name: string) => {
    const updated = await renameRecording(id, name)
    if (!updated) return
    setRecordings((prev) => prev.map((item) => (item.id === id ? updated : item)))
  }

  const fetchRecording = (id: string) => getRecordingWithData(id)

  const value = useMemo(
    () => ({ recordings, totalBytes, loading, refresh, addRecording, removeRecording, updateName, fetchRecording }),
    [recordings, totalBytes, loading],
  )

  return <RecordingsContext.Provider value={value}>{children}</RecordingsContext.Provider>
}

export function useRecordings() {
  const ctx = useContext(RecordingsContext)
  if (!ctx) {
    throw new Error('useRecordings must be used inside RecordingsProvider')
  }
  return ctx
}
