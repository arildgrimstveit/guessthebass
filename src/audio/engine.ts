import { findEnergyStart } from './energyStart'
import { computeAmplitudeEnvelope } from './waveform'

const VOLUME_KEY = 'gtb-volume'

function clampVolume(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.min(1, Math.max(0, n))
}

function readStoredVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY)
    if (raw == null) return 1
    return clampVolume(Number(raw))
  } catch {
    return 1
  }
}

type Prepared = {
  key: string
  buffer: AudioBuffer
  energyStart: number
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private buffer: AudioBuffer | null = null
  private currentKey: string | null = null
  private source: AudioBufferSourceNode | null = null
  private energyStart = 0
  private playStartedAt = 0
  private playDuration = 0
  private playOffset = 0
  private volume = readStoredVolume()
  private prepared: Prepared | null = null
  private prefetchGen = 0
  private prefetchingKey: string | null = null
  private waveCache: { key: string | null; bars: number; data: Float32Array } | null = null

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext()
      this.gain = null
    }
    return this.ctx
  }

  private getGain(): GainNode {
    const ctx = this.getContext()
    if (!this.gain || this.gain.context !== ctx) {
      this.gain = ctx.createGain()
      this.gain.gain.value = this.volume
      this.gain.connect(ctx.destination)
    }
    return this.gain
  }

  getVolume(): number {
    return this.volume
  }

  setVolume(value: number): void {
    this.volume = clampVolume(value)
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume))
    } catch {
      // private mode / blocked storage
    }
    if (this.gain && this.gain.context.state !== 'closed') {
      this.gain.gain.value = this.volume
    }
  }

  async resume(): Promise<void> {
    const ctx = this.getContext()
    this.getGain()
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
  }

  private async decodeFile(file: File): Promise<{ buffer: AudioBuffer; energyStart: number }> {
    const ctx = this.getContext()
    const arrayBuffer = await file.arrayBuffer()
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
    return { buffer: audioBuffer, energyStart: findEnergyStart(audioBuffer) }
  }

  private activate(prepared: Prepared): void {
    this.stop()
    this.buffer = prepared.buffer
    this.energyStart = prepared.energyStart
    this.currentKey = prepared.key
    this.waveCache = null
    if (this.prepared?.key === prepared.key) this.prepared = null
  }

  /**
   * Decode `file` and make it the current buffer.
   * holdPlayback: keep the current source going until the new buffer is ready
   * (used when leaving a reveal so the 15s clip isn’t cut for decode).
   */
  async loadFile(
    file: File,
    key: string,
    opts: { holdPlayback?: boolean } = {},
  ): Promise<{ duration: number; energyStart: number }> {
    if (this.currentKey === key && this.buffer) {
      if (!opts.holdPlayback) this.stop()
      return { duration: this.buffer.duration, energyStart: this.energyStart }
    }

    this.dropPrefetchUnless(key)

    if (this.prepared?.key === key) {
      const ready = this.prepared
      this.activate(ready)
      return { duration: ready.buffer.duration, energyStart: ready.energyStart }
    }

    if (!opts.holdPlayback) this.stop()
    const decoded = await this.decodeFile(file)
    this.activate({ key, ...decoded })
    return { duration: decoded.buffer.duration, energyStart: decoded.energyStart }
  }

  /** Decode the next track in the background. Does not stop current playback. */
  prefetchFile(file: File, key: string): void {
    if (!key || this.currentKey === key || this.prepared?.key === key || this.prefetchingKey === key) {
      return
    }
    const token = ++this.prefetchGen
    this.prefetchingKey = key
    void this.decodeFile(file)
      .then((decoded) => {
        if (token !== this.prefetchGen) return
        if (this.currentKey === key) return
        this.prepared = { key, ...decoded }
      })
      .catch(() => {
        /* loadFile will surface a real decode error if this track is played */
      })
      .finally(() => {
        if (token === this.prefetchGen) this.prefetchingKey = null
      })
  }

  clearPrefetch(): void {
    this.prefetchGen += 1
    this.prefetchingKey = null
    this.prepared = null
  }

  getPlaybackState(): { elapsed: number; duration: number; playing: boolean } {
    const duration = this.playDuration
    if (!this.ctx || duration <= 0) {
      return { elapsed: 0, duration: 0, playing: false }
    }
    const elapsed = Math.min(
      Math.max(0, this.ctx.currentTime - this.playStartedAt),
      duration,
    )
    return { elapsed, duration, playing: this.isPlaying() }
  }

  /** Position in the loaded file (seconds), for the full-track scrubber. */
  getTimeline(): { position: number; duration: number; playing: boolean } {
    const duration = this.buffer?.duration ?? 0
    if (!this.ctx || duration <= 0 || this.playDuration <= 0) {
      return { position: 0, duration, playing: false }
    }
    const elapsed = Math.min(
      Math.max(0, this.ctx.currentTime - this.playStartedAt),
      this.playDuration,
    )
    return {
      position: Math.min(duration, this.playOffset + elapsed),
      duration,
      playing: this.isPlaying(),
    }
  }

  /** Loudness bars for the loaded file (cached per track). */
  getWaveform(bars: number): Float32Array {
    if (!this.buffer || bars < 1) return new Float32Array(0)
    if (this.waveCache && this.waveCache.key === this.currentKey && this.waveCache.bars === bars) {
      return this.waveCache.data
    }
    const data = computeAmplitudeEnvelope(this.buffer, bars)
    this.waveCache = { key: this.currentKey, bars, data }
    return data
  }

  seek(positionSeconds: number): void {
    if (!this.buffer) return
    const duration = this.buffer.duration
    const t = Math.min(Math.max(0, positionSeconds), Math.max(0, duration - 0.05))
    void this.resume()
    this.startSource(duration - t, t)
  }

  /**
   * restart: play from the energy hit for `durationSeconds` (Play button / new round).
   * extend: if a clip is already playing, keep it going until the new duration;
   *         if it already ended, play the full new length from the start.
   */
  playClip(durationSeconds: number, mode: 'restart' | 'extend' = 'restart'): void {
    if (!this.buffer) return
    const offset = this.energyStart
    const maxDur = Math.max(0.01, this.buffer.duration - offset)
    const dur = Math.min(durationSeconds, maxDur)

    if (mode === 'extend' && this.isPlaying()) {
      this.playDuration = dur
      try {
        this.source!.stop(this.playStartedAt + dur)
      } catch {
        this.startSource(dur)
      }
      return
    }

    this.startSource(dur)
  }

  /** Play the loaded file from 0:00 through the end. */
  playFull(): void {
    if (!this.buffer) return
    this.startSource(this.buffer.duration, 0)
  }

  stop(): void {
    this.stopSourceOnly()
    this.playDuration = 0
  }

  dispose(): void {
    this.clearPrefetch()
    this.stop()
    this.buffer = null
    this.currentKey = null
    this.waveCache = null
    if (this.gain) {
      try {
        this.gain.disconnect()
      } catch {
        // ignore
      }
      this.gain = null
    }
    if (this.ctx) {
      void this.ctx.close()
      this.ctx = null
    }
  }

  private dropPrefetchUnless(key: string): void {
    if (this.prefetchingKey && this.prefetchingKey !== key) {
      this.prefetchGen += 1
      this.prefetchingKey = null
    }
    if (this.prepared && this.prepared.key !== key) this.prepared = null
  }

  private isPlaying(): boolean {
    if (!this.source || !this.ctx) return false
    return this.ctx.currentTime < this.playStartedAt + this.playDuration - 0.005
  }

  private startSource(dur: number, offset = this.energyStart): void {
    this.stopSourceOnly()
    if (!this.buffer) return
    const ctx = this.getContext()
    const maxDur = Math.max(0.01, this.buffer.duration - offset)
    const playDur = Math.min(dur, maxDur)
    const source = ctx.createBufferSource()
    source.buffer = this.buffer
    source.connect(this.getGain())
    const when = ctx.currentTime
    source.start(when, offset)
    try {
      source.stop(when + playDur)
    } catch {
      // ignore
    }
    source.onended = () => {
      if (this.source === source) this.source = null
    }
    this.playStartedAt = when
    this.playDuration = playDur
    this.playOffset = offset
    this.source = source
  }

  private stopSourceOnly(): void {
    if (this.source) {
      this.source.onended = null
      try {
        this.source.stop()
      } catch {
        // already stopped
      }
      try {
        this.source.disconnect()
      } catch {
        // ignore
      }
      this.source = null
    }
  }
}

export const audioEngine = new AudioEngine()
