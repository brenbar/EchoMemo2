const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const

export function formatDuration(seconds: number): string {
  if (Number.isNaN(seconds) || seconds < 0) return '0:00'
  const rounded = Math.round(seconds)
  const mins = Math.floor(rounded / 60)
  const secs = rounded % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1)
  const value = bytes / 1024 ** i
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${BYTE_UNITS[i]}`
}
