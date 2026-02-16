import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { LibraryItem, PlaylistMeta, PlaylistWithData, RecordingWithData } from '../types'
import {
  deleteCascade,
  getRecordingWithData,
  getTotalSize,
  listAllItems,
  listFolders,
  renameRecording,
  saveFolder,
  savePlaylist,
  saveRecording,
  updateParent,
  getPlaylistWithData,
  updatePlaylist as persistPlaylist,
  sortLibraryItems,
} from '../storage/indexedDb'
import { getFreeLibraryItems, getFreeRecording, getFreeTotalBytes } from '../sample/freeSamples'

interface RecordingsContextValue {
  items: LibraryItem[]
  totalBytes: number
  loading: boolean
  activeParentId: string | null
  refresh(): Promise<void>
  setActiveParent(parentId: string | null): Promise<void>
  addRecording(input: { name: string; duration: number; blob: Blob; scriptText: string; parent?: string | null }): Promise<void>
  addFolder(input: { name: string; parent?: string | null }): Promise<void>
  addPlaylist(input: { name: string; entries: { recordingId: string; repeats: number }[]; parent?: string | null }): Promise<void>
  updatePlaylist(input: {
    id: string
    name: string
    entries: { recordingId: string; repeats: number }[]
    parent?: string | null
  }): Promise<PlaylistMeta | null>
  removeItem(id: string): Promise<void>
  updateName(id: string, name: string): Promise<void>
  moveItem(id: string, parent: string | null): Promise<void>
  listFolders(parentId?: string | null): Promise<LibraryItem[]>
  fetchRecording(id: string): Promise<RecordingWithData | null>
  fetchPlaylist(id: string): Promise<PlaylistWithData | null>
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
    const combined = sortLibraryItems([...getFreeLibraryItems(), ...list])
    setItems(combined)
    setTotalBytes(total + getFreeTotalBytes())
    setLoading(false)
  }, [getFreeLibraryItems, getFreeTotalBytes, sortLibraryItems])

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
      setItems((prev) => sortLibraryItems([meta, ...prev.filter((item) => item.id !== meta.id)]))
      setTotalBytes((prev) => prev + meta.size)
    },
    [activeParentId, sortLibraryItems],
  )

  const addFolder = useCallback(
    async (input: { name: string; parent?: string | null }) => {
      const effectiveParent = input.parent ?? activeParentId ?? null
      const folder = await saveFolder({ ...input, parent: effectiveParent })
      setItems((prev) => sortLibraryItems([folder, ...prev.filter((item) => item.id !== folder.id)]))
    },
    [activeParentId, sortLibraryItems],
  )

  const addPlaylist = useCallback(
    async (input: { name: string; entries: { recordingId: string; repeats: number }[]; parent?: string | null }) => {
      const effectiveParent = input.parent ?? activeParentId ?? null
      const playlist = await savePlaylist({ ...input, parent: effectiveParent })
      setItems((prev) => sortLibraryItems([playlist, ...prev.filter((item) => item.id !== playlist.id)]))
    },
    [activeParentId, sortLibraryItems],
  )

  const updatePlaylist = useCallback(
    async (input: { id: string; name: string; entries: { recordingId: string; repeats: number }[]; parent?: string | null }) => {
      const updated = await persistPlaylist(input)
      if (!updated) return null
      setItems((prev) => {
        const exists = prev.some((item) => item.id === updated.id)
        if (!exists) return prev
        return sortLibraryItems(prev.map((item) => (item.id === updated.id ? updated : item)))
      })
      return updated
    },
    [sortLibraryItems],
  )

  const removeItem = useCallback(
    async (id: string) => {
      const { ids, freedBytes, updatedPlaylists } = await deleteCascade(id)
      if (ids.length === 0 && updatedPlaylists.length === 0) return
      setItems((prev) => {
        const updatedMap = new Map(updatedPlaylists.map((playlist) => [playlist.id, playlist]))
        const next = prev
          .filter((item) => !ids.includes(item.id))
          .map((item) => updatedMap.get(item.id) ?? item)
        return sortLibraryItems(next)
      })
      if (freedBytes) {
        setTotalBytes((prev) => Math.max(0, prev - freedBytes))
      }
    },
    [sortLibraryItems],
  )

  const updateName = useCallback(
    async (id: string, name: string) => {
      const updated = await renameRecording(id, name)
      if (!updated) return
      setItems((prev) => sortLibraryItems(prev.map((item) => (item.id === id ? updated : item))))
    },
    [sortLibraryItems],
  )

  const moveItem = useCallback(
    async (id: string, parent: string | null) => {
      const updated = await updateParent(id, parent)
      if (!updated) return
      setItems((prev) => {
        const exists = prev.some((item) => item.id === id)
        if (!exists) return prev
        return sortLibraryItems(prev.map((item) => (item.id === id ? updated : item)))
      })
    },
    [sortLibraryItems],
  )

  const listFoldersForParent = useCallback(
    async (parentId: string | null = null) => {
      const folders = await listFolders(parentId)
      const freeFolders = parentId === null ? getFreeLibraryItems().filter((item) => item.isFolder === true) : []
      return sortLibraryItems([...folders, ...freeFolders])
    },
    [getFreeLibraryItems, listFolders, sortLibraryItems],
  )

  const fetchRecording = useCallback(
    async (id: string) => {
      const free = getFreeRecording(id)
      if (free) return free
      return getRecordingWithData(id)
    },
    [getFreeRecording],
  )
  const fetchPlaylist = useCallback((id: string) => getPlaylistWithData(id), [])

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
      addPlaylist,
      updatePlaylist,
      removeItem,
      updateName,
      moveItem,
      listFolders: listFoldersForParent,
      fetchRecording,
      fetchPlaylist,
    }),
    [items, totalBytes, loading, activeParentId, refresh, setActiveParent, addRecording, addFolder, addPlaylist, updatePlaylist, removeItem, updateName, moveItem, listFoldersForParent, fetchRecording, fetchPlaylist],
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
