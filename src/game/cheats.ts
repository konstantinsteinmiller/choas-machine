import { registerCheat } from '@/use/useCheats'
import { getState, setState } from '@/use/useGameState'
import { SCRAP_KEY } from '@/keys'

/**
 * Dev cheats. They only fire when cheats are enabled: `localStorage.cheat =
 * 'true'` plus a reload (see `useCheats`), so a shipped build keeps them
 * behind DevTools. They are registered from the game chunk, because the eager
 * App shell must never import the sim. All sit on ctrl+shift+alt, which no
 * game control uses.
 */
export const registerGameCheats = (): void => {
  registerCheat('ctrl+shift+alt+b', '+1000 Tech Scrap', () => {
    setState(SCRAP_KEY, (Number(getState(SCRAP_KEY, 0)) || 0) + 1000)
  })
}
