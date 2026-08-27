import { useEffect, useState } from 'react'
import { audioEngine } from '../audio/engine'
import { CLIP_LADDER, playbackProgressPercent } from '../game/rules'

export function ClipMeter({ skipIndex, active }: { skipIndex: number; active: boolean }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!active) return
    let id = 0
    const tick = () => {
      setElapsed(audioEngine.getPlaybackState().elapsed)
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [active, skipIndex])

  const percent = playbackProgressPercent(active ? elapsed : 0, skipIndex)

  return (
    <div
      className="clip-meter"
      role="meter"
      aria-label="Clip playback"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <div className="clip-meter-track">
        {CLIP_LADDER.map((_, i) => (
          <span
            key={i}
            className={`clip-meter-seg ${i <= skipIndex ? 'is-unlocked' : ''} ${
              i === skipIndex ? 'is-current' : ''
            }`}
          />
        ))}
        <div className="clip-meter-overlay">
          <div className="clip-meter-head" style={{ left: `${percent}%` }} />
        </div>
      </div>
    </div>
  )
}
