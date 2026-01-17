import { useEffect, useRef, useState } from 'react'
import { formatBytes, formatDuration } from '../utils/format'
import type { LibraryItem, PlaylistMeta } from '../types'

interface Props {
  recording: LibraryItem
  onOpen(): void
  onRename(): void
  onDelete(): void
  onMove(): void
}

export default function RecordingRow({ recording, onOpen, onRename, onDelete, onMove }: Props) {
  const isFolder = recording.isFolder === true
  const isPlaylist = (recording as PlaylistMeta).isPlaylist === true || recording.kind === 'playlist'
  const displayKind = isFolder ? 'Folder' : isPlaylist ? 'Playlist' : 'Recording'
  const playlistEntries = isPlaylist ? (recording as PlaylistMeta).entries?.length ?? 0 : 0
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const actionsAreaRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return

    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setMenuOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keyup', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keyup', handleEscape)
    }
  }, [menuOpen])

  return (
    <div
      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900/70 dark:hover:shadow-black/30"
      onClick={(e) => {
        if (actionsAreaRef.current?.contains(e.target as Node)) return
        onOpen()
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onOpen()
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
          ) : isPlaylist ? (
            <svg
              aria-hidden
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-5 w-5"
            >
              <path d="M5 5h14" />
              <path d="M5 10h10" />
              <path d="M5 15h14" />
              <circle cx="16" cy="18" r="2" />
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
          {isFolder && displayKind}
          {isPlaylist && `${displayKind} · ${playlistEntries} item${playlistEntries === 1 ? '' : 's'}`}
          {!isFolder && !isPlaylist && `${formatDuration(recording.duration)} · ${formatBytes(recording.size)}`}
        </div>
      </div>
      <div
        ref={actionsAreaRef}
        className="relative flex items-center"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          ref={triggerRef}
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          aria-label="Item actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen((open) => !open)
          }}
        >
          <svg
            aria-hidden
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-5 w-5"
          >
            <circle cx="12" cy="6" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="18" r="1.5" />
          </svg>
          <span className="sr-only">Item actions</span>
        </button>

        {menuOpen && (
          <div
            ref={menuRef}
            role="menu"
            aria-label="Item actions"
            className="absolute right-0 top-12 z-20 w-44 rounded-xl border border-slate-200 bg-white/95 p-1 text-sm shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-700 transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
              onClick={() => {
                setMenuOpen(false)
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
                className="h-4 w-4"
              >
                <path d="M12 3v18" />
                <path d="M6 9l6-6 6 6" />
                <path d="M18 15l-6 6-6-6" />
              </svg>
              Move
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-700 transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
              onClick={() => {
                setMenuOpen(false)
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
                className="h-4 w-4"
              >
                <path d="M3 21h4l11-11a2.8 2.8 0 0 0-4-4L3 17v4Z" />
                <path d="M14 6l4 4" />
              </svg>
              Edit
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-rose-700 transition hover:bg-rose-50 dark:text-rose-100 dark:hover:bg-rose-900/40"
              onClick={() => {
                setMenuOpen(false)
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
                className="h-4 w-4"
              >
                <path d="M4 7h16" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12" />
                <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
