import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { LibraryItem, RecordingWithData } from '../types'
import {
  deleteRecording,
  getRecordingWithData,
  getTotalSize,
  listAllItems,
  listFolders,
  renameRecording,
  saveFolder,
  saveRecording,
  updateParent,
} from '../storage/indexedDb'

interface RecordingsContextValue {
  items: LibraryItem[]
  totalBytes: number
  loading: boolean
  activeParentId: string | null
  refresh(parentId?: string | null): Promise<void>
  setActiveParent(parentId: string | null): Promise<void>
  addRecording(input: { name: string; duration: number; blob: Blob; scriptText: string; parent?: string | null }): Promise<void>
  addFolder(input: { name: string; parent?: string | null }): Promise<void>
  removeItem(id: string): Promise<void>
  updateName(id: string, name: string): Promise<void>
  moveItem(id: string, parent: string | null): Promise<void>
  listFolders(parentId?: string | null): Promise<LibraryItem[]>
  fetchRecording(id: string): Promise<RecordingWithData | null>
}

const RecordingsContext = createContext<RecordingsContextValue | undefined>(undefined)

export function RecordingsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<LibraryItem[]>([])
  const [totalBytes, setTotalBytes] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activeParentId, setActiveParentId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [list, total] = await Promise.all([listAllItems(), getTotalSize()])
    setItems(list)
    setTotalBytes(total)
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh(null)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  useEffect(() => {
    void refresh(activeParentId)
  }, [activeParentId, refresh])

  const setActiveParent = useCallback(
    async (parentId: string | null) => {
      setActiveParentId(parentId)
      await refresh()
    },
    [refresh],
  )

  const addRecording = useCallback(
    async (input: { name: string; duration: number; blob: Blob; scriptText: string; parent?: string | null }) => {
      const effectiveParent = input.parent ?? activeParentId ?? null
      const meta = await saveRecording({ ...input, parent: effectiveParent })
      setItems((prev) => (effectiveParent === activeParentId ? [meta, ...prev] : prev))
      setTotalBytes((prev) => prev + meta.size)
    },
    [activeParentId],
  )

  const addFolder = useCallback(
    async (input: { name: string; parent?: string | null }) => {
      const effectiveParent = input.parent ?? activeParentId ?? null
      const folder = await saveFolder({ ...input, parent: effectiveParent })
      setItems((prev) => (effectiveParent === activeParentId ? [folder, ...prev] : prev))
    },
    [activeParentId],
  )

  const removeItem = useCallback(async (id: string) => {
    await deleteRecording(id)
    let removedSize = 0
    setItems((prev) => {
      const current = prev.find((item) => item.id === id)
      removedSize = current && !current.isFolder ? current.size : 0
      return prev.filter((item) => item.id !== id)
    })
    if (removedSize) {
      setTotalBytes((prev) => Math.max(0, prev - removedSize))
    }
  }, [])

  const updateName = useCallback(async (id: string, name: string) => {
    const updated = await renameRecording(id, name)
    if (!updated) return
    setItems((prev) => prev.map((item) => (item.id === id ? updated : item)))
  }, [])

  const moveItem = useCallback(
    async (id: string, parent: string | null) => {
      const updated = await updateParent(id, parent)
      if (!updated) return
      setItems((prev) => {
        // If the item was in the current view but moved elsewhere, drop it.
        if (parent !== activeParentId) {
          return prev.filter((item) => item.id !== id)
        }
        // Otherwise update in place.
        const exists = prev.some((item) => item.id === id)
        if (exists) {
          return prev.map((item) => (item.id === id ? updated : item))
        }
        return prev
      })
    },
    [activeParentId],
  )

  const listFoldersForParent = useCallback((parentId: string | null = null) => listFolders(parentId), [])

  const fetchRecording = useCallback((id: string) => getRecordingWithData(id), [])

  const value = useMemo(
    () => ({
      items,
      totalBytes,
      loading,
      activeParentId,
      refresh,
      setActiveParent,
      addRecording,
      addFolder,
      removeItem,
      updateName,
      moveItem,
      listFolders: listFoldersForParent,
      fetchRecording,
    }),
    [items, totalBytes, loading, activeParentId, refresh, setActiveParent, addRecording, addFolder, removeItem, updateName, moveItem, listFoldersForParent, fetchRecording],
  )

  return <RecordingsContext.Provider value={value}>{children}</RecordingsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRecordings() {
  const ctx = useContext(RecordingsContext)
  if (!ctx) {
    throw new Error('useRecordings must be used inside RecordingsProvider')
  }
  return ctx
}
