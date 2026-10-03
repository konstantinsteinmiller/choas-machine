import { ref, watch } from 'vue'
import { getState, setState } from '@/use/useGameState'
import { saveDataVersion } from '@/use/useSaveStatus'
import { LOOK_SENS_KEY, SCOPE_SENS_KEY } from '@/keys'

/**
 * The look sensitivity setting (Options → Controls): a multiplier on how far
 * a drag or a mouse move turns the camera. 1 is the tuned default.
 */
export const LOOK_SENS_MIN = 0.4
export const LOOK_SENS_MAX = 2

const clamp = (v: unknown): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 1
  return Math.min(LOOK_SENS_MAX, Math.max(LOOK_SENS_MIN, n))
}
const readPersisted = (): number => clamp(getState<number>(LOOK_SENS_KEY, 1))

export const lookSensitivity = ref<number>(readPersisted())

// A cloud save that lands after boot carries the player's choice too.
watch(saveDataVersion, () => {
  const v = readPersisted()
  if (v !== lookSensitivity.value) lookSensitivity.value = v
})

export const setLookSensitivity = (next: number): void => {
  const v = Math.round(clamp(next) * 100) / 100
  lookSensitivity.value = v
  setState(LOOK_SENS_KEY, v)
}

/**
 * The scope's own sensitivity: a multiplier on top of the look sensitivity
 * while the sniper's scope is up (the zoom already slows the turn by the
 * magnification). A little under 1 by default: a steady reticle.
 */
export const SCOPE_SENS_DEFAULT = 0.8
const readScope = (): number => {
  const v = getState<number>(SCOPE_SENS_KEY, SCOPE_SENS_DEFAULT)
  const n = typeof v === 'number' && Number.isFinite(v) ? v : SCOPE_SENS_DEFAULT
  return Math.min(LOOK_SENS_MAX, Math.max(LOOK_SENS_MIN, n))
}
export const scopeSensitivity = ref<number>(readScope())
watch(saveDataVersion, () => {
  const v = readScope()
  if (v !== scopeSensitivity.value) scopeSensitivity.value = v
})
export const setScopeSensitivity = (next: number): void => {
  const v = Math.round(Math.min(LOOK_SENS_MAX, Math.max(LOOK_SENS_MIN, next)) * 100) / 100
  scopeSensitivity.value = v
  setState(SCOPE_SENS_KEY, v)
}
