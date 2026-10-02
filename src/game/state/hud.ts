import { reactive } from 'vue'
import { emit } from '../bus'

/**
 * ─── The HUD mirror ──────────────────────────────────────────────────────────
 *
 * The one reactive object the simulation writes for the DOM to read. The sim
 * itself keeps plain fields and never touches Vue; it copies what the HUD
 * needs in here at a throttled rate, so a 60 Hz step never drives a 60 Hz
 * re-render.
 *
 * `phase` is also the contract with the platform layer: `isGameplayLive` and
 * the Playgama ready signal (`whenInteractive`) key off it.
 */

/**
 * Where the current screen is in its life:
 * - `boot`  nothing built yet (the loader is up)
 * - `intro` the drop-in cinematic; no input
 * - `play`  the player has control of the mech
 * - `outro` the extraction cinematic; no input
 * - `dead`  the mech is down, the defeat screen follows
 * - `done`  the mission is over, the rewards screen is up
 * - `base`  the Mobile Command Base (menus)
 */
export type Phase = 'boot' | 'intro' | 'play' | 'outro' | 'dead' | 'done' | 'base'

export const hud = reactive({
  phase: 'boot' as Phase
})

/** Move to another phase and tell the bus. A no-op if nothing changes. */
export const setPhase = (phase: Phase): void => {
  const prev = hud.phase
  if (prev === phase) return
  hud.phase = phase
  emit('phase', { phase, prev })
}
