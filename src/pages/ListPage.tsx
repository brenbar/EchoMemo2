import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '../components/Modal'
import RecordingRow from '../components/RecordingRow'
import { useRecordings } from '../state/RecordingsContext'
import type { RecordingMeta } from '../types'
import { formatBytes } from '../utils/format'

export default function ListPage() {
  const navigate = useNavigate()
  const { recordings, loading, totalBytes, updateName, removeRecording } = useRecordings()
  const [renameTarget, setRenameTarget] = useState<RecordingMeta | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<RecordingMeta | null>(null)

  return (
    <div className="flex flex-col gap-5 pb-24 text-slate-900 dark:text-slate-100">
      <section className="flex flex-col gap-4 rounded-2xl bg-white/80 p-5 shadow-md dark:bg-slate-900/80 dark:shadow-black/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">Your library</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">Storage used: {formatBytes(totalBytes)}</p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        {loading && <div className="text-sm text-slate-500 dark:text-slate-400">Loading your recordings…</div>}
        {!loading && recordings.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
            No recordings yet. Tap “New recording” to create your first memory aid.
          </div>
        )}
        {!loading && recordings.map((recording) => (
          <RecordingRow
            key={recording.id}
            recording={recording}
            onOpen={() => navigate(`/play/${recording.id}`)}
            onRename={() => {
              setRenameTarget(recording)
              setRenameValue(recording.name)
            }}
            onDelete={() => setDeleteTarget(recording)}
          />
        ))}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/90 backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/90">
        <div className="mx-auto flex w-full max-w-5xl items-stretch px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button
            className="w-full rounded-lg bg-indigo-600 py-3 text-base font-semibold text-white shadow-md transition hover:bg-indigo-500"
            onClick={() => navigate('/record')}
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
            Recording name
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
                if (deleteTarget) await removeRecording(deleteTarget.id)
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
    </div>
  )
}
