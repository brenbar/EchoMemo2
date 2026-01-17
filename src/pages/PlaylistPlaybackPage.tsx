import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRecordings } from '../state/RecordingsContext'
import type { PlaylistWithData, PlaylistResolvedEntry } from '../types'
import { formatDuration } from '../utils/format'

type PlaylistEntryWithUrl = PlaylistResolvedEntry & { url: string }
type PlaylistWithUrls = Omit<PlaylistWithData, 'resolved'> & { resolved: PlaylistEntryWithUrl[] }

export default function PlaylistPlaybackPage() {
  const { id } = useParams<{ id: string }>()
  const { fetchPlaylist } = useRecordings()
  const navigate = useNavigate()

  const [playlist, setPlaylist] = useState<PlaylistWithUrls | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoPlayBlocked, setAutoPlayBlocked] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [playCount, setPlayCount] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playlistRef = useRef<PlaylistWithUrls | null>(null)
  const currentIndexRef = useRef(0)
  const playCountRef = useRef(1)

  useEffect(() => {
    playlistRef.current = playlist
  }, [playlist])
  useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])
  useEffect(() => {
    playCountRef.current = playCount
  }, [playCount])

  useEffect(() => {
    if (!id) return undefined

    let active = true
    fetchPlaylist(id)
      .then((data) => {
        if (!active) return
        if (!data) {
          setError('Playlist not found.')
          return
        }
        const withUrls: PlaylistWithUrls = {
          ...data,
          resolved: data.resolved.map((entry) => ({ ...entry, url: URL.createObjectURL(entry.recording.blob) })),
        }
        setPlaylist(withUrls)
        setCurrentIndex(0)
        setPlayCount(1)
      })
      .catch(() => {
        if (active) setError('Unable to load playlist.')
      })

    return () => {
      active = false
    }
  }, [fetchPlaylist, id])

  useEffect(() => {
    return () => {
      playlistRef.current?.resolved.forEach((entry) => URL.revokeObjectURL(entry.url))
    }
  }, [])

  const activeEntry: PlaylistEntryWithUrl | null = useMemo(() => {
    if (!playlist) return null
    return playlist.resolved[currentIndex] ?? null
  }, [playlist, currentIndex])

  const hasTracks = Boolean(playlist?.resolved.length)

  useEffect(() => {
    const player = audioRef.current
    if (!player || !activeEntry) return
    player.src = activeEntry.url
    player.currentTime = 0
    setCurrentTime(0)
    setDuration(activeEntry.recording.duration)
    setPlayCount(1)
    playCountRef.current = 1
    player
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => {
        setAutoPlayBlocked(true)
        setIsPlaying(false)
      })
  }, [activeEntry, currentIndex])

  useEffect(() => {
    const player = audioRef.current
    if (!player) return undefined

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleTime = () => setCurrentTime(player.currentTime)
    const handleLoaded = () => {
      if (Number.isFinite(player.duration)) {
        setDuration(player.duration)
      }
    }
    const handleEnded = () => {
      const list = playlistRef.current
      if (!list) return
      const entry = list.resolved[currentIndexRef.current]
      if (!entry) return
      if (playCountRef.current < entry.repeats) {
        playCountRef.current += 1
        setPlayCount(playCountRef.current)
        player.currentTime = 0
        void player.play().catch(() => setIsPlaying(false))
        return
      }
      jumpToIndex(currentIndexRef.current + 1)
    }

    player.addEventListener('play', handlePlay)
    player.addEventListener('pause', handlePause)
    player.addEventListener('timeupdate', handleTime)
    player.addEventListener('loadedmetadata', handleLoaded)
    player.addEventListener('ended', handleEnded)

    return () => {
      player.removeEventListener('play', handlePlay)
      player.removeEventListener('pause', handlePause)
      player.removeEventListener('timeupdate', handleTime)
      player.removeEventListener('loadedmetadata', handleLoaded)
      player.removeEventListener('ended', handleEnded)
    }
  }, [])

  const togglePlayback = () => {
    const player = audioRef.current
    if (!player) return
    if (player.paused) {
      player
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          setAutoPlayBlocked(true)
          setIsPlaying(false)
        })
    } else {
      player.pause()
    }
  }

  const jumpToIndex = (target: number) => {
    const list = playlistRef.current
    if (!list || list.resolved.length === 0) return
    const size = list.resolved.length
    const nextIndex = ((target % size) + size) % size
    currentIndexRef.current = nextIndex
    playCountRef.current = 1
    setPlayCount(1)
    setCurrentIndex(nextIndex)
  }

  const nextTrack = () => jumpToIndex(currentIndexRef.current + 1)
  const prevTrack = () => jumpToIndex(currentIndexRef.current - 1)

  return (
    <div className="grid gap-5 text-slate-900 dark:text-slate-100 lg:grid-cols-[2fr,1fr]">
      <div className="rounded-2xl bg-white/80 p-5 shadow-md dark:bg-slate-900/80 dark:shadow-black/30">
        <div className="flex items-start gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-md pr-2 py-1 text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            onClick={() => navigate('/')} // Always return to list; folder context handled by breadcrumbs there.
            aria-label="Back to list"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 5.75 9.25 12l6.25 6.25" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 12h14" />
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{playlist?.name ?? 'Loading…'}</h1>
            {activeEntry && (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Now playing: {activeEntry.recording.name} ({playCount}/{activeEntry.repeats})
              </p>
            )}
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

        <div className="pt-4 mt-5 flex flex-col gap-4">
          <audio ref={audioRef} className="hidden" />
          <div className="flex items-center gap-3">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 shadow-sm transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:disabled:bg-slate-800"
              onClick={prevTrack}
              disabled={!hasTracks}
              aria-label="Previous track"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 5v14M6 12l10-7v14l-10-7z" />
              </svg>
            </button>
            <button
              className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
              onClick={togglePlayback}
              disabled={!activeEntry}
              aria-label={isPlaying ? 'Pause playlist' : 'Play playlist'}
            >
              {isPlaying ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 5h-1a1 1 0 00-1 1v12a1 1 0 001 1h1a1 1 0 001-1V6a1 1 0 00-1-1zm5 0h-1a1 1 0 00-1 1v12a1 1 0 001 1h1a1 1 0 001-1V6a1 1 0 00-1-1z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 translate-x-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5.25 4.5a.75.75 0 011.125-.65l12 7.5a.75.75 0 010 1.3l-12 7.5A.75.75 0 015.25 19.5V4.5z" />
                </svg>
              )}
            </button>
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 shadow-sm transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:disabled:bg-slate-800"
              onClick={nextTrack}
              disabled={!hasTracks}
              aria-label="Next track"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 19V5m13 7L8 5v14l10-7z" />
              </svg>
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="relative h-3 overflow-hidden rounded-full bg-slate-200/90 shadow-inner dark:bg-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-sky-400"
                  style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                />
              </div>
              <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                <span>{formatDuration(currentTime)}</span>
                <span>{formatDuration(duration || activeEntry?.recording.duration || 0)}</span>
              </div>
            </div>
          </div>
          {autoPlayBlocked && (
            <span className="w-fit rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-100">
              Tap play to start audio on Safari.
            </span>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 shadow-inner dark:border-slate-700 dark:bg-slate-900/60">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Playlist items</h3>
        {playlist?.resolved.length === 0 && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No recordings available.</p>}
        {playlist && playlist.resolved.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {playlist.resolved.map((entry, idx) => (
              <li
                key={entry.recording.id ?? `${idx}`}
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${
                  idx === currentIndex ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-100' : 'bg-white/60 text-slate-800 dark:bg-slate-900/70 dark:text-slate-100'
                }`}
              >
                <div className="flex flex-col">
                  <span className="font-semibold">{entry.recording.name}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-300">
                    {formatDuration(entry.recording.duration)} · repeats {entry.repeats}
                  </span>
                </div>
                {idx === currentIndex && <span className="text-xs font-semibold">Playing</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
