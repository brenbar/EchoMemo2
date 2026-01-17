import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Modal from '../components/Modal'
import RecordingRow from '../components/RecordingRow'
import { useRecordings } from '../state/RecordingsContext'
import type { LibraryItem } from '../types'
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
  } = useRecordings()
  const [renameTarget, setRenameTarget] = useState<LibraryItem | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<LibraryItem | null>(null)
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

  return (
    <div className="flex flex-col gap-5 pb-24 text-slate-900 dark:text-slate-100">
      <section className="flex flex-col gap-4 rounded-2xl bg-white/80 p-5 shadow-md dark:bg-slate-900/80 dark:shadow-black/30">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
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
          <div className="flex flex-col items-center text-center">
            <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">Your library</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">Storage used: {formatBytes(totalBytes)}</p>
          </div>
          <div className="flex items-center gap-2">
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
        {!loading && displayedItems.map((recording) => (
          <RecordingRow
            key={recording.id}
            recording={recording}
            onOpen={() => {
              if (recording.isFolder) {
                navigate(`/folder/${recording.id}`)
              } else {
                navigate(`/play/${recording.id}`)
              }
            }}
            onRename={() => {
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
        ))}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/90 backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/90">
        <div className="mx-auto flex w-full max-w-5xl items-stretch px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button
            className="w-full rounded-lg bg-indigo-600 my-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-indigo-500"
            onClick={() => navigate('/record', { state: { parentId: activeParentId } })}
          >
            New recording
          </button>
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
        title="Delete recording"
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <button
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </button>
            <button
              className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500"
              onClick={async () => {
                if (deleteTarget) await removeItem(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-700 dark:text-slate-200">
          This will remove “{deleteTarget?.name ?? 'recording'}” from your device storage. You cannot undo this action.
        </p>
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
              disabled={!moveTarget || moveTarget.id === (browseParent ?? null)}
              onClick={async () => {
                if (!moveTarget) return
                if (moveTarget.id === (browseParent ?? null)) return
                await moveItem(moveTarget.id, browseParent ?? null)
                setMoveTarget(null)
              }}
            >
              Move here
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
                  <div key={folder.id} className="flex items-center justify-between py-2">
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
                    <div className="flex gap-2">
                      <button
                        className="rounded-full px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                        onClick={() => {
                          setBrowseParent(folder.id)
                          setBrowsePath((prev) => [...prev, { id: folder.id, name: folder.name }])
                        }}
                      >
                        Open
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
