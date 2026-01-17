import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Modal from '../components/Modal'
import RecordingRow from '../components/RecordingRow'
import { useRecordings } from '../state/RecordingsContext'
import type { LibraryItem, LibraryItemKind } from '../types'
import { formatBytes } from '../utils/format'

export default function ListPage() {
  const navigate = useNavigate()
  const { id: folderId } = useParams<{ id?: string }>()
  const {
    items,
    loading,
    totalBytes,
    updateName,
    removeItem,
    setActiveParent,
    activeParentId,
    addFolder,
    moveItem,
    listFolders,
    legacyStatus,
    legacyImportCount,
    legacyError,
    importLegacyData,
    dismissLegacyPrompt,
  } = useRecordings()
  const [renameTarget, setRenameTarget] = useState<LibraryItem | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<LibraryItem | null>(null)
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false)
  const [folderModalOpen, setFolderModalOpen] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [moveTarget, setMoveTarget] = useState<LibraryItem | null>(null)
  const [browseParent, setBrowseParent] = useState<string | null>(null)
  const [browsePath, setBrowsePath] = useState<{ id: string; name: string }[]>([])
  const [availableFolders, setAvailableFolders] = useState<LibraryItem[]>([])
  const [browseLoading, setBrowseLoading] = useState(false)

  const displayedItems = items.filter((item) => (item.parent ?? null) === (activeParentId ?? null))
  const currentFolder = items.find((item) => item.isFolder && item.id === activeParentId)
  const backTarget = currentFolder?.parent ? `/folder/${currentFolder.parent}` : '/'
  const activeBrowseFolder = browsePath[browsePath.length - 1]
  const destinationName =
    activeBrowseFolder?.name ??
    (browseParent
      ? items.find((item) => item.id === browseParent)?.name ?? 'selected folder'
      : 'Root')
  const isSameLocation = moveTarget ? (browseParent ?? null) === (moveTarget.parent ?? null) : false
  const isInvalidSelf = moveTarget ? moveTarget.id === (browseParent ?? null) : false
  const moveDisabled = !moveTarget || isSameLocation || isInvalidSelf
  const moveButtonLabel = isSameLocation ? "Stay" : `Move to '${destinationName}'`
  const headerTitle = activeParentId ? currentFolder?.name ?? 'Folder' : 'Your library'
  const showStorageUsage = !activeParentId
  const showLegacyBanner = ['available', 'importing', 'imported', 'error'].includes(legacyStatus)
  const importingLegacy = legacyStatus === 'importing'
  const importButtonLabel =
    legacyStatus === 'error'
      ? 'Try again'
      : importingLegacy
        ? 'Copying…'
        : 'Copy to new app'

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, LibraryItem[]>()
    items.forEach((item) => {
      const parentKey = item.parent ?? null
      const list = map.get(parentKey) ?? []
      list.push(item)
      map.set(parentKey, list)
    })
    return map
  }, [items])

  const getDescendantCount = useCallback(
    (targetId: string) => {
      const stack = [...(childrenByParent.get(targetId) ?? [])]
      let count = stack.length
      while (stack.length > 0) {
        const current = stack.pop()
        if (!current) continue
        const nested = childrenByParent.get(current.id) ?? []
        count += nested.length
        stack.push(...nested)
      }
      return count
    },
    [childrenByParent],
  )


  const loadFolders = async (parentId: string | null) => {
    setBrowseLoading(true)
    const folders = await listFolders(parentId)
    setAvailableFolders(folders)
    setBrowseLoading(false)
  }

  useEffect(() => {
    const targetParent = folderId ?? null
    void setActiveParent(targetParent)
  }, [folderId, setActiveParent])

  useEffect(() => {
    if (!moveTarget) return
    const parentId = browseParent ?? null
    void loadFolders(parentId)
  }, [moveTarget, browseParent])

  useEffect(() => {
    setDeleteAcknowledged(false)
  }, [deleteTarget])

  const kindOf = (item: LibraryItem | { kind?: LibraryItemKind; isFolder?: boolean; isPlaylist?: boolean }) => {
    if (item.kind) return item.kind
    if (item.isFolder === true) return 'folder'
    if (item.isPlaylist) return 'playlist'
    return 'recording'
  }

  const deleteIsFolder = deleteTarget?.isFolder === true
  const deleteIsPlaylist = deleteTarget?.isPlaylist === true
  const deleteDescendantCount = deleteIsFolder && deleteTarget ? getDescendantCount(deleteTarget.id) : 0
  const deleteTitle = deleteIsFolder ? 'Delete folder' : deleteIsPlaylist ? 'Delete playlist' : 'Delete recording'
  const deleteRequiresAcknowledgement = deleteIsFolder && deleteDescendantCount > 0
  const deleteButtonDisabled = deleteRequiresAcknowledgement && !deleteAcknowledged

  return (
    <div className="flex flex-col gap-5 pb-24 text-slate-900 dark:text-slate-100">
      {showLegacyBanner && (
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 p-4 shadow-sm backdrop-blur dark:border-amber-500/40 dark:bg-amber-900/30">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-800 shadow-sm dark:bg-amber-700/60 dark:text-amber-50">
                <svg aria-hidden xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                  <path d="M4.93 19.07a10 10 0 1 1 14.14 0A10 10 0 0 1 4.93 19.07Z" />
                </svg>
              </span>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-50">Found data from an older EchoMemo</p>
                {legacyStatus === 'imported' ? (
                  <p className="text-sm text-amber-900 dark:text-amber-100">
                    Copied {legacyImportCount ?? 0} item{(legacyImportCount ?? 0) === 1 ? '' : 's'} into this version.
                  </p>
                ) : (
                  <p className="text-sm text-amber-900 dark:text-amber-100">
                    Copy your previous recordings and playlists into this version so everything stays together.
                  </p>
                )}
                {legacyStatus === 'error' && (
                  <p className="text-sm text-rose-700 dark:text-rose-200">{legacyError ?? 'Copy failed. Please try again.'}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 self-start md:self-center">
              {legacyStatus !== 'imported' && (
                <button
                  className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-amber-400"
                  disabled={importingLegacy}
                  onClick={() => importLegacyData()}
                >
                  {importButtonLabel}
                </button>
              )}
              <button
                className="rounded-lg border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 dark:border-amber-600 dark:text-amber-100 dark:hover:bg-amber-800/50"
                onClick={dismissLegacyPrompt}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="flex flex-col gap-4 rounded-2xl bg-white/80 p-5 shadow-md dark:bg-slate-900/80 dark:shadow-black/30">
        <div className="grid grid-cols-3 items-center gap-3">
          <div className="flex items-center justify-start gap-2">
            {activeParentId && (
              <button
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => navigate(backTarget)}
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
            )}
          </div>
          <div className="flex flex-col items-center text-center justify-self-center">
            <p className="text-lg font-semibold tracking-wide text-slate-500 dark:text-slate-400">{headerTitle}</p>
            {showStorageUsage && (
              <p className="text-sm text-slate-600 dark:text-slate-300">Storage used: {formatBytes(totalBytes)}</p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              onClick={() => {
                setFolderName('')
                setFolderModalOpen(true)
              }}
            >
              New folder
            </button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        {loading && <div className="text-sm text-slate-500 dark:text-slate-400">Loading your items…</div>}
        {!loading && displayedItems.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
            No items yet. Add a folder or create a recording.
          </div>
        )}
        {!loading && displayedItems.map((recording) => {
          const kind = kindOf(recording)
          return (
            <RecordingRow
              key={recording.id}
              recording={recording}
              onOpen={() => {
                if (kind === 'folder') {
                  navigate(`/folder/${recording.id}`)
                } else if (kind === 'playlist') {
                  navigate(`/playlist/${recording.id}`)
                } else {
                  navigate(`/play/${recording.id}`)
                }
              }}
              onRename={() => {
                if (kind === 'playlist') {
                  navigate(`/playlist/${recording.id}/edit`, {
                    state: {
                      parentId: activeParentId ?? null,
                      returnTo: activeParentId ? `/folder/${activeParentId}` : '/',
                    },
                  })
                  return
                }
                setRenameTarget(recording)
                setRenameValue(recording.name)
              }}
              onDelete={() => setDeleteTarget(recording)}
              onMove={() => {
                setMoveTarget(recording)
                setBrowseParent(recording.parent ?? null)
                setBrowsePath([])
              }}
            />
          )
        })}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/90 backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/90">
        <div className="mx-auto flex w-full max-w-5xl items-stretch px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="my-4 flex w-full gap-3">
            <button
              className="w-1/2 rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white shadow-md transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              onClick={() => navigate('/playlist/new', { state: { parentId: activeParentId } })}
            >
              New playlist
            </button>
            <button
              className="w-1/2 rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white shadow-md transition hover:bg-indigo-500"
              onClick={() => navigate('/record', { state: { parentId: activeParentId } })}
            >
              New recording
            </button>
          </div>
        </div>
      </div>

      <Modal
        open={Boolean(renameTarget)}
        title="Rename recording"
        onClose={() => setRenameTarget(null)}
        footer={
          <>
            <button
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() => setRenameTarget(null)}
            >
              Cancel
            </button>
            <button
              className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              onClick={async () => {
                if (renameTarget && renameValue.trim()) {
                  await updateName(renameTarget.id, renameValue.trim())
                }
                setRenameTarget(null)
              }}
            >
              Save
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="rename">
            Item name
          </label>
          <input
            id="rename"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        title={deleteTitle}
        onClose={() => {
          setDeleteTarget(null)
          setDeleteAcknowledged(false)
        }}
        footer={
          <>
            <button
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </button>
            <button
              className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-rose-400 dark:disabled:bg-rose-800"
              disabled={deleteButtonDisabled}
              onClick={async () => {
                if (deleteTarget) await removeItem(deleteTarget.id)
                setDeleteTarget(null)
                setDeleteAcknowledged(false)
              }}
            >
              Delete
            </button>
          </>
        }
      >
        {deleteIsFolder ? (
          <div className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
            <p>
              This will remove “{deleteTarget?.name ?? 'folder'}” and its nested contents forever. {deleteDescendantCount > 0 ? `${deleteDescendantCount} item${deleteDescendantCount === 1 ? '' : 's'} inside will also be deleted.` : 'This folder is empty.'}
            </p>
            {deleteRequiresAcknowledgement && (
              <label className="flex items-start gap-2 font-medium text-rose-700 dark:text-rose-200">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 dark:border-slate-600"
                  checked={deleteAcknowledged}
                  onChange={(e) => setDeleteAcknowledged(e.target.checked)}
                />
                <span>I understand this will permanently delete this folder and all nested items.</span>
              </label>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-700 dark:text-slate-200">
            This will remove “{deleteTarget?.name ?? 'recording'}” from your device storage. You cannot undo this action.
          </p>
        )}
      </Modal>

      <Modal
        open={folderModalOpen}
        title="New folder"
        onClose={() => setFolderModalOpen(false)}
        footer={
          <>
            <button
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() => setFolderModalOpen(false)}
            >
              Cancel
            </button>
            <button
              className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              onClick={async () => {
                if (folderName.trim()) {
                  await addFolder({ name: folderName.trim(), parent: activeParentId ?? null })
                }
                setFolderModalOpen(false)
              }}
            >
              Create
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="folder-name">
            Folder name
          </label>
          <input
            id="folder-name"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(moveTarget)}
        title={moveTarget ? `Move “${moveTarget.name}”` : 'Move item'}
        onClose={() => setMoveTarget(null)}
        footer={
          <>
            <button
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() => setMoveTarget(null)}
            >
              Cancel
            </button>
            <button
              className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-slate-700"
              disabled={moveDisabled}
              onClick={async () => {
                if (!moveTarget) return
                if (moveDisabled) return
                await moveItem(moveTarget.id, browseParent ?? null)
                setMoveTarget(null)
              }}
            >
              {moveButtonLabel}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-300">
            <div className="flex flex-wrap items-center gap-1">
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

          <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-sm shadow-inner dark:border-slate-700 dark:bg-slate-900/60">
            {browseLoading && <div className="text-slate-500">Loading folders…</div>}
            {!browseLoading && availableFolders.length === 0 && <div className="text-slate-500">No folders here.</div>}
            {!browseLoading && availableFolders.length > 0 && (
              <div className="flex flex-col divide-y divide-slate-200 dark:divide-slate-800">
                {availableFolders.map((folder) => (
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
        </div>
      </Modal>
    </div>
  )
}
