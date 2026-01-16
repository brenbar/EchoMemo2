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
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

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
    audioRef.current.loop = true
    audioRef.current
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => {
        setAutoPlayBlocked(true)
        setIsPlaying(false)
      })
  }, [objectUrl])

  useEffect(() => {
    const player = audioRef.current
    if (!player) return undefined

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    player.addEventListener('play', handlePlay)
    player.addEventListener('pause', handlePause)

    return () => {
      player.removeEventListener('play', handlePlay)
      player.removeEventListener('pause', handlePause)
    }
  }, [objectUrl])

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

  return (
    <div className="grid gap-5 lg:grid-cols-[2fr,1fr]">
      <div className="rounded-2xl bg-white/80 p-5 shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-500">Playback</p>
            <h1 className="text-2xl font-bold text-slate-900">{recording?.name ?? 'Loading…'}</h1>
            {recording && (
              <p className="text-sm text-slate-600">Duration: {formatDuration(recording.duration)} — loops automatically</p>
            )}
          </div>
          <button
            className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            onClick={() => navigate('/')}
          >
            Back to list
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <div className="mt-5 flex flex-col gap-3">
          <audio ref={audioRef} className="hidden" />
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            The recording loops. Use the controls to pause or resume as you read along.
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
              onClick={togglePlayback}
              disabled={!recording}
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            {autoPlayBlocked && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                Tap play to start audio on Safari.
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 shadow-inner">
        <h3 className="text-sm font-semibold text-slate-800">Script</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
          {recording?.scriptText || 'Script not available.'}
        </p>
      </div>
    </div>
  )
}
