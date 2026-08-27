import { useVolume } from '../audio/useVolume'

export function VolumeControl({ compact = false }: { compact?: boolean }) {
  const { volume, setVolume } = useVolume()
  const pct = Math.round(volume * 100)

  return (
    <label className={`volume-control${compact ? ' volume-control-compact' : ''}`}>
      <span className="volume-label">Vol</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Volume"
        onChange={(e) => setVolume(Number(e.target.value) / 100)}
      />
    </label>
  )
}
