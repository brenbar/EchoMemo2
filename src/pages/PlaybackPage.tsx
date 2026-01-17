import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRecordings } from '../state/RecordingsContext'
import type { RecordingWithData } from '../types'
import { formatDuration } from '../utils/format'

export default function PlaybackPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { fetchRecording } = useRecordings()
  const [recording, setRecording] = useState<RecordingWithData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoPlayBlocked, setAutoPlayBlocked] = useState(false)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const scrubRef = useRef<HTMLDivElement | null>(null)
  const isScrubbingRef = useRef(false)

  // Web Audio primitives for seamless looping without filler tracks.
  const audioCtxRef = useRef<AudioContext | null>(null)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const startAtRef = useRef(0)
  const offsetRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  function stopAll() {
    pauseSource()
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
  }

  function pauseSource() {
    const ctx = audioCtxRef.current
    const src = sourceRef.current
    if (!ctx || !src) return
    const dur = bufferRef.current?.duration ?? 0
    const elapsed = ctx.currentTime - startAtRef.current
    offsetRef.current = dur ? (elapsed % dur) : 0
    src.stop()
    sourceRef.current = null
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    setIsPlaying(false)
    if (audioRef.current) audioRef.current.pause()
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
  }

  function startSource(offset = 0) {
    const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as
      | typeof AudioContext
      | undefined
    if (!Ctor) {
      setAutoPlayBlocked(true)
      return
    }
    const ctx = audioCtxRef.current ?? new Ctor()
    audioCtxRef.current = ctx
    if (!bufferRef.current) return
    try {
      void ctx.resume()
      const src = ctx.createBufferSource()
      const bufDur = bufferRef.current.duration || 0
      const startOffset = bufDur ? Math.max(0, Math.min(offset, bufDur)) : offset
      src.buffer = bufferRef.current
      src.loop = true
      src.connect(ctx.destination)
      startAtRef.current = ctx.currentTime - startOffset
      sourceRef.current = src
      src.start(0, startOffset)
      if (audioRef.current) audioRef.current.currentTime = startOffset
      if (audioRef.current) {
        audioRef.current.muted = true
        audioRef.current.volume = 0
        audioRef.current.loop = true
        void audioRef.current.play().catch(() => {})
      }
      setIsPlaying(true)
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
      tick()
    } catch {
      setAutoPlayBlocked(true)
    }
  }

  function tick() {
    const ctx = audioCtxRef.current
    const buf = bufferRef.current
    if (!ctx || !buf || !sourceRef.current) return
    const elapsed = ctx.currentTime - startAtRef.current
    const position = ((elapsed % buf.duration) + buf.duration) % buf.duration
    if (!isScrubbingRef.current) setCurrentTime(position)
    if (audioRef.current) audioRef.current.currentTime = position
    if ('mediaSession' in navigator && duration) {
      try {
        navigator.mediaSession.setPositionState({ duration: duration || buf.duration || 0, playbackRate: 1, position })
      } catch {
        // setPositionState not supported everywhere
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    if (!id) return undefined
    fetchRecording(id)
      .then((data) => {
        if (!data) {
          setError('Recording not found. It may have been deleted.')
          return
        }
        const url = URL.createObjectURL(data.blob)
        setObjectUrl(url)
        setRecording(data)
      })
      .catch(() => setError('Unable to load recording.'))
    return undefined
  }, [fetchRecording, id])

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])

  useEffect(() => {
    isScrubbingRef.current = isScrubbing
  }, [isScrubbing])

  useEffect(() => {
    if (!objectUrl) return

    let cancelled = false

    if (audioRef.current) {
      audioRef.current.src = objectUrl
      audioRef.current.loop = true
      audioRef.current.load()
    }

    const ensureContext = () => {
      if (audioCtxRef.current) return audioCtxRef.current
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as
        | typeof AudioContext
        | undefined
      if (!Ctor) throw new Error('Web Audio unavailable')
      const ctx = new Ctor()
      audioCtxRef.current = ctx
      return ctx
    }

    const loadAndPlay = async () => {
      try {
        const ctx = ensureContext()
        const response = await fetch(objectUrl)
        const arrayBuffer = await response.arrayBuffer()
        const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0))
        if (cancelled) return
        bufferRef.current = decoded
        setDuration(decoded.duration)
        offsetRef.current = 0
        setCurrentTime(0)
        await ctx.resume()
        startSource(offsetRef.current)
      } catch {
        if (!cancelled) setAutoPlayBlocked(true)
      }
    }

    loadAndPlay()

    return () => {
      cancelled = true
    }
  }, [objectUrl])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    if (recording) {
      ms.metadata = new MediaMetadata({
        title: recording.name,
        artist: recording.scriptText ? recording.scriptText.slice(0, 80) : 'Memo',
      })
    }

    const handlePlay = () => startSource(offsetRef.current)
    const handlePause = () => pauseSource()
    ms.setActionHandler('play', handlePlay)
    ms.setActionHandler('pause', handlePause)
    ms.setActionHandler('stop', handlePause)

    return () => {
      ms.setActionHandler('play', null)
      ms.setActionHandler('pause', null)
      ms.setActionHandler('stop', null)
    }
  }, [recording])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const handleEnded = () => {
      offsetRef.current = 0
      if (audioRef.current) audioRef.current.currentTime = 0
      setCurrentTime(0)
      startSource(0)
    }
    el.addEventListener('ended', handleEnded)
    return () => el.removeEventListener('ended', handleEnded)
  }, [objectUrl])
  useEffect(() => {
    return () => stopAll()
  }, [])

  const togglePlayback = () => {
    if (isPlaying) {
      pauseSource()
    } else {
      startSource(offsetRef.current)
    }
  }

  const seekFromClientX = (clientX: number) => {
    const bar = scrubRef.current
    const effectiveDuration = duration || audioRef.current?.duration || recording?.duration || 0
    if (!bar || !effectiveDuration) return null
    const rect = bar.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * effectiveDuration
  }

  const commitSeek = (time: number | null) => {
    if (time === null) return
    const bufDur = bufferRef.current?.duration ?? 0
    const normalized = bufDur ? ((time % bufDur) + bufDur) % bufDur : time
    offsetRef.current = normalized
    setCurrentTime(normalized)
    if (audioRef.current) audioRef.current.currentTime = normalized
    if (isPlaying) startSource(normalized)
  }

  useEffect(() => {
    if (!isScrubbing) return undefined
    const handleMove = (event: PointerEvent) => {
      event.preventDefault()
      const time = seekFromClientX(event.clientX)
      if (time !== null) setCurrentTime(time)
    }
    const handleUp = (event: PointerEvent) => {
      const time = seekFromClientX(event.clientX)
      commitSeek(time)
      setIsScrubbing(false)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [isScrubbing, duration])

  // Stop and clean up on unmount
  useEffect(() => () => stopAll(), [])

  return (
    <div className="grid gap-5 text-slate-900 dark:text-slate-100 lg:grid-cols-[2fr,1fr]">
      <div className="rounded-2xl bg-white/80 p-5 shadow-md dark:bg-slate-900/80 dark:shadow-black/30">
        <div className="flex items-start gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-md pr-2 py-1 text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            onClick={() => navigate('/')}
            aria-label="Back to list"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 5.75 9.25 12l6.25 6.25" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 12h14" />
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{recording?.name ?? 'Loading…'}</h1>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <div className="pt-4 mt-5 flex flex-col gap-3">
          <audio ref={audioRef} className="hidden" onEnded={() => {
            offsetRef.current = 0
            if (audioRef.current) audioRef.current.currentTime = 0
            setCurrentTime(0)
            startSource(0)
          }} />
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <button
                className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
                onClick={togglePlayback}
                disabled={!recording}
                aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
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
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div
                  ref={scrubRef}
                  className="relative h-4 cursor-pointer rounded-full bg-slate-200/90 shadow-inner transition hover:bg-slate-200 dark:bg-slate-700"
                  onPointerDown={(event) => {
                    const effectiveDuration = duration || audioRef.current?.duration || recording?.duration || 0
                    if (!effectiveDuration) return
                    const time = seekFromClientX(event.clientX)
                    setIsScrubbing(true)
                    if (time !== null) {
                      setCurrentTime(time)
                      commitSeek(time)
                    }
                  }}
                  onClick={(event) => {
                    const time = seekFromClientX(event.clientX)
                    if (time !== null) {
                      setCurrentTime(time)
                      commitSeek(time)
                    }
                  }}
                  role="slider"
                  aria-valuemin={0}
                  aria-valuemax={duration || 0}
                  aria-valuenow={currentTime}
                  aria-label="Seek audio"
                >
                  <div className="absolute inset-0 overflow-hidden rounded-full">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-sky-400"
                      style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                    />
                  </div>
                  <div
                    className="absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full border border-white bg-white shadow transition-transform dark:border-slate-700 dark:bg-slate-900"
                    style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%`, transform: 'translate(-50%, -50%)' }}
                  />
                </div>
                <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span>{formatDuration(currentTime)}</span>
                  <span>{formatDuration(duration || recording?.duration || 0)}</span>
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
      </div>

      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 shadow-inner dark:border-slate-700 dark:bg-slate-900/60">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Script</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
          {recording?.scriptText || 'Script not available.'}
        </p>
      </div>
    </div>
  )
}
