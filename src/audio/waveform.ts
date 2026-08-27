/**
 * Downsampled loudness envelope for a buffer.
 * Mixes RMS (body / build) with peak (hits / drops), then contrast-curves
 * so verses, builds, and drops read as clearly different heights.
 */
export function computeAmplitudeEnvelope(buffer: AudioBuffer, bars: number): Float32Array {
  const out = new Float32Array(Math.max(0, bars))
  if (bars < 1 || buffer.length < 2) return out

  const channelCount = buffer.numberOfChannels
  const channels: Float32Array[] = []
  for (let c = 0; c < channelCount; c++) channels.push(buffer.getChannelData(c))

  const length = buffer.length
  const hop = Math.max(1, Math.floor(length / bars / 64))
  let loudest = 0

  for (let i = 0; i < bars; i++) {
    const start = Math.floor((i / bars) * length)
    const end = Math.floor(((i + 1) / bars) * length)
    let energy = 0
    let peak = 0
    let n = 0
    for (let s = start; s < end; s += hop) {
      let mix = 0
      for (let c = 0; c < channelCount; c++) mix += channels[c][s] ?? 0
      mix /= channelCount
      const abs = Math.abs(mix)
      energy += abs * abs
      if (abs > peak) peak = abs
      n++
    }
    const rms = n > 0 ? Math.sqrt(energy / n) : 0
    const value = rms * 0.55 + peak * 0.45
    out[i] = value
    if (value > loudest) loudest = value
  }

  if (loudest < 1e-6) return out
  for (let i = 0; i < bars; i++) {
    out[i] = Math.pow(out[i] / loudest, 1.55)
  }
  return out
}
