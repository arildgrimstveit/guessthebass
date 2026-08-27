import { findEnergyStart } from '../src/audio/energyStart'
import {
  CLIP_LADDER,
  MAX_SKIPS,
  clipDuration,
  nextSkipIndex,
  pointsForSkipIndex,
  shuffleTracks,
} from '../src/game/rules'
import { createTrackSearcher } from '../src/game/search'
import { parseFilenameMeta, isAudioFileName } from '../src/files/loadFolder'
import type { Track } from '../src/types'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

// --- rules ---
assert(CLIP_LADDER.length === 5, 'ladder length')
assert(MAX_SKIPS === 5, 'max skips')
assert(clipDuration(0) === 0.1, 'first clip')
assert(pointsForSkipIndex(0) === 5, 'first points')
assert(pointsForSkipIndex(4) === 1, 'last points')
assert(pointsForSkipIndex(5) === 0, 'reveal points')
assert(nextSkipIndex(0).skipIndex === 1 && !nextSkipIndex(0).reveal, 'skip 0->1')
assert(nextSkipIndex(4).reveal === true, 'skip 4 reveals')
assert(shuffleTracks([1, 2, 3, 4]).length === 4, 'shuffle')

// --- filename ---
assert(isAudioFileName('x.mp3'), 'mp3 ok')
assert(!isAudioFileName('x.txt'), 'txt no')
assert(parseFilenameMeta('Noisia - Could This Be.wav').artist === 'Noisia', 'artist parse')
assert(parseFilenameMeta('Noisia - Could This Be.wav').title === 'Could This Be', 'title parse')

// --- search ---
const tracks: Track[] = [
  {
    id: '1',
    file: new File([], 'a.wav'),
    title: 'Could This Be',
    artist: 'Noisia',
    album: '',
    path: 'a.wav',
  },
  {
    id: '2',
    file: new File([], 'b.wav'),
    title: 'Blind Faith',
    artist: 'Chase and Status',
    album: '',
    path: 'b.wav',
  },
]
const search = createTrackSearcher(tracks)
assert(search('noisia')[0]?.track.id === '1', 'search by artist')
assert(search('blind')[0]?.track.id === '2', 'search by title')

// --- energy start (synthetic buffer) ---
const sampleRate = 44100
const silence = 0.35
const ctxLength = sampleRate * 2
const buffer = {
  sampleRate,
  numberOfChannels: 1,
  length: ctxLength,
  duration: 2,
  getChannelData() {
    const data = new Float32Array(ctxLength)
    const start = Math.floor(silence * sampleRate)
    for (let i = start; i < ctxLength; i++) {
      data[i] = Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 0.5
    }
    return data
  },
} as unknown as AudioBuffer

const energy = findEnergyStart(buffer)
assert(energy > 0.2 && energy < 0.4, `energy start near silence end, got ${energy}`)

console.log('All unit checks passed.')
