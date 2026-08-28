import { findEnergyStart } from './energyStart'
import { computeAmplitudeEnvelope } from './waveform'

const VOLUME_KEY = 'gtb-volume'
const ENVELOPE_BARS = 64
/** decodeAudioData expands to PCM (~1GB for a 1hr mix). Skip analysis on anything bigger than a long song. */
const MAX_DECODE_BYTES = 20 * 1024 * 1024

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

function waitMetadata(audio: HTMLAudioElement): Promise<void> {
  if (Number.isFinite(audio.duration) && audio.duration > 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const onOk = () => {
      cleanup()
      resolve()
    }
    const onErr = () => {
      cleanup()
      reject(new Error('Could not read audio'))
    }
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onOk)
      audio.removeEventListener('error', onErr)
    }
    audio.addEventListener('loadedmetadata', onOk)
    audio.addEventListener('error', onErr)
    audio.load()
  })
}

function downsample(src: Float32Array, bars: number): Float32Array {
  if (bars < 1 || src.length === 0) return new Float32Array(0)
  if (src.length === bars) return src
  const out = new Float32Array(bars)
  for (let i = 0; i < bars; i++) {
    const a = Math.floor((i / bars) * src.length)
    const b = Math.max(a + 1, Math.floor(((i + 1) / bars) * src.length))
    let peak = 0
    for (let j = a; j < b; j++) if (src[j] > peak) peak = src[j]
    out[i] = peak
  }
  return out
}

type Analysis = { key: string; energyStart: number; envelope: Float32Array }

class AudioEngine {
  private ctx: AudioContext | null = null
  private media: HTMLAudioElement | null = null
  private mediaUrl: string | null = null
  private mediaFile: File | null = null
  private clipTimer: ReturnType<typeof setTimeout> | null = null
  private currentKey: string | null = null
  private energyStart = 0
  private envelope: Float32Array | null = null
  private playOffset = 0
  private playDuration = 0
  private volume = readStoredVolume()
  private prepared: Analysis | null = null
  private prefetchGen = 0
  private prefetchingKey: string | null = null
  private waveCache: { key: string | null; bars: number; data: Float32Array } | null = null

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') this.ctx = new AudioContext()
    return this.ctx
  }

  private el(): HTMLAudioElement {
    if (!this.media) {
      this.media = new Audio()
      this.media.preload = 'auto'
      this.media.setAttribute('playsinline', '')
      this.media.volume = this.volume
    }
    return this.media
  }

  private duration(): number {
    const d = this.media?.duration
    return d != null && Number.isFinite(d) && d > 0 ? d : 0
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
    if (this.media) this.media.volume = this.volume
  }

  /** Pass `file` on the Start tap so iOS allows later play() after we await decode/metadata. */
  async resume(file?: File): Promise<void> {
    if (file) {
      const el = this.attach(file)
      el.muted = true
      void el.play().then(() => {
        el.pause()
        el.muted = false
      }).catch(() => {
        el.muted = false
      })
    }
    const ctx = this.getContext()
    if (ctx.state === 'suspended') await ctx.resume()
  }

  async loadFile(file: File, key: string): Promise<{ duration: number; energyStart: number }> {
    if (this.currentKey === key && this.mediaUrl) {
      this.stop()
      return { duration: this.duration(), energyStart: this.energyStart }
    }

    this.dropPrefetchUnless(key)
    this.stop()

    const el = this.attach(file)
    const meta = waitMetadata(el)
    let energyStart = 0
    let envelope: Float32Array | null = null

    if (this.prepared?.key === key) {
      energyStart = this.prepared.energyStart
      envelope = this.prepared.envelope
      this.prepared = null
    } else if (file.size <= MAX_DECODE_BYTES) {
      const analyzed = await this.analyze(file)
      energyStart = analyzed.energyStart
      envelope = analyzed.envelope
    }

    await meta
    el.pause()
    el.muted = false

    this.currentKey = key
    this.energyStart = energyStart
    this.envelope = envelope
    this.waveCache = null
    return { duration: this.duration(), energyStart }
  }

  prefetchFile(file: File, key: string): void {
    if (!key || file.size > MAX_DECODE_BYTES) return
    if (this.currentKey === key || this.prepared?.key === key || this.prefetchingKey === key) return
    const token = ++this.prefetchGen
    this.prefetchingKey = key
    void this.analyze(file)
      .then((decoded) => {
        if (token !== this.prefetchGen || this.currentKey === key) return
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
    const el = this.media
    if (!el || duration <= 0) return { elapsed: 0, duration: 0, playing: false }
    const elapsed = Math.min(Math.max(0, el.currentTime - this.playOffset), duration)
    return { elapsed, duration, playing: this.isPlaying() }
  }

  getTimeline(): { position: number; duration: number; playing: boolean } {
    const duration = this.duration()
    return {
      position: this.media && duration > 0 ? this.media.currentTime : 0,
      duration,
      playing: this.isPlaying(),
    }
  }

  getWaveform(bars: number): Float32Array {
    if (!this.envelope || bars < 1) return new Float32Array(0)
    if (this.waveCache && this.waveCache.key === this.currentKey && this.waveCache.bars === bars) {
      return this.waveCache.data
    }
    const data = downsample(this.envelope, bars)
    this.waveCache = { key: this.currentKey, bars, data }
    return data
  }

  seek(positionSeconds: number): void {
    const total = this.duration()
    if (total <= 0) return
    const t = Math.min(Math.max(0, positionSeconds), Math.max(0, total - 0.05))
    this.run(t, total - t, false)
  }

  /**
   * restart: play from the energy hit for `durationSeconds`.
   * extend: if a clip is already playing, keep it going until the new duration.
   */
  playClip(durationSeconds: number, mode: 'restart' | 'extend' = 'restart'): void {
    const total = this.duration()
    if (total <= 0) return
    const offset = this.energyStart
    const dur = Math.min(durationSeconds, Math.max(0.01, total - offset))

    if (mode === 'extend' && this.isPlaying() && this.media) {
      this.playDuration = dur
      this.clearClipTimer()
      const remaining = dur - (this.media.currentTime - this.playOffset)
      if (remaining <= 0) this.media.pause()
      else this.armClipTimer(remaining)
      return
    }

    this.run(offset, dur, true)
  }

  playFull(): void {
    const total = this.duration()
    if (total <= 0) return
    this.run(0, total, false)
  }

  togglePause(): void {
    const el = this.media
    const total = this.duration()
    if (!el || total <= 0) return
    if (this.isPlaying()) {
      this.pause()
      return
    }
    if (el.currentTime >= total - 0.05) return
    this.run(el.currentTime, total - el.currentTime, false)
  }

  stop(): void {
    this.pause()
  }

  dispose(): void {
    this.clearPrefetch()
    this.stop()
    this.currentKey = null
    this.envelope = null
    this.waveCache = null
    this.revoke()
    if (this.media) {
      this.media.removeAttribute('src')
      this.media.load()
      this.media = null
    }
    if (this.ctx) {
      void this.ctx.close()
      this.ctx = null
    }
  }

  private async analyze(file: File): Promise<{ energyStart: number; envelope: Float32Array }> {
    const ctx = this.getContext()
    const audioBuffer = await ctx.decodeAudioData((await file.arrayBuffer()).slice(0))
    return {
      energyStart: findEnergyStart(audioBuffer),
      envelope: computeAmplitudeEnvelope(audioBuffer, ENVELOPE_BARS),
    }
  }

  private attach(file: File): HTMLAudioElement {
    const el = this.el()
    if (this.mediaFile === file && this.mediaUrl) return el
    this.revoke()
    this.mediaUrl = URL.createObjectURL(file)
    this.mediaFile = file
    el.src = this.mediaUrl
    el.volume = this.volume
    return el
  }

  private revoke(): void {
    if (this.mediaUrl) URL.revokeObjectURL(this.mediaUrl)
    this.mediaUrl = null
    this.mediaFile = null
  }

  private run(offset: number, duration: number, clip: boolean): void {
    const el = this.media
    const total = this.duration()
    if (!el || total <= 0) return
    this.clearClipTimer()
    const t = Math.min(Math.max(0, offset), Math.max(0, total - 0.05))
    const playDur = Math.min(duration, Math.max(0.01, total - t))
    el.volume = this.volume
    try {
      el.currentTime = t
    } catch {
      // not seekable yet
    }
    void el.play().catch(() => undefined)
    this.playOffset = t
    this.playDuration = playDur
    if (clip && t + playDur < total - 0.05) this.armClipTimer(playDur)
  }

  private pause(): void {
    this.clearClipTimer()
    this.media?.pause()
    this.playDuration = 0
  }

  private isPlaying(): boolean {
    return !!this.media && !this.media.paused && !this.media.ended
  }

  private armClipTimer(seconds: number): void {
    this.clearClipTimer()
    this.clipTimer = window.setTimeout(() => {
      this.clipTimer = null
      this.media?.pause()
    }, Math.max(0, seconds * 1000))
  }

  private clearClipTimer(): void {
    if (this.clipTimer == null) return
    window.clearTimeout(this.clipTimer)
    this.clipTimer = null
  }

  private dropPrefetchUnless(key: string): void {
    if (this.prefetchingKey && this.prefetchingKey !== key) {
      this.prefetchGen += 1
      this.prefetchingKey = null
    }
    if (this.prepared && this.prepared.key !== key) this.prepared = null
  }
}

export const audioEngine = new AudioEngine()
