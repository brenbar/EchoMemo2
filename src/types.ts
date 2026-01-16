export interface RecordingMeta {
  id: string
  name: string
  duration: number
  size: number
  scriptText: string
  createdAt: number
}

export interface RecordingWithData extends RecordingMeta {
  blob: Blob
}

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}
