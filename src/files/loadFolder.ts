import { get, set, del } from 'idb-keyval'
import { parseBlob } from 'music-metadata'
import type { Track } from '../types'

const HANDLE_KEY = 'gtb-directory-handle'

const AUDIO_EXT = new Set(['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus', 'webm'])

const YIELD_EVERY = 16
const REPORT_MS = 70

export type FolderLoadProgress = {
  phase: 'scan' | 'read'
  done: number
  total: number
}

function isAudioFileName(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return AUDIO_EXT.has(ext)
}

function parseFilenameMeta(filename: string): { artist: string; title: string } {
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

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

function createProgress(onProgress?: (p: FolderLoadProgress) => void) {
  let lastEmit = 0
  let ticks = 0

  const emit = (p: FolderLoadProgress, force = false) => {
    if (!onProgress) return
    const now = performance.now()
    if (!force && now - lastEmit < REPORT_MS) return
    lastEmit = now
    onProgress(p)
  }

  const pulse = async (p: FolderLoadProgress) => {
    ticks += 1
    const finished = p.phase === 'read' && p.total > 0 && p.done >= p.total
    if (finished || ticks % YIELD_EVERY === 0) {
      emit(p, true)
      await yieldToUi()
      return
    }
    emit(p)
  }

  return { emit, pulse }
}

async function walkDirectory(
  dir: FileSystemDirectoryHandle,
  path: string,
  out: { file: File; path: string }[],
  onEntry: (found: number) => Promise<void>,
): Promise<void> {
  for await (const [name, handle] of dir) {
    if (handle.kind === 'file') {
      if (isAudioFileName(name)) {
        const file = await (handle as FileSystemFileHandle).getFile()
        out.push({ file, path: path ? `${path}/${name}` : name })
      }
    } else if (handle.kind === 'directory') {
      await walkDirectory(
        handle as FileSystemDirectoryHandle,
        path ? `${path}/${name}` : name,
        out,
        onEntry,
      )
    }
    await onEntry(out.length)
  }
}

async function readCollected(
  collected: { file: File; path: string }[],
  progress: ReturnType<typeof createProgress>,
): Promise<Track[]> {
  const total = collected.length
  progress.emit({ phase: 'read', done: 0, total }, true)
  const tracks: Track[] = []
  for (let i = 0; i < collected.length; i++) {
    const item = collected[i]
    const track = await fileToTrack(item.file, item.path, i)
    if (track) tracks.push(track)
    await progress.pulse({ phase: 'read', done: i + 1, total })
  }
  tracks.sort((a, b) => a.path.localeCompare(b.path))
  return tracks
}

export async function loadTracksFromDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  onProgress?: (p: FolderLoadProgress) => void,
): Promise<Track[]> {
  const progress = createProgress(onProgress)
  const collected: { file: File; path: string }[] = []
  progress.emit({ phase: 'scan', done: 0, total: 0 }, true)
  await walkDirectory(handle, '', collected, (found) =>
    progress.pulse({ phase: 'scan', done: found, total: 0 }),
  )
  return readCollected(collected, progress)
}

export async function loadTracksFromFileList(
  files: FileList | File[],
  onProgress?: (p: FolderLoadProgress) => void,
): Promise<Track[]> {
  const progress = createProgress(onProgress)
  const collected: { file: File; path: string }[] = []
  for (const file of Array.from(files)) {
    if (!isAudioFileName(file.name)) continue
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    collected.push({ file, path })
  }
  return readCollected(collected, progress)
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
