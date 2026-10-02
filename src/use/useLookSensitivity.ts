import { ref, watch } from 'vue'
import { getState, setState } from '@/use/useGameState'
import { saveDataVersion } from '@/use/useSaveStatus'
import { LOOK_SENS_KEY } from '@/keys'

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
