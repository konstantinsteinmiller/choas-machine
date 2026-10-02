import { flow } from '@/game/flow'
import { isGamePaused } from '@/use/useGamePause'

/**
 * F1, "?" and the HUD's help button: open the controls legend. A second press
 * closes it. Another modal (rewards, defeat, pause) is never replaced, and
 * nothing opens under an ad or a portal pause.
 */
export const toggleHelp = (): void => {
  if (flow.modal === 'controls') {
    flow.modal = ''
    return
  }
  if (flow.modal || flow.screen === 'boot') return
  if (isGamePaused.value) return
  flow.modal = 'controls'
}
