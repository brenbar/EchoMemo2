export interface LibraryItemBase {
  id: string
  name: string
  createdAt: number
  parent: string | null
  isFolder?: boolean
}

export interface FolderItem extends LibraryItemBase {
  isFolder: true
}

export interface RecordingMeta extends LibraryItemBase {
  duration: number
  size: number
  scriptText: string
  isFolder?: false
}

export type LibraryItem = RecordingMeta | FolderItem

export interface RecordingWithData extends RecordingMeta {
  blob: Blob
}

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}
