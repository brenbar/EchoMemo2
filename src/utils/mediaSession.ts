export type MediaMetadataInitSafe = {
  title: string
  artist?: string
  album?: string
  artwork?: Array<{ src: string; sizes?: string; type?: string }>
}

function getMediaSession(): MediaSession | null {
  if (typeof navigator === 'undefined') return null
  const anyNav = navigator as Navigator & { mediaSession?: MediaSession }
  return anyNav.mediaSession ?? null
}

export function hasMediaSession(): boolean {
  return getMediaSession() !== null
}

export function setMediaMetadata(metadata: MediaMetadataInitSafe | null) {
  const session = getMediaSession()
  if (!session) return

  try {
    if (!metadata) {
      session.metadata = null
      return
    }

    // MediaMetadata is not available in every browser/runtime.
    const Ctor = (globalThis as unknown as { MediaMetadata?: typeof MediaMetadata }).MediaMetadata
    if (!Ctor) return

    session.metadata = new Ctor({
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      artwork: metadata.artwork,
    })
  } catch {
    // Best-effort; ignore.
  }
}

export function setMediaPlaybackState(state: MediaSessionPlaybackState) {
  const session = getMediaSession()
  if (!session) return
  try {
    session.playbackState = state
  } catch {
    // ignore
  }
}

export function setMediaPositionState(params: { duration: number; playbackRate?: number; position: number }) {
  const session = getMediaSession()
  if (!session) return

  // Not all browsers support setPositionState.
  const anySession = session as MediaSession & {
    setPositionState?: (state: MediaPositionState) => void
  }

  if (typeof anySession.setPositionState !== 'function') return

  const duration = Number.isFinite(params.duration) ? params.duration : 0
  const position = Number.isFinite(params.position) ? params.position : 0
  const playbackRate = Number.isFinite(params.playbackRate ?? 1) ? (params.playbackRate ?? 1) : 1

  if (duration <= 0) return

  try {
    anySession.setPositionState({ duration, playbackRate, position: Math.min(duration, Math.max(0, position)) })
  } catch {
    // ignore
  }
}

export function setMediaActionHandler(action: MediaSessionAction, handler: ((details: MediaSessionActionDetails) => void) | null) {
  const session = getMediaSession()
  if (!session) return
  try {
    session.setActionHandler(action, handler)
  } catch {
    // Some actions aren't supported by some browsers.
  }
}

export function clearMediaActionHandlers() {
  if (!hasMediaSession()) return

  const actions: MediaSessionAction[] = [
    'play',
    'pause',
    'stop',
    'seekbackward',
    'seekforward',
    'seekto',
    'previoustrack',
    'nexttrack',
  ]

  for (const action of actions) {
    setMediaActionHandler(action, null)
  }
}
