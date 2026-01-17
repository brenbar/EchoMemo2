import { formatBytes, formatDuration } from '../utils/format'
import type { LibraryItem } from '../types'

interface Props {
  recording: LibraryItem
  onOpen(): void
  onRename(): void
  onDelete(): void
  onMove(): void
}

export default function RecordingRow({ recording, onOpen, onRename, onDelete, onMove }: Props) {
  const isFolder = recording.isFolder === true

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
        <div className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-50">
          {isFolder ? (
            <svg
              aria-hidden
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-5 w-5"
            >
              <path d="M3 18.5V7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
            </svg>
          ) : (
            <svg
              aria-hidden
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-5 w-5"
            >
              <path d="M7 4.5h6.5a2 2 0 0 1 1.6.8l2.7 3.7a2 2 0 0 1 .4 1.2V18a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z" />
              <path d="M12 10v4" />
              <path d="M12 16h0.01" />
            </svg>
          )}
          <span>{recording.name}</span>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {isFolder ? 'Folder' : `${formatDuration(recording.duration)} · ${formatBytes(recording.size)}`}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          aria-label="Move item"
          title="Move"
          onClick={(e) => {
            e.stopPropagation()
            onMove()
          }}
        >
          <svg
            aria-hidden
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="h-5 w-5"
          >
            <path d="M12 3v18" />
            <path d="M6 9l6-6 6 6" />
            <path d="M18 15l-6 6-6-6" />
          </svg>
          <span className="sr-only">Move</span>
        </button>
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          aria-label="Rename recording"
          title="Rename"
          onClick={(e) => {
            e.stopPropagation()
            onRename()
          }}
        >
          <svg
            aria-hidden
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="h-5 w-5"
          >
            <path d="M3 21h4l11-11a2.8 2.8 0 0 0-4-4L3 17v4Z" />
            <path d="M14 6l4 4" />
          </svg>
          <span className="sr-only">Rename</span>
        </button>
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-100 dark:hover:bg-rose-900/60"
          aria-label="Delete recording"
          title="Delete"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <svg
            aria-hidden
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="h-5 w-5"
          >
            <path d="M4 7h16" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12" />
            <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
          <span className="sr-only">Delete</span>
        </button>
      </div>
    </div>
  )
}
