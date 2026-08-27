import { useRef, useState, type FormEvent } from 'react'
import {
  clearSavedDirectoryHandle,
  loadSavedDirectoryHandle,
  loadTracksFromDirectoryHandle,
  loadTracksFromFileList,
  pickDirectory,
  saveDirectoryHandle,
  supportsDirectoryPicker,
  verifyPermission,
} from '../files/loadFolder'
import { VolumeControl } from './VolumeControl'
import { ROUND_OPTIONS, type RoundLimit } from '../game/rules'
import type { Player, Track } from '../types'

interface SetupScreenProps {
  tracks: Track[]
  players: Player[]
  error: string | null
  onTracksLoaded: (tracks: Track[]) => void
  onAddPlayer: (name: string) => void
  onRemovePlayer: (id: string) => void
  onStart: (roundLimit: RoundLimit) => void
}

function StepHeading({ index, title, note }: { index: string; title: string; note?: string }) {
  return (
    <header className="step-heading">
      <div className="step-rail" aria-hidden="true">
        <span className="step-index">{index}</span>
      </div>
      <div className="step-copy">
        <h2>{title}</h2>
        {note ? <p className="step-note">{note}</p> : null}
      </div>
    </header>
  )
}

export function SetupScreen({
  tracks,
  players,
  error,
  onTracksLoaded,
  onAddPlayer,
  onRemovePlayer,
  onStart,
}: SetupScreenProps) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [playerInput, setPlayerInput] = useState('')
  const [roundLimit, setRoundLimit] = useState<RoundLimit>(20)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canPick = supportsDirectoryPicker()

  const sessionCount =
    tracks.length === 0
      ? 0
      : roundLimit === 'all'
        ? tracks.length
        : Math.min(roundLimit, tracks.length)

  async function handlePickFolder() {
    setLoading(true)
    setStatus(null)
    try {
      const handle = await pickDirectory()
      const granted = await verifyPermission(handle, true)
      if (!granted) {
        setStatus('Permission to read the folder was denied.')
        return
      }
      await saveDirectoryHandle(handle)
      const loaded = await loadTracksFromDirectoryHandle(handle)
      onTracksLoaded(loaded)
      setStatus(
        loaded.length
          ? `Loaded ${loaded.length} track${loaded.length === 1 ? '' : 's'}.`
          : 'No audio files found.',
      )
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStatus(null)
      } else {
        setStatus(err instanceof Error ? err.message : 'Could not open folder.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleReloadSaved() {
    setLoading(true)
    setStatus(null)
    try {
      const handle = await loadSavedDirectoryHandle()
      if (!handle) {
        setStatus('No saved folder yet. Pick a folder first.')
        return
      }
      const granted = await verifyPermission(handle, true)
      if (!granted) {
        setStatus('Permission expired — pick the folder again.')
        await clearSavedDirectoryHandle()
        return
      }
      const loaded = await loadTracksFromDirectoryHandle(handle)
      onTracksLoaded(loaded)
      setStatus(`Reloaded ${loaded.length} track${loaded.length === 1 ? '' : 's'}.`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not reload folder.')
    } finally {
      setLoading(false)
    }
  }

  async function handleFallbackFiles(files: FileList | null) {
    if (!files?.length) return
    setLoading(true)
    setStatus(null)
    try {
      const loaded = await loadTracksFromFileList(files)
      onTracksLoaded(loaded)
      setStatus(
        loaded.length
          ? `Loaded ${loaded.length} track${loaded.length === 1 ? '' : 's'}.`
          : 'No audio files found.',
      )
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not read files.')
    } finally {
      setLoading(false)
    }
  }

  function handleAddPlayer(e: FormEvent) {
    e.preventDefault()
    if (!playerInput.trim()) return
    onAddPlayer(playerInput)
    setPlayerInput('')
  }

  function enterFullscreen() {
    const el = document.documentElement
    if (!document.fullscreenElement) {
      void el.requestFullscreen?.()
    }
  }

  return (
    <div className="screen setup-screen">
      <div className="setup-stack">
        <header className="setup-header">
          <div className="brand-lockup">
            <h1>
              <span className="brand-guess">Guess</span>
              <span className="brand-the">the</span>
              <span className="brand-bass">Bass</span>
            </h1>
          </div>
        </header>

      <section className="panel">
        <StepHeading
          index="01"
          title="Music folder"
          note={
            canPick
              ? undefined
              : 'This browser can’t remember folders — you’ll pick again after a refresh. Chrome or Edge remember the last folder.'
          }
        />
        <div className="button-row">
          {canPick ? (
            <>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => void handlePickFolder()}
                disabled={loading}
              >
                {loading ? 'Loading…' : 'Pick folder'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-lg"
                onClick={() => void handleReloadSaved()}
                disabled={loading}
              >
                Reload last folder
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-lg"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
              >
                Choose files…
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Choose folder'}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            webkitdirectory=""
            multiple
            accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg,.opus"
            onChange={(e) => void handleFallbackFiles(e.target.files)}
          />
        </div>
        <p className={`status ${tracks.length ? 'status-ok' : ''}`} aria-live="polite">
          {status ?? (tracks.length ? `${tracks.length} tracks ready.` : 'No folder loaded yet.')}
        </p>
        {error && <p className="status status-error">{error}</p>}
      </section>

      <section className="panel">
        <StepHeading index="02" title="Players" />
        <form className="player-form" onSubmit={handleAddPlayer}>
          <input
            className="input input-lg"
            value={playerInput}
            onChange={(e) => setPlayerInput(e.target.value)}
            placeholder="Player name"
            maxLength={24}
          />
          <button type="submit" className="btn btn-secondary btn-lg">
            Add
          </button>
        </form>
        {players.length > 0 && (
          <ul className="player-chips">
            {players.map((p) => (
              <li key={p.id} className="chip">
                <span className="chip-name">{p.name}</span>
                <button
                  type="button"
                  className="chip-remove"
                  onClick={() => onRemovePlayer(p.id)}
                  aria-label={`Remove ${p.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel start-panel">
        <StepHeading
          index="03"
          title="Fire it up"
          note={
            tracks.length
              ? `Playing ${sessionCount} of ${tracks.length} track${tracks.length === 1 ? '' : 's'} (shuffled).`
              : undefined
          }
        />
        <div
          className="round-options"
          role="group"
          aria-label="How many rounds"
        >
          {ROUND_OPTIONS.map((opt) => {
            const label = opt === 'all' ? 'All' : String(opt)
            const selected = roundLimit === opt
            return (
              <button
                key={label}
                type="button"
                className={`btn btn-lg round-option ${selected ? 'is-selected' : 'btn-ghost'}`}
                aria-pressed={selected}
                onClick={() => setRoundLimit(opt)}
              >
                {label}
              </button>
            )
          })}
        </div>
        <div className="button-row">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={tracks.length === 0 || loading}
            onClick={() => {
              enterFullscreen()
              onStart(roundLimit)
            }}
          >
            Start game
          </button>
          <button type="button" className="btn btn-ghost btn-lg" onClick={enterFullscreen}>
            Fullscreen
          </button>
          <VolumeControl />
        </div>
        </section>
      </div>
    </div>
  )
}
