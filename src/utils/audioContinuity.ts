import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'

// Short silent MP3 used to keep audio alive when switching tracks on iOS lock screen.
const SILENT_MP3 =
  'data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAACcQCAAwACABAAZGF0YQAAAAA='

export function useAudioContinuity(mainAudioRef: MutableRefObject<HTMLAudioElement | null>) {
  const fillerRef = useRef<HTMLAudioElement | null>(null)
  const stopTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const filler = new Audio(SILENT_MP3)
    filler.loop = true
    filler.preload = 'auto'
    filler.volume = 0.02
    fillerRef.current = filler
    return () => {
      if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current)
      filler.pause()
      fillerRef.current = null
    }
  }, [])

  const ensureFillerPlaying = useCallback(() => {
    const filler = fillerRef.current
    if (!filler) return
    if (!filler.paused && !filler.ended) return
    filler.currentTime = 0
    void filler.play().catch(() => {})
  }, [])

  const stopFiller = useCallback((delayMs = 200) => {
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current)
    stopTimerRef.current = window.setTimeout(() => {
      const filler = fillerRef.current
      if (!filler) return
      filler.pause()
    }, delayMs)
  }, [])

  const maybePrewarm = useCallback(
    (windowSeconds = 0.35) => {
      const player = mainAudioRef.current
      if (!player || !Number.isFinite(player.duration) || player.paused) return
      const remaining = player.duration - player.currentTime
      if (remaining > 0 && remaining <= windowSeconds) ensureFillerPlaying()
    },
    [ensureFillerPlaying, mainAudioRef],
  )

  const pauseAll = useCallback(() => {
    const filler = fillerRef.current
    if (filler) filler.pause()
    const player = mainAudioRef.current
    if (player) player.pause()
  }, [mainAudioRef])

  return { ensureFillerPlaying, stopFiller, maybePrewarm, pauseAll }
}
