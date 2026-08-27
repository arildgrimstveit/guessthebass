/** Clip lengths in seconds. Index 0 = first clip; after 5 skips we reveal. */
export const CLIP_LADDER = [0.1, 0.5, 1, 2, 5] as const

/** Points awarded for a correct guess at each clip index. */
export const POINTS_LADDER = [5, 4, 3, 2, 1] as const

export const MAX_SKIPS = CLIP_LADDER.length // 5 skips → reveal

/** How many shuffled tracks to play in a session. */
export const ROUND_OPTIONS = [10, 20, 40, 'all'] as const
export type RoundLimit = (typeof ROUND_OPTIONS)[number]

export function buildSessionQueue<T>(tracks: T[], roundLimit: RoundLimit): T[] {
  const shuffled = shuffleTracks(tracks)
  if (roundLimit === 'all') return shuffled
  return shuffled.slice(0, Math.min(roundLimit, shuffled.length))
}

export function clipDuration(skipIndex: number): number {
  const i = Math.min(Math.max(0, skipIndex), CLIP_LADDER.length - 1)
  return CLIP_LADDER[i]
}

export function pointsForSkipIndex(skipIndex: number): number {
  if (skipIndex < 0 || skipIndex >= POINTS_LADDER.length) return 0
  return POINTS_LADDER[skipIndex]
}

export function formatClipLabel(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`
  return `${seconds}s`
}

/** Map elapsed seconds onto 5 equal bars (one per extend step). */
export function playbackProgressPercent(elapsed: number, skipIndex: number): number {
  const maxT = clipDuration(skipIndex)
  const t = Math.min(Math.max(0, elapsed), maxT)
  let i = 0
  while (i < CLIP_LADDER.length && t > CLIP_LADDER[i] + 1e-4) i += 1
  if (i >= CLIP_LADDER.length) return 100
  const prev = i === 0 ? 0 : CLIP_LADDER[i - 1]
  const span = CLIP_LADDER[i] - prev
  const local = span <= 0 ? 1 : (t - prev) / span
  return ((i + Math.min(Math.max(local, 0), 1)) / CLIP_LADDER.length) * 100
}

export function canSkip(skipIndex: number): boolean {
  return skipIndex < MAX_SKIPS
}

/** After a wrong guess or Skip: bump clip length, or signal reveal. */
export function nextSkipIndex(skipIndex: number): { skipIndex: number; reveal: boolean } {
  const next = skipIndex + 1
  if (next >= MAX_SKIPS) {
    return { skipIndex: MAX_SKIPS, reveal: true }
  }
  return { skipIndex: next, reveal: false }
}

/** True when the next Extend click plays the full track and shows the answer. */
export function willRevealNext(skipIndex: number): boolean {
  return nextSkipIndex(skipIndex).reveal
}

export function shuffleTracks<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
