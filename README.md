# Guess the Bass

Local music guessing game. Load a folder of tracks, hear short clips that start where the track kicks in, and guess the song.

```bash
npm install
npm run dev
```

Open the app, pick a music folder, optionally add players, then start.

## How to play

1. **Setup** — Load a music folder, add player names (or play solo), pick how many rounds (10 / 20 / 40 / All), hit Start (fullscreen optional).
2. **Clip** — A short clip plays from the track’s first strong energy hit (not from 0:00). Points start at 5.
3. **Extend** — Longer clip, fewer points. A wrong guess also extends. After the longest clip, **Reveal** plays the full track for 0 points.
4. **Guess** — Type artist or title; pick from search results.
5. **Award** — On a correct guess the host taps who got it (or Nobody / skip). Solo mode just advances.
6. **End** — When the session queue is done, scores rank and you return to setup.

### Clip ladder

| Clip   | Points if correct |
|--------|-------------------|
| 100 ms | 5                 |
| 500 ms | 4                 |
| 1 s    | 3                 |
| 2 s    | 2                 |
| 5 s    | 1                 |
| Reveal | 0                 |

### Keyboard

| Key | When | Action |
|-----|------|--------|
| Space | Playing, search not focused | Replay current clip |
| ↑ / ↓ | Search open | Move highlight |
| Enter | Playing with results | Submit highlighted guess |
| Enter / Space | Reveal (no award grid) | Next track |

Host buttons: **Play**, **Extend** / **Reveal**, **Skip track**, **End**.

## Architecture (short)

Client-only Vite + React SPA. No server, auth, or song catalog.

```
SetupScreen / PlayScreen
        ↓
    useGame()          ← phase: setup | playing | reveal | finished
        ↓
    audioEngine        ← Web Audio decode, energy-start clips, prefetch
    loadFolder         ← File System Access API or <input webkitdirectory>
    Fuse.js search     ← in-memory Track[]
```

- **Tracks** stay as local `File` blobs in memory; never uploaded.
- **Directory handle** (Chromium): IndexedDB via idb-keyval (`gtb-directory-handle`).
- **Volume**: `localStorage` (`gtb-volume`).
- **Scores / queue**: session only (cleared on End / refresh).

Key modules: `src/game/rules.ts` (ladders), `src/game/useGame.ts` (orchestration), `src/audio/engine.ts` + `energyStart.ts` (playback / onset detection), `src/files/loadFolder.ts` (folder + tags).

## Scripts

```bash
npm run dev          # Vite dev server
npm run build        # production build → dist/
npm run preview      # serve dist
npm run lint         # oxlint
```

## Possible next (not built)

- Tune clip ladders / difficulty presets for easy vs hard nights.
