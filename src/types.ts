export interface Track {
  id: string
  file: File
  title: string
  artist: string
  album: string
  path: string
}

export interface Player {
  id: string
  name: string
  score: number
}

export type Phase = 'setup' | 'playing' | 'reveal' | 'finished'

export interface GameState {
  phase: Phase
  tracks: Track[]
  queue: Track[]
  roundIndex: number
  currentTrack: Track | null
  skipIndex: number
  players: Player[]
  lastPoints: number
  lastCorrect: boolean
  loadingRound: boolean
  error: string | null
}
