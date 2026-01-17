import type { FolderItem, LibraryItem, RecordingWithData } from '../types'

const FREE_FOLDER_ID = '_free'
const SAMPLE_DURATION_SECONDS = 2
const SAMPLE_RATE = 44100
const CREATED_AT = 1
const HOST_OVERRIDE_KEY = '__ECHO_MEMO_HOST_OVERRIDE__'

const SAMPLE_DEFS = [
  { id: '__free-440', name: 'Free 440 Hz', frequency: 440 },
  { id: '__free-660', name: 'Free 660 Hz', frequency: 660 },
  { id: '__free-880', name: 'Free 880 Hz', frequency: 880 },
]

const freeFolder: FolderItem = {
  id: FREE_FOLDER_ID,
  name: FREE_FOLDER_ID,
  createdAt: CREATED_AT,
  parent: null,
  kind: 'folder',
  isFolder: true,
}

let cachedRecordings: RecordingWithData[] | null = null
let shouldIncludeCache: boolean | null = null

type HostOverrideWindow = typeof window & {
  [HOST_OVERRIDE_KEY]?: string
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i))
  }
}

function createToneWavBlob(frequency: number): Blob {
  const frameCount = SAMPLE_DURATION_SECONDS * SAMPLE_RATE
  const dataLength = frameCount * 2 // 16-bit mono
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true) // byte rate (sampleRate * channels * bytesPerSample)
  view.setUint16(32, 2, true) // block align (channels * bytesPerSample)
  view.setUint16(34, 16, true) // bits per sample
  writeString(view, 36, 'data')
  view.setUint32(40, dataLength, true)

  const amplitude = 0.25 * 0x7fff
  let offset = 44
  for (let i = 0; i < frameCount; i += 1) {
    const sample = Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE)
    view.setInt16(offset, Math.round(sample * amplitude), true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

function ensureFreeRecordings(): RecordingWithData[] {
  if (cachedRecordings) return cachedRecordings

  cachedRecordings = SAMPLE_DEFS.map((sample, index) => {
    const blob = createToneWavBlob(sample.frequency)
    return {
      id: sample.id,
      name: sample.name,
      createdAt: CREATED_AT + index + 1,
      parent: FREE_FOLDER_ID,
      duration: SAMPLE_DURATION_SECONDS,
      size: blob.size,
      scriptText: `${sample.name} (2 second test tone)`,
      kind: 'recording',
      isFolder: false,
      isPlaylist: false,
      blob,
    }
  })

  return cachedRecordings
}

export function getFreeLibraryItems(): LibraryItem[] {
  if (!shouldIncludeFreeSamples()) return []
  const recordings = ensureFreeRecordings()
  const metas = recordings.map<LibraryItem>(({ blob: _blob, ...meta }) => meta)
  return [freeFolder, ...metas]
}

export function getFreeRecording(id: string): RecordingWithData | null {
  if (!shouldIncludeFreeSamples()) return null
  const recordings = ensureFreeRecordings()
  return recordings.find((recording) => recording.id === id) ?? null
}

export function getFreeTotalBytes(): number {
  if (!shouldIncludeFreeSamples()) return 0
  return ensureFreeRecordings().reduce((total, rec) => total + (rec.size ?? 0), 0)
}

export { FREE_FOLDER_ID }

function getCandidateHostname(): string {
  if (typeof window === 'undefined') return ''
  const override = (window as HostOverrideWindow)[HOST_OVERRIDE_KEY]
  if (typeof override === 'string' && override.trim()) return override.trim()
  return window.location.hostname ?? ''
}

function isDevHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  if (!normalized) return false
  if (normalized === 'localhost' || normalized === '::1' || normalized === '[::1]') return true
  if (normalized.startsWith('127.')) return true
  if (normalized.startsWith('192.168.')) return true

  const ipMatch = normalized.match(/(\d{1,3}(?:\.\d{1,3}){3})/)
  if (ipMatch) {
    const ip = ipMatch[1]
    return ip.startsWith('192.168.') || ip.startsWith('127.')
  }

  return false
}

export function shouldIncludeFreeSamples(): boolean {
  if (shouldIncludeCache !== null) return shouldIncludeCache
  shouldIncludeCache = isDevHostname(getCandidateHostname())
  return shouldIncludeCache
}
