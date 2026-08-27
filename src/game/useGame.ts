import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { audioEngine } from '../audio/engine'
import {
  canSkip,
  clipDuration,
  nextSkipIndex,
  pointsForSkipIndex,
  shuffleTracks,
} from './rules'
import { createTrackSearcher } from './search'
import type { GameState, Player, Track } from '../types'

function newPlayer(name: string): Player {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    score: 0,
  }
}

const initialState: GameState = {
  phase: 'setup',
  tracks: [],
  queue: [],
  roundIndex: 0,
  currentTrack: null,
  skipIndex: 0,
  energyStart: 0,
  players: [],
  lastPoints: 0,
  lastCorrect: false,
  loadingRound: false,
  error: null,
}

function prefetchUpcoming(queue: Track[], roundIndex: number) {
  const upcoming = queue[roundIndex + 1]
  if (upcoming) audioEngine.prefetchFile(upcoming.file, upcoming.id)
  else audioEngine.clearPrefetch()
}

export function useGame() {
  const [state, setState] = useState<GameState>(initialState)
  const stateRef = useRef(state)
  stateRef.current = state
  const loadGen = useRef(0)

  const search = useMemo(
    () => (state.tracks.length ? createTrackSearcher(state.tracks) : () => []),
    [state.tracks],
  )

  const setTracks = useCallback((tracks: Track[]) => {
    setState((s) => ({
      ...s,
      tracks,
      error: tracks.length ? null : 'No audio files found in that folder.',
    }))
  }, [])

  const addPlayer = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setState((s) => ({
      ...s,
      players: [...s.players, newPlayer(trimmed)],
    }))
  }, [])

  const removePlayer = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      players: s.players.filter((p) => p.id !== id),
    }))
  }, [])

  const startRound = useCallback(
    async (queue: Track[], roundIndex: number, players: Player[], holdPlayback = false) => {
      const gen = ++loadGen.current

      if (roundIndex >= queue.length) {
        audioEngine.stop()
        audioEngine.clearPrefetch()
        setState((s) => ({
          ...s,
          phase: 'finished',
          currentTrack: null,
          loadingRound: false,
        }))
        return
      }

      const track = queue[roundIndex]
      setState((s) => ({
        ...s,
        phase: 'playing',
        queue,
        roundIndex,
        currentTrack: track,
        skipIndex: 0,
        loadingRound: true,
        error: null,
        lastPoints: 0,
        lastCorrect: false,
        players,
      }))

      try {
        await audioEngine.resume()
        const { energyStart } = await audioEngine.loadFile(track.file, track.id, {
          holdPlayback,
        })
        if (gen !== loadGen.current) return
        audioEngine.playClip(clipDuration(0))
        setState((s) => ({
          ...s,
          energyStart,
          loadingRound: false,
        }))
        prefetchUpcoming(queue, roundIndex)
      } catch (err) {
        if (gen !== loadGen.current) return
        const message = err instanceof Error ? err.message : 'Could not decode this track'
        setState((s) => ({
          ...s,
          loadingRound: false,
          error: `Skipped unreadable track: ${track.title} (${message})`,
        }))
        window.setTimeout(() => {
          if (gen !== loadGen.current) return
          void startRound(queue, roundIndex + 1, players, false)
        }, 800)
      }
    },
    [],
  )

  const beginGame = useCallback(() => {
    const s = stateRef.current
    if (s.tracks.length === 0) {
      setState((prev) => ({ ...prev, error: 'Load a music folder first.' }))
      return
    }
    const queue = shuffleTracks(s.tracks)
    const players = s.players.map((p) => ({ ...p, score: 0 }))
    setState((prev) => ({
      ...prev,
      phase: 'playing',
      queue,
      players,
      roundIndex: 0,
      skipIndex: 0,
      error: null,
      loadingRound: true,
    }))
    void startRound(queue, 0, players, false)
  }, [startRound])

  const replay = useCallback(() => {
    const s = stateRef.current
    if (s.phase !== 'playing' || s.loadingRound) return
    void audioEngine.resume().then(() => {
      audioEngine.playClip(clipDuration(s.skipIndex), 'restart')
    })
  }, [])

  const applySkip = useCallback(() => {
    const s = stateRef.current
    if (s.phase !== 'playing' || s.loadingRound) return
    if (!canSkip(s.skipIndex)) {
      audioEngine.playFull()
      prefetchUpcoming(s.queue, s.roundIndex)
      const next = { ...s, phase: 'reveal' as const, lastPoints: 0, lastCorrect: false }
      stateRef.current = next
      setState(next)
      return
    }
    const { skipIndex, reveal } = nextSkipIndex(s.skipIndex)
    if (reveal) {
      audioEngine.playFull()
      prefetchUpcoming(s.queue, s.roundIndex)
      const next = {
        ...s,
        skipIndex,
        phase: 'reveal' as const,
        lastPoints: 0,
        lastCorrect: false,
      }
      stateRef.current = next
      setState(next)
      return
    }
    void audioEngine.resume()
    audioEngine.playClip(clipDuration(skipIndex), 'extend')
    const next = { ...s, skipIndex }
    stateRef.current = next
    setState(next)
  }, [])

  const submitGuess = useCallback((guessed: Track) => {
    const s = stateRef.current
    if (s.phase !== 'playing' || !s.currentTrack || s.loadingRound) return
    const correct = guessed.id === s.currentTrack.id
    if (correct) {
      audioEngine.stop()
      const points = pointsForSkipIndex(s.skipIndex)
      audioEngine.playFull()
      prefetchUpcoming(s.queue, s.roundIndex)
      const next = { ...s, phase: 'reveal' as const, lastPoints: points, lastCorrect: true }
      stateRef.current = next
      setState(next)
      return
    }
    if (!canSkip(s.skipIndex)) {
      audioEngine.playFull()
      prefetchUpcoming(s.queue, s.roundIndex)
      const next = { ...s, phase: 'reveal' as const, lastPoints: 0, lastCorrect: false }
      stateRef.current = next
      setState(next)
      return
    }
    const { skipIndex, reveal } = nextSkipIndex(s.skipIndex)
    if (reveal) {
      audioEngine.playFull()
      prefetchUpcoming(s.queue, s.roundIndex)
      const next = {
        ...s,
        skipIndex,
        phase: 'reveal' as const,
        lastPoints: 0,
        lastCorrect: false,
      }
      stateRef.current = next
      setState(next)
      return
    }
    void audioEngine.resume()
    audioEngine.playClip(clipDuration(skipIndex), 'extend')
    const next = { ...s, skipIndex }
    stateRef.current = next
    setState(next)
  }, [])

  const nextRound = useCallback(() => {
    const s = stateRef.current
    audioEngine.stop()
    setState((prev) => ({ ...prev, loadingRound: true }))
    void startRound(s.queue, s.roundIndex + 1, s.players, false)
  }, [startRound])

  const awardPlayer = useCallback((playerId: string) => {
    const s = stateRef.current
    if (s.phase !== 'reveal' || !s.lastCorrect) return
    const players = s.players.map((p) =>
      p.id === playerId ? { ...p, score: p.score + s.lastPoints } : p,
    )
    stateRef.current = { ...s, players }
    audioEngine.stop()
    setState((prev) => ({ ...prev, players, loadingRound: true }))
    void startRound(s.queue, s.roundIndex + 1, players, false)
  }, [startRound])

  const skipTrack = useCallback(() => {
    const s = stateRef.current
    if (s.phase === 'setup' || s.phase === 'finished') return
    const nextIndex = s.roundIndex + 1
    const next = { ...s, roundIndex: nextIndex, loadingRound: true, error: null }
    stateRef.current = next
    setState(next)
    void startRound(s.queue, nextIndex, s.players, false)
  }, [startRound])

  const backToSetup = useCallback(() => {
    loadGen.current += 1
    audioEngine.stop()
    audioEngine.clearPrefetch()
    setState((s) => ({
      ...initialState,
      tracks: s.tracks,
      players: s.players.map((p) => ({ ...p, score: 0 })),
    }))
  }, [])

  useEffect(() => {
    return () => {
      audioEngine.dispose()
    }
  }, [])

  return {
    state,
    setTracks,
    addPlayer,
    removePlayer,
    beginGame,
    replay,
    applySkip,
    submitGuess,
    awardPlayer,
    nextRound,
    skipTrack,
    backToSetup,
    search,
  }
}
