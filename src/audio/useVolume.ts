import { useCallback, useState } from 'react'
import { audioEngine } from './engine'

export function useVolume() {
  const [volume, setVolumeState] = useState(() => audioEngine.getVolume())

  const setVolume = useCallback((value: number) => {
    audioEngine.setVolume(value)
    setVolumeState(audioEngine.getVolume())
  }, [])

  return { volume, setVolume }
}
