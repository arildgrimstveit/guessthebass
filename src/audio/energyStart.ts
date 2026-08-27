/**
 * Find the first sustained energy hit in an AudioBuffer.
 * Analyzes up to the first 60s, returns offset in seconds (with ~20ms pre-roll).
 */
export function findEnergyStart(buffer: AudioBuffer, analyzeSeconds = 60): number {
  const sampleRate = buffer.sampleRate
  const channels = buffer.numberOfChannels
  const maxSamples = Math.min(buffer.length, Math.floor(analyzeSeconds * sampleRate))

  // Mix down to mono RMS over ~5ms windows
  const windowSize = Math.max(1, Math.floor(sampleRate * 0.005))
  const windows = Math.floor(maxSamples / windowSize)
  if (windows < 2) return 0

  const rms = new Float32Array(windows)
  let peak = 0

  for (let w = 0; w < windows; w++) {
    const start = w * windowSize
    let sum = 0
    for (let i = 0; i < windowSize; i++) {
      let sample = 0
      for (let c = 0; c < channels; c++) {
        sample += buffer.getChannelData(c)[start + i] ?? 0
      }
      sample /= channels
      sum += sample * sample
    }
    const value = Math.sqrt(sum / windowSize)
    rms[w] = value
    if (value > peak) peak = value
  }

  if (peak < 1e-6) return 0

  // Threshold relative to peak; require a few consecutive windows above it
  const threshold = peak * 0.18
  const sustain = 3
  let hitWindow = 0

  for (let w = 0; w < windows - sustain; w++) {
    let ok = true
    for (let s = 0; s < sustain; s++) {
      if (rms[w + s] < threshold) {
        ok = false
        break
      }
    }
    if (ok) {
      hitWindow = w
      break
    }
  }

  const preRoll = 0.02 // 20ms before transient
  const offset = Math.max(0, (hitWindow * windowSize) / sampleRate - preRoll)
  // Don't start past most of the file
  const maxOffset = Math.max(0, buffer.duration - 0.5)
  return Math.min(offset, maxOffset)
}
