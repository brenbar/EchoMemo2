import { formatBytes, formatDuration } from '../utils/format'
import type { RecordingMeta } from '../types'

interface Props {
  recording: RecordingMeta
  onOpen(): void
  onRename(): void
  onDelete(): void
}

export default function RecordingRow({ recording, onOpen, onRename, onDelete }: Props) {
  return (
    <div
      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900/70 dark:hover:shadow-black/30"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen()
      }}
    >
      <div className="flex flex-col gap-1">
        <div className="text-base font-semibold text-slate-900 dark:text-slate-50">{recording.name}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {formatDuration(recording.duration)} · {formatBytes(recording.size)}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          onClick={(e) => {
            e.stopPropagation()
            onRename()
          }}
        >
          Rename
        </button>
        <button
          type="button"
          className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-100 dark:hover:bg-rose-900/60"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
