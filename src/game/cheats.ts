import { registerCheat } from '@/use/useCheats'
import { getState, setState } from '@/use/useGameState'
import { SCRAP_KEY } from '@/keys'
import { app } from './engine/app'
import { flow, startTraining } from './flow'

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
  // The cross-browser smoke test (`scripts/xbrowser.mjs`) ends a mission with this.
  registerCheat('ctrl+shift+alt+o', 'Objective done: extract now', () => {
    (app.mode as { cheatExtract?: () => void } | null)?.cheatExtract?.()
  })
  // Straight to a training room (#116): ctrl+shift+F1 … F12 (the training ground starts first if need be).
  for (let n = 1; n <= 12; n++) {
    registerCheat(`ctrl+shift+f${n}`, `Training room ${n}`, () => {
      const jump = (): void => { (app.mode as { cheatTrainingRoom?: (i: number) => void } | null)?.cheatTrainingRoom?.(n - 1) }
      if (flow.training && flow.screen === 'mission') jump()
      else void startTraining().then(() => setTimeout(jump, 300))
    })
  }
}
