import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  CLIP_LADDER,
  MAX_PLAYER_NAME_LENGTH,
  MAX_SKIPS,
  clipDuration,
  formatClipLabel,
  pointsForSkipIndex,
  willRevealNext,
} from '../game/rules'
import { ClipMeter } from './ClipMeter'
import { TrackScrubber } from './TrackScrubber'
import { VolumeControl } from './VolumeControl'
import { audioEngine } from '../audio/engine'
import type { SearchHit } from '../game/search'
import type { GameState, Player, Track } from '../types'
import { isMobileUi } from './device'

interface PlayScreenProps {
  state: GameState
  search: (query: string) => SearchHit[]
  onReplay: () => void
  onSkip: () => void
  onGuess: (track: Track) => void
  onAward: (playerId: string) => void
  onNext: () => void
  onSkipTrack: () => void
  onBackToSetup: () => void
}

export function PlayScreen({
  state,
  search,
  onReplay,
  onSkip,
  onGuess,
  onAward,
  onNext,
  onSkipTrack,
  onBackToSetup,
}: PlayScreenProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const hits = useMemo(() => search(query), [search, query])
  const hitsRef = useRef(hits)
  const selectedRef = useRef(selected)
  hitsRef.current = hits
  selectedRef.current = selected

  function guessHighlighted() {
    const list = hitsRef.current
    const hit = list[selectedRef.current] ?? list[0]
    if (hit) onGuess(hit.track)
  }

  useEffect(() => {
    setQuery('')
    setSelected(0)
  }, [state.roundIndex, state.phase])

  useEffect(() => {
    setSelected(0)
  }, [query])

  useEffect(() => {
    if (selected >= hits.length) setSelected(0)
  }, [hits.length, selected])

  useEffect(() => {
    if (state.phase === 'playing' && !state.loadingRound && !isMobileUi()) {
      inputRef.current?.focus()
    }
  }, [state.phase, state.loadingRound, state.roundIndex])

  useEffect(() => {
    const el = listRef.current?.querySelector('[aria-selected="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected, hits])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const playing = state.phase === 'playing' && !state.loadingRound
      const enter = e.key === 'Enter'
      if (playing && enter && hitsRef.current.length) {
        e.preventDefault()
        e.stopPropagation()
        guessHighlighted()
        return
      }
      if (playing) {
        if (e.code === 'Space' && document.activeElement !== inputRef.current) {
          e.preventDefault()
          onReplay()
          return
        }
        if (e.key === 'ArrowDown' && hitsRef.current.length) {
          e.preventDefault()
          setSelected((i) => Math.min(i + 1, hitsRef.current.length - 1))
        } else if (e.key === 'ArrowUp' && hitsRef.current.length) {
          e.preventDefault()
          setSelected((i) => Math.max(i - 1, 0))
        }
      }
      if (
        state.phase === 'reveal' &&
        e.code === 'Space'
      ) {
        e.preventDefault()
        audioEngine.togglePause()
        return
      }
      if (
        state.phase === 'reveal' &&
        !(state.lastCorrect && state.players.length) &&
        enter
      ) {
        e.preventDefault()
        onNext()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [state.phase, state.loadingRound, state.lastCorrect, state.players.length, onReplay, onGuess, onNext])

  const clipSec = clipDuration(Math.min(state.skipIndex, CLIP_LADDER.length - 1))
  const pointsNow = pointsForSkipIndex(state.skipIndex)
  const roundLabel = `${state.roundIndex + 1} / ${state.queue.length}`
  const revealNext = willRevealNext(state.skipIndex)

  if (state.phase === 'finished') {
    return (
      <FinishScreen
        players={state.players}
        rounds={state.queue.length}
        onBackToSetup={onBackToSetup}
      />
    )
  }

  return (
    <div className="screen play-screen">
      <header className="play-top">
        <div className="play-brand">
          <p className="eyebrow">Guess the Bass</p>
          <p className="round-meta">Round {roundLabel}</p>
        </div>
        <div className="play-score-slot">
          <Scoreboard players={state.players} />
        </div>
        <div className="play-vol-slot">
          <VolumeControl compact />
        </div>
        <div className="play-host-slot">
          <div className="play-host-controls">
            {state.phase !== 'reveal' && (
              <button type="button" className="btn btn-ghost play-end" onClick={onSkipTrack}>
                Skip track
              </button>
            )}
            <button type="button" className="btn btn-ghost play-end" onClick={onBackToSetup}>
              End
            </button>
          </div>
        </div>
      </header>

      {state.phase === 'playing' && (
        <>
          <div className="center-stage play-main">
            {state.loadingRound ? (
              <p className="lede">Finding the drop…</p>
            ) : (
              <>
                <div className="search-anchor">
                  <div className="play-above">
                    <p className="clip-label">{formatClipLabel(clipSec)}</p>
                    <p className="points-hint">Worth {pointsNow} pt{pointsNow === 1 ? '' : 's'}</p>
                    <ClipMeter skipIndex={state.skipIndex} active={!state.loadingRound} />
                    <div className="button-row play-actions">
                      <button type="button" className="btn btn-primary btn-xl" onClick={onReplay}>
                        Play
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-xl"
                        onClick={onSkip}
                        disabled={state.skipIndex >= MAX_SKIPS}
                      >
                        {revealNext ? 'Reveal' : 'Extend'}
                      </button>
                    </div>
                    {state.error && <p className="status status-error">{state.error}</p>}
                  </div>

                  <form
                    className="search-block"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (hits.length) guessHighlighted()
                    }}
                  >
                    <input
                      ref={inputRef}
                      className="input input-xl"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Type artist or title…"
                      autoComplete="off"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="search"
                      inputMode="search"
                      disabled={state.loadingRound}
                      aria-autocomplete="list"
                      aria-controls="search-results"
                      aria-expanded={Boolean(query.trim())}
                      aria-activedescendant={
                        hits[selected] ? `hit-${hits[selected].track.id}` : undefined
                      }
                    />
                    {query.trim() ? (
                      <div className="search-menu" id="search-results">
                        {hits.length === 0 ? (
                          <p className="search-empty">No matches in this folder.</p>
                        ) : (
                          <ul className="search-results" role="listbox" ref={listRef}>
                            {hits.map((hit, i) => (
                              <li key={hit.track.id}>
                                <button
                                  type="button"
                                  id={`hit-${hit.track.id}`}
                                  role="option"
                                  aria-selected={i === selected}
                                  className={`result-row ${i === selected ? 'selected' : ''}`}
                                  onMouseEnter={() => setSelected(i)}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => onGuess(hit.track)}
                                >
                                  <span className="result-title">{hit.track.title}</span>
                                  <span className="result-artist">{hit.track.artist}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : null}
                  </form>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {state.phase === 'reveal' && state.currentTrack && (
        <div className="center-stage">
          {state.lastCorrect ? (
            <p className="reveal-score">
              <span className="reveal-score-label">Nailed it</span>
              <span className="reveal-score-pts">+{state.lastPoints}</span>
            </p>
          ) : (
            <p className="reveal-score reveal-score-miss">Revealed</p>
          )}
          <h1 className="reveal-title">{state.currentTrack.title}</h1>
          <p className="reveal-artist">{state.currentTrack.artist}</p>
          {state.currentTrack.album && (
            <p className="hint">{state.currentTrack.album}</p>
          )}
          <TrackScrubber active />
          {state.lastCorrect && state.players.length > 0 ? (
            <>
              <AwardGrid players={state.players} onAward={onAward} />
              <button type="button" className="btn btn-ghost btn-lg" onClick={onNext}>
                Nobody / skip
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary btn-xl" onClick={onNext}>
              Next track
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function AwardGrid({
  players,
  onAward,
}: {
  players: Player[]
  onAward: (playerId: string) => void
}) {
  const sizerRef = useRef<HTMLSpanElement>(null)
  const [colMin, setColMin] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = sizerRef.current
    if (!el) return

    const apply = () => setColMin(el.offsetWidth)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    void document.fonts.ready.then(apply)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      className="award-grid"
      style={
        colMin != null
          ? ({ '--award-col-min': `${colMin}px` } as CSSProperties)
          : undefined
      }
    >
      <span ref={sizerRef} className="award-sizer" aria-hidden="true">
        {'W'.repeat(MAX_PLAYER_NAME_LENGTH)}
      </span>
      {players.map((p) => (
        <button
          key={p.id}
          type="button"
          className="btn btn-primary btn-xl award-btn"
          onClick={() => onAward(p.id)}
          title={p.name}
        >
          {p.name}
        </button>
      ))}
    </div>
  )
}

function rankByScore(players: Player[]) {
  const sorted = [...players].sort((a, b) => b.score - a.score)
  let place = 1
  return sorted.map((player, i) => {
    if (i > 0 && sorted[i - 1].score !== player.score) place = i + 1
    return { player, place }
  })
}

function FinishScreen({
  players,
  rounds,
  onBackToSetup,
}: {
  players: Player[]
  rounds: number
  onBackToSetup: () => void
}) {
  const ranked = rankByScore(players)
  const topScore = ranked[0]?.player.score ?? 0

  return (
    <div className="screen finish-screen">
      <div className="finish-stage">
        <header className="finish-header">
          <p className="eyebrow">Session over</p>
          <h1 className="finish-title">That’s the set</h1>
          {rounds > 0 ? (
            <p className="finish-meta">
              {rounds} round{rounds === 1 ? '' : 's'}
              {ranked.length
                ? ` · ${ranked.length} player${ranked.length === 1 ? '' : 's'}`
                : ''}
            </p>
          ) : null}
        </header>

        {ranked.length > 0 ? (
          <div className="finish-board-frame">
            <ol className="finish-board themed-scroll" aria-label="Final scores">
              {ranked.map(({ player, place }) => {
                const lead = topScore > 0 && place === 1
                const bar = topScore > 0 ? (player.score / topScore) * 100 : 0
                return (
                  <li key={player.id} className={lead ? 'is-first' : undefined}>
                    <span className="finish-bar" style={{ width: `${bar}%` }} aria-hidden="true" />
                    <span className="finish-place">{String(place).padStart(2, '0')}</span>
                    <span className="finish-name">{player.name}</span>
                    <span className="finish-pts">
                      {player.score}
                      <span className="finish-pts-label">pts</span>
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        ) : (
          <p className="lede">Nice ears. Load another folder or run it back.</p>
        )}

        <button type="button" className="btn btn-primary btn-xl" onClick={onBackToSetup}>
          Back to setup
        </button>
      </div>
    </div>
  )
}

function Scoreboard({ players }: { players: GameState['players'] }) {
  if (!players.length) return <div className="scoreboard empty" />
  const sorted = [...players].sort((a, b) => b.score - a.score)
  const dense = sorted.length > 6
  return (
    <ul className={`scoreboard themed-scroll${dense ? ' scoreboard-dense' : ''}`}>
      {sorted.map((p) => (
        <li key={p.id}>
          <span className="sb-name">{p.name}</span>
          <span className="sb-score">{p.score}</span>
        </li>
      ))}
    </ul>
  )
}
