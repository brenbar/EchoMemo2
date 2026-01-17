import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRecordings } from '../state/RecordingsContext'
import type { RecordingWithData } from '../types'
import { formatDuration } from '../utils/format'
import { useAudioContinuity } from '../utils/audioContinuity'

export default function PlaybackPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { fetchRecording } = useRecordings()
  const [recording, setRecording] = useState<RecordingWithData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoPlayBlocked, setAutoPlayBlocked] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const scrubRef = useRef<HTMLDivElement | null>(null)
  const { ensureFillerPlaying, stopFiller, maybePrewarm, pauseAll } = useAudioContinuity(audioRef)

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
    if (!audioRef.current || !objectUrl) return
    audioRef.current.src = objectUrl
    audioRef.current.loop = false
    ensureFillerPlaying()
    audioRef.current
      .play()
      .then(() => {
        stopFiller(300)
        setIsPlaying(true)
      })
      .catch(() => {
        setAutoPlayBlocked(true)
        setIsPlaying(false)
        stopFiller(0)
      })
  }, [ensureFillerPlaying, objectUrl, stopFiller])

  useEffect(() => {
    const player = audioRef.current
    if (!player) return undefined

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => {
      setIsPlaying(false)
      stopFiller(0)
    }
    const handleTime = () => {
      if (!isScrubbing) setCurrentTime(player.currentTime)
      maybePrewarm()
    }
    const handleLoaded = () => {
      setDuration(Number.isFinite(player.duration) ? player.duration : recording?.duration ?? 0)
    }
    const handleEnded = () => {
      ensureFillerPlaying()
      player.currentTime = 0
      void player
        .play()
        .then(() => {
          stopFiller(200)
          setIsPlaying(true)
        })
        .catch(() => {
          setIsPlaying(false)
          stopFiller(0)
        })
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
  }, [ensureFillerPlaying, isScrubbing, maybePrewarm, objectUrl, recording?.duration, stopFiller])

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

  const seekFromClientX = (clientX: number) => {
    const bar = scrubRef.current
    if (!bar || !duration) return null
    const rect = bar.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * duration
  }

  const commitSeek = (time: number | null) => {
    const player = audioRef.current
    if (!player || time === null) return
    player.currentTime = time
    setCurrentTime(time)
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

  useEffect(() => () => pauseAll(), [pauseAll])

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
          <audio ref={audioRef} className="hidden" />
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
                    if (!duration) return
                    const time = seekFromClientX(event.clientX)
                    setIsScrubbing(true)
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
