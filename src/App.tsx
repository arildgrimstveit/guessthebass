import { useEffect } from 'react'
import { SetupScreen } from './ui/SetupScreen'
import { PlayScreen } from './ui/PlayScreen'
import { useGame } from './game/useGame'
import { syncMobileChrome } from './ui/device'
import './App.css'

export default function App() {
  const game = useGame()
  const { state } = game

  useEffect(() => syncMobileChrome(), [])

  if (state.phase === 'setup') {
    return (
      <SetupScreen
        tracks={state.tracks}
        players={state.players}
        error={state.error}
        onTracksLoaded={game.setTracks}
        onAddPlayer={game.addPlayer}
        onRemovePlayer={game.removePlayer}
        onStart={game.beginGame}
      />
    )
  }

  return (
    <PlayScreen
      state={state}
      search={game.search}
      onReplay={game.replay}
      onSkip={game.applySkip}
      onGuess={game.submitGuess}
      onAward={game.awardPlayer}
      onNext={game.nextRound}
      onSkipTrack={game.skipTrack}
      onBackToSetup={game.backToSetup}
    />
  )
}
