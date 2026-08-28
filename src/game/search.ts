import Fuse from 'fuse.js'
import type { Track } from '../types'

export interface SearchHit {
  track: Track
  score: number
}

export function createTrackSearcher(tracks: Track[]) {
  const fuse = new Fuse(tracks, {
    keys: [
      { name: 'title', weight: 0.5 },
      { name: 'artist', weight: 0.4 },
      { name: 'album', weight: 0.1 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 1,
  })

  return (query: string, limit = 80): SearchHit[] => {
    const q = query.trim()
    if (!q) return []
    return fuse
      .search(q)
      .slice(0, limit)
      .map((r) => ({
        track: r.item,
        score: r.score ?? 1,
      }))
  }
}
