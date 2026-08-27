import { get, set, del } from 'idb-keyval'
import { parseBlob } from 'music-metadata'
import type { Track } from '../types'

const HANDLE_KEY = 'gtb-directory-handle'

const AUDIO_EXT = new Set(['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus', 'webm'])

export function isAudioFileName(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return AUDIO_EXT.has(ext)
}

export function parseFilenameMeta(filename: string): { artist: string; title: string } {
  const base = filename.replace(/\.[^.]+$/, '')
  // Common: "Artist - Title" or "Artist – Title"
  const parts = base.split(/\s[-–—]\s/)
  if (parts.length >= 2) {
    return {
      artist: parts[0].trim() || 'Unknown Artist',
      title: parts.slice(1).join(' - ').trim() || base,
    }
  }
  return { artist: 'Unknown Artist', title: base || filename }
}

async function fileToTrack(file: File, path: string, index: number): Promise<Track | null> {
  if (!isAudioFileName(file.name)) return null

  const fromName = parseFilenameMeta(file.name)
  let title = fromName.title
  let artist = fromName.artist
  let album = ''

  try {
    const meta = await parseBlob(file, { duration: false })
    const c = meta.common
    if (c.title?.trim()) title = c.title.trim()
    if (c.artist?.trim()) artist = c.artist.trim()
    else if (c.artists?.length) artist = c.artists.join(', ')
    if (c.album?.trim()) album = c.album.trim()
  } catch {
    // keep filename fallback
  }

  return {
    id: `${path}::${file.name}::${file.size}::${index}`,
    file,
    title,
    artist,
    album,
    path,
  }
}

async function walkDirectory(
  dir: FileSystemDirectoryHandle,
  path: string,
  out: { file: File; path: string }[],
): Promise<void> {
  for await (const [name, handle] of dir) {
    if (handle.kind === 'file') {
      const fileHandle = handle as FileSystemFileHandle
      const file = await fileHandle.getFile()
      if (isAudioFileName(name)) {
        out.push({ file, path: path ? `${path}/${name}` : name })
      }
    } else if (handle.kind === 'directory') {
      await walkDirectory(
        handle as FileSystemDirectoryHandle,
        path ? `${path}/${name}` : name,
        out,
      )
    }
  }
}

export async function loadTracksFromDirectoryHandle(
  handle: FileSystemDirectoryHandle,
): Promise<Track[]> {
  const collected: { file: File; path: string }[] = []
  await walkDirectory(handle, '', collected)
  const tracks: Track[] = []
  for (let i = 0; i < collected.length; i++) {
    const item = collected[i]
    const track = await fileToTrack(item.file, item.path, i)
    if (track) tracks.push(track)
  }
  tracks.sort((a, b) => a.path.localeCompare(b.path))
  return tracks
}

export async function loadTracksFromFileList(files: FileList | File[]): Promise<Track[]> {
  const list = Array.from(files)
  const tracks: Track[] = []
  let i = 0
  for (const file of list) {
    // webkitRelativePath gives nested path when using directory input
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    if (!isAudioFileName(file.name)) continue
    const track = await fileToTrack(file, path, i++)
    if (track) tracks.push(track)
  }
  tracks.sort((a, b) => a.path.localeCompare(b.path))
  return tracks
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  const handle = await window.showDirectoryPicker({
    id: 'guess-the-bass-music',
    mode: 'read',
  })
  return handle
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await set(HANDLE_KEY, handle)
}

export async function loadSavedDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await get<FileSystemDirectoryHandle>(HANDLE_KEY)
    return handle ?? null
  } catch {
    return null
  }
}

export async function clearSavedDirectoryHandle(): Promise<void> {
  await del(HANDLE_KEY)
}

export async function verifyPermission(
  handle: FileSystemDirectoryHandle,
  request = false,
): Promise<boolean> {
  const opts = { mode: 'read' as const }
  const q = await handle.queryPermission(opts)
  if (q === 'granted') return true
  if (!request) return false
  const r = await handle.requestPermission(opts)
  return r === 'granted'
}
