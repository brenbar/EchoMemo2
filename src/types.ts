export type LibraryItemKind = 'folder' | 'recording' | 'playlist'

export interface LibraryItemBase {
  id: string
  name: string
  createdAt: number
  parent: string | null
  kind?: LibraryItemKind
  isFolder?: boolean
  isPlaylist?: boolean
}

export interface FolderItem extends LibraryItemBase {
  kind: 'folder'
  isFolder: true
}

export interface RecordingMeta extends LibraryItemBase {
  kind: 'recording'
  duration: number
  size: number
  scriptText: string
  isFolder?: false
  isPlaylist?: false
}

export interface PlaylistEntry {
  recordingId: string
  repeats: number
}

export interface PlaylistMeta extends LibraryItemBase {
  kind: 'playlist'
  entries: PlaylistEntry[]
  isFolder?: false
  isPlaylist: true
}

export type LibraryItem = RecordingMeta | FolderItem | PlaylistMeta

export interface RecordingWithData extends RecordingMeta {
  blob: Blob
}

export interface PlaylistResolvedEntry {
  recording: RecordingWithData
  repeats: number
}

export interface PlaylistWithData extends PlaylistMeta {
  resolved: PlaylistResolvedEntry[]
}

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}
