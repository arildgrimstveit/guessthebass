import { memo, useEffect, useRef, useState, type CSSProperties } from 'react'
import { audioEngine } from '../audio/engine'

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

function ratioFromEvent(el: HTMLElement, clientX: number): number {
  const box = el.getBoundingClientRect()
  if (box.width <= 0) return 0
  return Math.min(1, Math.max(0, (clientX - box.left) / box.width))
}

const MIN_BARS = 28
const MAX_BARS = 52

const WaveformLayer = memo(function WaveformLayer({
  envelope,
  variant,
}: {
  envelope: Float32Array
  variant: 'dim' | 'played'
}) {
  const n = envelope.length
  if (n < 1) return null
  return (
    <svg
      className={`track-scrubber-wave is-${variant}`}
      viewBox={`0 0 ${n} 100`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {Array.from({ length: n }, (_, i) => {
        const h = Math.max(2.4, envelope[i] * 96)
        return (
          <rect
            key={i}
            x={i + 0.34}
            width={0.32}
            y={(100 - h) / 2}
            height={h}
            rx={0.14}
            ry={2.6}
          />
        )
      })}
    </svg>
  )
})

export function TrackScrubber({ active }: { active: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const preview = useRef(0)
  const [position, setPosition] = useState(() => audioEngine.getTimeline().position)
  const [duration, setDuration] = useState(() => audioEngine.getTimeline().duration)
  const [barCount, setBarCount] = useState(160)
  const [envelope, setEnvelope] = useState(() => new Float32Array(0))

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      setBarCount(Math.min(MAX_BARS, Math.max(MIN_BARS, Math.round(w / 14))))
    }
    measure()
    const obs = new ResizeObserver(measure)
    obs.observe(el)
    return () => obs.disconnect()
  }, [active])

  useEffect(() => {
    if (!active) {
      setPosition(0)
      setDuration(0)
      setEnvelope(new Float32Array(0))
      return
    }
    let id = 0
    const tick = () => {
      const t = audioEngine.getTimeline()
      setDuration((d) => (d === t.duration ? d : t.duration))
      if (!dragging.current) setPosition(t.position)
      const wave = audioEngine.getWaveform(barCount)
      setEnvelope((prev) => (prev === wave ? prev : wave))
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [active, barCount])

  function previewAt(clientX: number) {
    const el = trackRef.current
    const total = duration || audioEngine.getTimeline().duration
    if (!el || total <= 0) return 0
    const next = ratioFromEvent(el, clientX) * total
    preview.current = next
    setPosition(next)
    return next
  }

  const progress = duration > 0 ? position / duration : 0

  return (
    <div className="track-scrubber">
      <div
        ref={trackRef}
        className="track-scrubber-track"
        role="slider"
        tabIndex={0}
        aria-label="Track position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
        aria-valuetext={`${formatClock(position)} of ${formatClock(duration)}`}
        onPointerDown={(e) => {
          e.preventDefault()
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          previewAt(e.clientX)
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return
          previewAt(e.clientX)
        }}
        onPointerUp={(e) => {
          if (dragging.current) audioEngine.seek(preview.current)
          dragging.current = false
          try {
            e.currentTarget.releasePointerCapture(e.pointerId)
          } catch {
            // already released
          }
        }}
        onPointerCancel={() => {
          dragging.current = false
        }}
        onKeyDown={(e) => {
          if (duration <= 0) return
          const step = e.shiftKey ? 10 : 2
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault()
            const delta = e.key === 'ArrowRight' ? step : -step
            audioEngine.seek(position + delta)
          }
        }}
      >
        <div
          className="track-scrubber-canvas"
          style={{ '--progress': progress } as CSSProperties}
        >
          <WaveformLayer envelope={envelope} variant="dim" />
          <div className="track-scrubber-played">
            <WaveformLayer envelope={envelope} variant="played" />
          </div>
          <div className="track-scrubber-head" />
        </div>
      </div>
      <div className="track-scrubber-times">
        <span>{formatClock(position)}</span>
        <span>{formatClock(duration)}</span>
      </div>
    </div>
  )
}
