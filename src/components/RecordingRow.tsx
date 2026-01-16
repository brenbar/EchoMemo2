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
      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm transition hover:shadow-md"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen()
      }}
    >
      <div className="flex flex-col gap-1">
        <div className="text-base font-semibold text-slate-900">{recording.name}</div>
        <div className="text-xs text-slate-500">
          {formatDuration(recording.duration)} · {formatBytes(recording.size)}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
          onClick={(e) => {
            e.stopPropagation()
            onRename()
          }}
        >
          Rename
        </button>
        <button
          type="button"
          className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200"
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
