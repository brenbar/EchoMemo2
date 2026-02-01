import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useRecordings } from '../state/RecordingsContext'
import type { PlaylistWithData, PlaylistResolvedEntry } from '../types'
import { formatDuration } from '../utils/format'
import { useAudioContinuity } from '../utils/audioContinuity'

type PlaylistEntryWithUrl = PlaylistResolvedEntry & { url: string }
type PlaylistWithUrls = Omit<PlaylistWithData, 'resolved'> & { resolved: PlaylistEntryWithUrl[] }

export default function PlaylistPlaybackPage() {
  const { id } = useParams<{ id: string }>()
  const { fetchPlaylist } = useRecordings()
  const navigate = useNavigate()
  const location = useLocation()

  const [playlist, setPlaylist] = useState<PlaylistWithUrls | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoPlayBlocked, setAutoPlayBlocked] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [playCount, setPlayCount] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const isLikelyIOS = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    const ua = navigator.userAgent ?? ''
    const isIOSDevice = /iPad|iPhone|iPod/i.test(ua)
    // iPadOS 13+ reports itself as Mac, but has touch points.
    const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
    return isIOSDevice || isIPadOS
  }, [])

  const debugAudio = useMemo(() => {
    try {
      return new URLSearchParams(location.search).has('debugAudio')
    } catch {
      return false
    }
  }, [location.search])

  const [debugLines, setDebugLines] = useState<string[]>([])
  const lastTimeUpdateLogMsRef = useRef(0)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playlistRef = useRef<PlaylistWithUrls | null>(null)
  const currentIndexRef = useRef(0)
  const playCountRef = useRef(1)
  const repeatRestartGuardRef = useRef(false)
  const repeatRestartGuardTimerRef = useRef<number | null>(null)
  const playbackGenerationRef = useRef(0)
  const pendingEndedActionRef = useRef(false)
  const replayAttemptRef = useRef(0)
  const lastReplayRequestedAtMsRef = useRef(0)
  const spuriousReplayWindowStartMsRef = useRef(0)
  const spuriousReplayCountRef = useRef(0)
  const { ensureFillerPlaying, stopFiller, maybePrewarm, pauseAll } = useAudioContinuity(audioRef)

  const pushDebug = (message: string) => {
    if (!debugAudio) return
    const ts = new Date().toISOString()
    setDebugLines((prev) => {
      const next = [...prev, `${ts} ${message}`]
      return next.length > 250 ? next.slice(next.length - 250) : next
    })
  }

  const snapshotDebugState = () => {
    const player = audioRef.current
    const entry = playlistRef.current?.resolved[currentIndexRef.current]
    return {
      idx: currentIndexRef.current,
      playCount: playCountRef.current,
      repeats: entry?.repeats ?? null,
      name: entry?.recording.name ?? null,
      paused: player?.paused ?? null,
      ended: player?.ended ?? null,
      ct: player ? Number(player.currentTime.toFixed(3)) : null,
      dur: player ? (Number.isFinite(player.duration) ? Number(player.duration.toFixed(3)) : null) : null,
      rs: player?.readyState ?? null,
      ns: player?.networkState ?? null,
      gen: playbackGenerationRef.current,
      pendingEnded: pendingEndedActionRef.current,
    }
  }

  const clearRepeatRestartGuard = () => {
    repeatRestartGuardRef.current = false
    if (repeatRestartGuardTimerRef.current) {
      window.clearTimeout(repeatRestartGuardTimerRef.current)
      repeatRestartGuardTimerRef.current = null
    }
  }

  const armRepeatRestartGuard = (timeoutMs = 1200) => {
    repeatRestartGuardRef.current = true
    if (repeatRestartGuardTimerRef.current) window.clearTimeout(repeatRestartGuardTimerRef.current)
    repeatRestartGuardTimerRef.current = window.setTimeout(() => {
      repeatRestartGuardRef.current = false
      repeatRestartGuardTimerRef.current = null
    }, timeoutMs)
  }

  const attemptReplay = async (generation: number, retries: number) => {
    const player = audioRef.current
    if (!player) return

    ensureFillerPlaying()
    try {
      replayAttemptRef.current += 1
      pushDebug(`attemptReplay start attempt=${replayAttemptRef.current} retriesLeft=${retries} ${JSON.stringify(snapshotDebugState())}`)
      await player.play()
      if (playbackGenerationRef.current !== generation) return
      stopFiller(180)
      setIsPlaying(true)
      replayAttemptRef.current = 0
      pendingEndedActionRef.current = false
      pushDebug(`attemptReplay success ${JSON.stringify(snapshotDebugState())}`)
    } catch {
      if (playbackGenerationRef.current !== generation) return
      if (retries > 0) {
        pushDebug(`attemptReplay failed; retrying ${JSON.stringify(snapshotDebugState())}`)
        // iOS can be flaky about restarting audio immediately after ended.
        window.setTimeout(() => {
          void attemptReplay(generation, retries - 1)
        }, 200)
        return
      }
      setAutoPlayBlocked(true)
      stopFiller(0)
      pendingEndedActionRef.current = false
      pushDebug(`attemptReplay failed; giving up ${JSON.stringify(snapshotDebugState())}`)
    }
  }

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
    clearRepeatRestartGuard()
    pendingEndedActionRef.current = false
    replayAttemptRef.current = 0
    lastReplayRequestedAtMsRef.current = 0
    spuriousReplayWindowStartMsRef.current = 0
    spuriousReplayCountRef.current = 0
    playbackGenerationRef.current += 1
    const generation = playbackGenerationRef.current
    pushDebug(`loadTrack ${JSON.stringify({ ...snapshotDebugState(), url: 'set', generation })}`)
    ensureFillerPlaying()
    player.src = activeEntry.url
    player.loop = false
    player.setAttribute('playsinline', 'true')
    player.preload = 'auto'
    player.currentTime = 0
    setCurrentTime(0)
    setDuration(activeEntry.recording.duration)
    setPlayCount(1)
    playCountRef.current = 1
    player
      .play()
      .then(() => {
        if (playbackGenerationRef.current !== generation) return
        stopFiller(300)
        setIsPlaying(true)
        pushDebug(`autoplay success ${JSON.stringify(snapshotDebugState())}`)
      })
      .catch(() => {
        if (playbackGenerationRef.current !== generation) return
        setAutoPlayBlocked(true)
        setIsPlaying(false)
        stopFiller(0)
        pushDebug(`autoplay blocked ${JSON.stringify(snapshotDebugState())}`)
      })
  }, [activeEntry, currentIndex, ensureFillerPlaying, stopFiller])

  useEffect(() => {
    const player = audioRef.current
    if (!player) return undefined

    const handlePlay = () => {
      setIsPlaying(true)
      pushDebug(`event play ${JSON.stringify(snapshotDebugState())}`)
    }
    const handlePause = () => {
      setIsPlaying(false)
      stopFiller(0)
      pushDebug(`event pause ${JSON.stringify(snapshotDebugState())}`)
    }
    const handleTime = () => {
      setCurrentTime(player.currentTime)
      maybePrewarm()

      if (debugAudio) {
        const now = Date.now()
        if (now - lastTimeUpdateLogMsRef.current > 1200) {
          lastTimeUpdateLogMsRef.current = now
          pushDebug(`event timeupdate ${JSON.stringify(snapshotDebugState())}`)
        }
      }
    }
    const handleLoaded = () => {
      if (Number.isFinite(player.duration)) {
        setDuration(player.duration)
      }
      pushDebug(`event loadedmetadata ${JSON.stringify(snapshotDebugState())}`)
    }
    const handleEnded = () => {
      if (pendingEndedActionRef.current) return

      const list = playlistRef.current
      if (!list) return
      const entry = list.resolved[currentIndexRef.current]
      if (!entry) return
      ensureFillerPlaying()

      // Guard against duplicate `ended` events / re-entrancy.
      pendingEndedActionRef.current = true
      const generation = playbackGenerationRef.current
      pushDebug(`event ended ${JSON.stringify(snapshotDebugState())}`)

      const nowMs = Date.now()
      const ct = Number.isFinite(player.currentTime) ? player.currentTime : 0
      const dur = Number.isFinite(player.duration) ? player.duration : 0
      const msSinceReplayRequested = nowMs - lastReplayRequestedAtMsRef.current

      // iOS Safari can emit a burst of spurious `ended` events right after we restart playback for a repeat,
      // often with `currentTime≈0` and `duration=0`. Retrying immediately in a tight loop causes audible stutter.
      // We (1) ignore it for repeat counting/advancing, (2) back off retries, (3) cap how long we auto-recover.
      const looksLikeSpuriousReplayEnd =
        isLikelyIOS &&
        lastReplayRequestedAtMsRef.current > 0 &&
        msSinceReplayRequested >= 0 &&
        msSinceReplayRequested < 900 &&
        ct <= 0.05 &&
        (dur === 0 || dur <= 0.05)

      if (repeatRestartGuardRef.current || looksLikeSpuriousReplayEnd) {
        if (spuriousReplayWindowStartMsRef.current === 0 || nowMs - spuriousReplayWindowStartMsRef.current > 1000) {
          spuriousReplayWindowStartMsRef.current = nowMs
          spuriousReplayCountRef.current = 0
        }
        spuriousReplayCountRef.current += 1

        const spuriousCount = spuriousReplayCountRef.current
        const retries = isLikelyIOS ? 3 : 0
        const delayMs = Math.min(450, 40 * spuriousCount)

        if (spuriousCount >= 8) {
          // Give up on automatic recovery for this iteration; prompt user interaction instead of stuttering.
          player.pause()
          stopFiller(0)
          clearRepeatRestartGuard()
          pendingEndedActionRef.current = false
          setIsPlaying(false)
          setAutoPlayBlocked(true)
          pushDebug(`spurious replay loop; giving up after ${spuriousCount} tries ${JSON.stringify(snapshotDebugState())}`)
          return
        }

        pushDebug(
          `ended during repeatRestartGuard; retry replay retries=${retries} backoff=${delayMs}ms count=${spuriousCount} ${JSON.stringify(snapshotDebugState())}`
        )
        player.currentTime = 0
        window.setTimeout(() => {
          void attemptReplay(generation, retries)
        }, delayMs)
        return
      }

      // Non-iOS browsers use explicit repeat handling via the ended event.
      if (true) {
        // Safari (especially on iOS/lock screen) can fire multiple `ended` events around
        // `currentTime = 0` + replay. Without a guard, we may consume multiple repeats
        // and prematurely advance to the next track.
        if (repeatRestartGuardRef.current) return

        const nextCount = playCountRef.current + 1

        if (nextCount <= entry.repeats) {
          // Keep the guard active long enough to swallow iOS's spurious immediate-ended glitch,
          // but short enough to not block the *real* ended event at the end of the repeat.
          armRepeatRestartGuard(350)
          playCountRef.current = nextCount
          setPlayCount(nextCount)
          lastReplayRequestedAtMsRef.current = Date.now()
          spuriousReplayWindowStartMsRef.current = 0
          spuriousReplayCountRef.current = 0
          player.currentTime = 0
          // Clear the pending lock once replay starts or fails.
          const retries = isLikelyIOS ? 3 : 0
          pushDebug(`repeat replay nextCount=${nextCount} retries=${retries} ${JSON.stringify(snapshotDebugState())}`)
          void attemptReplay(generation, retries)
          return
        }
      }

      player.currentTime = 0
      player.pause()
      clearRepeatRestartGuard()
      pendingEndedActionRef.current = false
      pushDebug(`advance track ${JSON.stringify(snapshotDebugState())}`)
      jumpToIndex(currentIndexRef.current + 1)
    }

    const handleError = () => pushDebug(`event error ${JSON.stringify(snapshotDebugState())}`)
    const handleStalled = () => pushDebug(`event stalled ${JSON.stringify(snapshotDebugState())}`)
    const handleWaiting = () => pushDebug(`event waiting ${JSON.stringify(snapshotDebugState())}`)
    const handleSeeking = () => pushDebug(`event seeking ${JSON.stringify(snapshotDebugState())}`)
    const handleSeeked = () => pushDebug(`event seeked ${JSON.stringify(snapshotDebugState())}`)

    player.addEventListener('play', handlePlay)
    player.addEventListener('pause', handlePause)
    player.addEventListener('timeupdate', handleTime)
    player.addEventListener('loadedmetadata', handleLoaded)
    player.addEventListener('ended', handleEnded)
    player.addEventListener('error', handleError)
    player.addEventListener('stalled', handleStalled)
    player.addEventListener('waiting', handleWaiting)
    player.addEventListener('seeking', handleSeeking)
    player.addEventListener('seeked', handleSeeked)

    return () => {
      player.removeEventListener('play', handlePlay)
      player.removeEventListener('pause', handlePause)
      player.removeEventListener('timeupdate', handleTime)
      player.removeEventListener('loadedmetadata', handleLoaded)
      player.removeEventListener('ended', handleEnded)
      player.removeEventListener('error', handleError)
      player.removeEventListener('stalled', handleStalled)
      player.removeEventListener('waiting', handleWaiting)
      player.removeEventListener('seeking', handleSeeking)
      player.removeEventListener('seeked', handleSeeked)
    }
  }, [ensureFillerPlaying, isLikelyIOS, maybePrewarm, stopFiller])

  const togglePlayback = () => {
    const player = audioRef.current
    if (!player) return
    if (player.paused) {
      ensureFillerPlaying()
      player
        .play()
        .then(() => {
          stopFiller(250)
          setIsPlaying(true)
        })
        .catch(() => {
          setAutoPlayBlocked(true)
          setIsPlaying(false)
          stopFiller(0)
        })
    } else {
      player.pause()
      stopFiller(0)
    }
  }

  const jumpToIndex = (target: number) => {
    const list = playlistRef.current
    if (!list || list.resolved.length === 0) return
    clearRepeatRestartGuard()
    pendingEndedActionRef.current = false
    const size = list.resolved.length
    const nextIndex = ((target % size) + size) % size
    const player = audioRef.current
    if (player && !player.paused) ensureFillerPlaying()
    currentIndexRef.current = nextIndex
    playCountRef.current = 1
    setPlayCount(1)
    setCurrentIndex(nextIndex)
    pushDebug(`jumpToIndex target=${target} nextIndex=${nextIndex} ${JSON.stringify(snapshotDebugState())}`)
  }

  const nextTrack = () => jumpToIndex(currentIndexRef.current + 1)
  const prevTrack = () => jumpToIndex(currentIndexRef.current - 1)

  useEffect(() => () => pauseAll(), [pauseAll])

  return (
    <div className="grid gap-5 text-slate-900 dark:text-slate-100 lg:grid-cols-[2fr,1fr]">
      <div className="rounded-2xl bg-white/80 p-5 shadow-md dark:bg-slate-900/80 dark:shadow-black/30">
        <div className="flex items-start gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-md pr-2 py-1 text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            onClick={() => navigate('/')}
            // Always return to list; folder context handled by breadcrumbs there.
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

      {debugAudio && (
        <div className="fixed bottom-3 left-3 right-3 z-50 rounded-xl border border-slate-300 bg-white/95 p-3 text-xs text-slate-900 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-100">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold">Audio debug</div>
              <div className="truncate text-[11px] text-slate-600 dark:text-slate-300">
                {isLikelyIOS ? 'iOS detected' : 'non-iOS'} · idx {currentIndex} · {playCount}/{activeEntry?.repeats ?? '?'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md bg-slate-200 px-2 py-1 font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                onClick={() => setDebugLines([])}
              >
                Clear
              </button>
              <button
                type="button"
                className="rounded-md bg-indigo-600 px-2 py-1 font-semibold text-white"
                onClick={() => {
                  const text = debugLines.join('\n')
                  void navigator.clipboard?.writeText(text).catch(() => {})
                }}
              >
                Copy
              </button>
            </div>
          </div>
          <div className="max-h-[38vh] overflow-auto rounded-lg bg-slate-50 p-2 font-mono text-[11px] leading-snug dark:bg-slate-900">
            {debugLines.length === 0 ? (
              <div className="text-slate-500">(no logs yet)</div>
            ) : (
              debugLines.map((line, idx) => (
                <div key={idx} className="whitespace-pre-wrap">
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
