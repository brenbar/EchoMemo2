import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Modal from '../components/Modal'
import { useRecordings } from '../state/RecordingsContext'
import type { LibraryItem, LibraryItemKind, RecordingMeta } from '../types'
import { formatDuration } from '../utils/format'

function kindOf(item: LibraryItem | { kind?: LibraryItemKind; isFolder?: boolean; isPlaylist?: boolean }) {
  if (item.kind) return item.kind
  if (item.isFolder === true) return 'folder'
  if (item.isPlaylist) return 'playlist'
  return 'recording'
}

function isRecording(item: LibraryItem): item is RecordingMeta {
  return kindOf(item) === 'recording'
}

export default function PlaylistEditorPage() {
  const MIN_RECORDINGS = 2
  const { items, addPlaylist, fetchPlaylist, updatePlaylist } = useRecordings()
  const navigate = useNavigate()
  const location = useLocation()
  const { id: playlistId } = useParams<{ id?: string }>()
  const routeState = (location.state as { parentId?: string | null; returnTo?: string } | null) ?? {}
  const [parentId, setParentId] = useState<string | null>(routeState.parentId ?? null)
  const isEditMode = Boolean(playlistId)

  const [name, setName] = useState(isEditMode ? 'Loading playlist' : 'New playlist')
  const [entries, setEntries] = useState<{ recordingId: string; repeats: number }[]>([])
  const [selectOpen, setSelectOpen] = useState(false)
  const [browseParent, setBrowseParent] = useState<string | null>(parentId ?? null)
  const [browsePath, setBrowsePath] = useState<{ id: string; name: string }[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loadingExisting, setLoadingExisting] = useState(isEditMode)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [swipeState, setSwipeState] = useState<{ id: string | null; startX: number; translate: number }>({
    id: null,
    startX: 0,
    translate: 0,
  })

  const recordingsById = useMemo(() => {
    const map = new Map<string, RecordingMeta>()
    items.filter(isRecording).forEach((rec) => map.set(rec.id, rec))
    return map
  }, [items])

  const readyEntries = entries
    .map((entry) => {
      const rec = recordingsById.get(entry.recordingId)
      if (!rec) return null
      return { ...entry, recording: rec }
    })
    .filter(Boolean) as { recordingId: string; repeats: number; recording: RecordingMeta }[]

  const visibleChildren = useMemo(
    () => items.filter((item) => (item.parent ?? null) === (browseParent ?? null)),
    [items, browseParent],
  )
  const visibleFolders = visibleChildren.filter((item) => item.isFolder)
  const visibleRecordings = visibleChildren.filter(isRecording)

  const meetsMinimumEntries = readyEntries.length >= MIN_RECORDINGS
  const needsMoreEntries = readyEntries.length > 0 && readyEntries.length < MIN_RECORDINGS

  useEffect(() => {
    if (!isEditMode || !playlistId) return undefined
    let active = true
    setLoadingExisting(true)
    setLoadError(null)

    fetchPlaylist(playlistId)
      .then((data) => {
        if (!active) return
        if (!data) {
          setLoadError('Playlist not found.')
          return
        }
        setName(data.name)
        setParentId(data.parent ?? null)
        setBrowseParent(data.parent ?? null)
        setBrowsePath([])
        setEntries(
          data.entries.map((entry) => ({
            recordingId: entry.recordingId,
            repeats: Math.max(1, Math.round(entry.repeats || 1)),
          })),
        )
      })
      .catch(() => {
        if (active) setLoadError('Unable to load playlist.')
      })
      .finally(() => {
        if (active) setLoadingExisting(false)
      })

    return () => {
      active = false
    }
  }, [fetchPlaylist, isEditMode, playlistId])

  useEffect(() => {
    if (selectOpen) {
      setSelectedIds(entries.map((entry) => entry.recordingId))
    }
  }, [selectOpen, entries])

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const addSelectedToEntries = () => {
    setEntries((prev) => {
      const existingIds = new Set(prev.map((entry) => entry.recordingId))
      const additions = selectedIds
        .filter((id) => recordingsById.has(id))
        .filter((id) => !existingIds.has(id))
        .map((id) => ({ recordingId: id, repeats: 1 }))
      return [...prev, ...additions]
    })
    setSelectOpen(false)
  }

  const clampRepeats = (value: number) => Math.max(1, Math.min(99, Math.round(value || 1)))

  const updateRepeats = (recordingId: string, repeats: number) => {
    setEntries((prev) =>
      prev.map((entry) => (entry.recordingId === recordingId ? { ...entry, repeats: clampRepeats(repeats) } : entry)),
    )
  }

  const nudgeRepeats = (recordingId: string, delta: number) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.recordingId === recordingId ? { ...entry, repeats: clampRepeats(entry.repeats + delta) } : entry,
      ),
    )
  }
  const removeEntry = (recordingId: string) => setEntries((prev) => prev.filter((entry) => entry.recordingId !== recordingId))

  const canSave = name.trim().length > 0 && meetsMinimumEntries && !loadingExisting

  const handleSave = async () => {
    if (!canSave) return
    const payload = readyEntries.map((entry) => ({
      recordingId: entry.recordingId,
      repeats: clampRepeats(entry.repeats),
    }))
    if (isEditMode && playlistId) {
      const updated = await updatePlaylist({ id: playlistId, name: name.trim(), entries: payload, parent: parentId })
      if (!updated) {
        setLoadError('Unable to save playlist.')
        return
      }
      const destination = routeState.returnTo ?? `/playlist/${playlistId}`
      navigate(destination)
      return
    }
    await addPlaylist({ name: name.trim(), entries: payload, parent: parentId })
    navigate(parentId ? `/folder/${parentId}` : '/')
  }

  const goBack = () => {
    const destination = routeState.returnTo ?? (parentId ? `/folder/${parentId}` : '/')
    navigate(destination)
  }

  const resetSwipe = () => setSwipeState({ id: null, startX: 0, translate: 0 })

  const handleTouchStart = (id: string) => (event: React.TouchEvent) => {
    const startX = event.touches[0]?.clientX ?? 0
    setSwipeState({ id, startX, translate: 0 })
  }

  const handleTouchMove = (id: string) => (event: React.TouchEvent) => {
    if (swipeState.id !== id) return
    const currentX = event.touches[0]?.clientX ?? 0
    const delta = Math.min(0, Math.max(-140, currentX - swipeState.startX))
    setSwipeState((prev) => ({ ...prev, translate: delta }))
  }

  const handleTouchEnd = (id: string) => () => {
    if (swipeState.id !== id) {
      resetSwipe()
      return
    }
    const shouldDelete = swipeState.translate < -80
    resetSwipe()
    if (shouldDelete) removeEntry(id)
  }

  const handlePointerStart = (id: string) => (event: React.PointerEvent) => {
    if (event.pointerType === 'mouse' && event.buttons !== 1) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setSwipeState({ id, startX: event.clientX, translate: 0 })
  }

  const handlePointerMove = (id: string) => (event: React.PointerEvent) => {
    if (swipeState.id !== id) return
    if (event.pointerType === 'mouse' && event.buttons !== 1) return
    const delta = Math.min(0, Math.max(-140, event.clientX - swipeState.startX))
    setSwipeState((prev) => ({ ...prev, translate: delta }))
  }

  const handlePointerEnd = (id: string) => (event: React.PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (swipeState.id !== id) {
      resetSwipe()
      return
    }
    const shouldDelete = swipeState.translate < -80
    resetSwipe()
    if (shouldDelete) removeEntry(id)
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  return (
    <div className="flex flex-col gap-5 text-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between gap-3">
        <button
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          onClick={goBack}
        >
          <svg
            aria-hidden
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-4 w-4"
          >
            <path d="M14 18l-6-6 6-6" />
          </svg>
          Back
        </button>
        <h1 className="text-lg font-bold">{isEditMode ? 'Edit playlist' : 'New playlist'}</h1>
        <div className="w-16" />
      </div>

      {loadError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100">
          {loadError}
        </div>
      )}

      {loadingExisting && isEditMode && !loadError && (
        <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200">
          Loading playlist…
        </div>
      )}

      <section className="rounded-2xl bg-white/80 p-5 shadow-md dark:bg-slate-900/80 dark:shadow-black/30">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="playlist-name">
              Playlist name
            </label>
            <input
              id="playlist-name"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              value={name}
              disabled={loadingExisting}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center">
              <button
                className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-slate-700"
                disabled={loadingExisting}
                onClick={() => setSelectOpen(true)}
              >
                Add recordings
              </button>
            </div>

            {readyEntries.length === 0 && !loadingExisting && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                No recordings added yet. Click “Add recordings” to start building your playlist.
              </div>
            )}

            {readyEntries.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white/70 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-2 border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-300">
                  <span>Name</span>
                  <span className="text-center">Repeats</span>
                </div>
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {readyEntries.map((entry) => (
                    <div key={entry.recordingId} className="relative overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-end pr-4 text-sm font-semibold text-rose-700 dark:text-rose-100">
                        <span className="rounded-full bg-rose-100 px-3 py-1 shadow-sm dark:bg-rose-900/50">Delete</span>
                      </div>
                      <div
                        className="relative grid grid-cols-[minmax(0,1fr)_140px] items-center gap-2 px-3 py-3 transition-[transform] duration-150 ease-out"
                        data-playlist-row-name={entry.recording.name}
                        style={{ transform: `translateX(${swipeState.id === entry.recordingId ? swipeState.translate : 0}px)` }}
                        onTouchStart={handleTouchStart(entry.recordingId)}
                        onTouchMove={handleTouchMove(entry.recordingId)}
                        onTouchEnd={handleTouchEnd(entry.recordingId)}
                        onTouchCancel={handleTouchEnd(entry.recordingId)}
                        onPointerDown={handlePointerStart(entry.recordingId)}
                        onPointerMove={handlePointerMove(entry.recordingId)}
                        onPointerUp={handlePointerEnd(entry.recordingId)}
                        onPointerCancel={handlePointerEnd(entry.recordingId)}
                      >
                        <div className="flex flex-col gap-1">
                          <div className="text-base font-semibold text-slate-900 dark:text-slate-50">{entry.recording.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{formatDuration(entry.recording.duration)}</div>
                        </div>
                        <div className="flex items-center justify-center gap-2 rounded-lg bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900">
                          <button
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                            type="button"
                            disabled={loadingExisting || entry.repeats <= 1}
                            onClick={() => nudgeRepeats(entry.recordingId, -1)}
                            aria-label={`Decrease repeats for ${entry.recording.name}`}
                          >
                            –
                          </button>
                          <input
                            id={`repeat-${entry.recordingId}`}
                            aria-label={`Repeats for ${entry.recording.name}`}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            type="text"
                            className="w-12 rounded-md border border-slate-200 px-2 py-2 text-center text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            value={entry.repeats}
                            disabled={loadingExisting}
                            onChange={(e) => {
                              const next = clampRepeats(Number(e.target.value.replace(/[^0-9]/g, '')) || 0)
                              updateRepeats(entry.recordingId, next)
                            }}
                          />
                          <button
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                            type="button"
                            disabled={loadingExisting}
                            onClick={() => nudgeRepeats(entry.recordingId, 1)}
                            aria-label={`Increase repeats for ${entry.recording.name}`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {needsMoreEntries && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                Add at least two recordings to save.
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={goBack}
            >
              Cancel
            </button>
            <button
              className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-slate-700"
              disabled={!canSave}
              onClick={handleSave}
            >
              {isEditMode ? 'Save changes' : 'Save playlist'}
            </button>
          </div>
        </div>
      </section>

      <Modal
        open={selectOpen}
        title="Add recordings"
        onClose={() => setSelectOpen(false)}
        footer={
          <>
            <button
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() => setSelectOpen(false)}
            >
              Cancel
            </button>
            <button
              className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-slate-700"
              disabled={selectedIds.length === 0}
              onClick={addSelectedToEntries}
            >
              Add selected
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="rounded-full px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => {
                  setBrowseParent(null)
                  setBrowsePath([])
                }}
              >
                Root
              </button>
              {browsePath.map((crumb, idx) => (
                <button
                  key={crumb.id}
                  className="rounded-full px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => {
                    const nextPath = browsePath.slice(0, idx + 1)
                    setBrowsePath(nextPath)
                    setBrowseParent(crumb.id)
                  }}
                >
                  {crumb.name}
                </button>
              ))}
            </div>
            {browsePath.length > 0 && (
              <button
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-500"
                onClick={() => {
                  const next = [...browsePath]
                  next.pop()
                  setBrowsePath(next)
                  setBrowseParent(next.at(-1)?.id ?? null)
                }}
              >
                Up one level
              </button>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white/70 p-3 shadow-inner dark:border-slate-700 dark:bg-slate-900/60">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Folders</p>
                {visibleFolders.length === 0 && <div className="text-sm text-slate-500">No folders here.</div>}
                {visibleFolders.length > 0 && (
                  <div className="flex flex-col divide-y divide-slate-200 dark:divide-slate-800">
                    {visibleFolders.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-2 py-2 text-left transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:bg-slate-800/60"
                        onClick={() => {
                          setBrowseParent(folder.id)
                          setBrowsePath((prev) => [...prev, { id: folder.id, name: folder.name }])
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            <svg
                              aria-hidden
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              className="h-4 w-4"
                            >
                              <path d="M3 18.5V7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
                            </svg>
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-100">{folder.name}</span>
                        </div>
                        <svg
                          aria-hidden
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          className="h-4 w-4 text-slate-500"
                        >
                          <path d="m9 6 6 6-6 6" />
                        </svg>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recordings</p>
                {visibleRecordings.length === 0 && <div className="text-sm text-slate-500">No recordings in this folder.</div>}
                {visibleRecordings.length > 0 && (
                  <div className="flex flex-col divide-y divide-slate-200 dark:divide-slate-800">
                    {visibleRecordings.map((rec) => (
                      <label
                        key={rec.id}
                        className="flex w-full items-center justify-between gap-3 py-2 text-sm text-slate-800 transition hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800/60"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={selectedIds.includes(rec.id)}
                            onChange={() => toggleSelected(rec.id)}
                            aria-label={rec.name}
                          />
                          <div className="flex flex-col">
                            <span className="font-semibold">{rec.name}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{formatDuration(rec.duration)}</span>
                          </div>
                        </div>
                        {selectedIds.includes(rec.id) && (
                          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-100">Selected</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
