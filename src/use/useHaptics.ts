// ─── Haptics: the weapons in the hand ───────────────────────────────────────
//
// GDD 5: each weapon has its own vibration — a heavy thud for the sniper, a
// rapid rumble for the minigun, a sharp kick for the blade. A phone has three
// ways to tell the player something happened (pixels, the speaker, the motor),
// and the motor is the only one that works with the sound off.
//
// The gates: a vibration is felt through an ad overlay and through a pause, so
// nothing fires while the game is paused, and a portal that muted the game
// gets a quiet phone too. The player's own switch is in Options.

import { ref, watch } from 'vue'
import { mobileCheck } from '@/utils/function'
import { isGamePaused } from '@/use/useGamePause'
import { isPlatformAudioMuted } from '@/use/useGamePauseAudio'
import { getState, setState } from '@/use/useGameState'
import { saveDataVersion } from '@/use/useSaveStatus'
import { HAPTICS_KEY } from '@/keys'

export type HapticCue = 'tap' | 'blade' | 'sniper' | 'minigun' | 'rocket' | 'blast' | 'hurt' | 'alarm' | 'reward'

/**
 * Pattern per cue, in milliseconds. A phone's motor takes 20–30 ms to spin up
 * and as long to coast down: under ~10 ms is a tap, over ~60 ms a rumble.
 */
const PATTERNS: Record<HapticCue, number | number[]> = {
  /** A HUD control taken. */
  tap: 8,
  /** Sharp: the blade goes in. */
  blade: [14, 30, 22],
  /** One heavy thud. */
  sniper: 45,
  /** A round of the rumble; the budget below turns a burst into a purr. */
  minigun: 16,
  rocket: [30, 40, 20],
  /** An explosion, by its shape: the crack, then the roll. */
  blast: [50, 30, 90],
  hurt: 30,
  /** The base goes loud. */
  alarm: [25, 70, 25, 70, 25],
  reward: 25
}

/** Per cue: a minimum gap and a cap per rolling window, so a stream of events
 *  never becomes one continuous buzz. */
interface Budget { minGapMs: number; maxPerWindow: number; windowMs: number }
const BUDGETS: Record<HapticCue, Budget> = {
  tap: { minGapMs: 60, maxPerWindow: 6, windowMs: 700 },
  blade: { minGapMs: 200, maxPerWindow: 3, windowMs: 1500 },
  sniper: { minGapMs: 200, maxPerWindow: 4, windowMs: 2000 },
  // 15 rounds a second through the gun; 8 pulses a second through the hand.
  minigun: { minGapMs: 120, maxPerWindow: 9, windowMs: 1000 },
  rocket: { minGapMs: 300, maxPerWindow: 3, windowMs: 2000 },
  blast: { minGapMs: 300, maxPerWindow: 3, windowMs: 2000 },
  hurt: { minGapMs: 250, maxPerWindow: 4, windowMs: 1500 },
  alarm: { minGapMs: 2000, maxPerWindow: 1, windowMs: 4000 },
  reward: { minGapMs: 220, maxPerWindow: 3, windowMs: 1500 }
}

const lastAt: Partial<Record<HapticCue, number>> = {}
const windowHits: Partial<Record<HapticCue, number[]>> = {}

const passesBudget = (id: HapticCue): boolean => {
  const b = BUDGETS[id]
  const now = performance.now()
  if (now - (lastAt[id] ?? -Infinity) < b.minGapMs) return false
  const hits = (windowHits[id] ??= [])
  while (hits.length > 0 && now - hits[0]! > b.windowMs) hits.shift()
  if (hits.length >= b.maxPerWindow) return false
  hits.push(now)
  lastAt[id] = now
  return true
}

/**
 * Is there a motor to drive at all? `navigator.vibrate` is absent on iOS, and
 * present but a silent no-op on desktop Chrome: both checks are needed, or
 * the Options switch shows up where it does nothing. Resolved once.
 */
export const hapticsAvailable: boolean =
  typeof navigator !== 'undefined' &&
  typeof navigator.vibrate === 'function' &&
  mobileCheck()

/** Absent means ON. Only ever true where the motor exists. */
const readPersisted = (): boolean =>
  hapticsAvailable && getState<boolean>(HAPTICS_KEY, true) !== false

/** The player's choice (Options). */
export const hapticsEnabled = ref<boolean>(readPersisted())

// A save that arrives after boot (cloud builds) must be honoured.
watch(saveDataVersion, () => {
  if (!hapticsAvailable) return
  const persisted = readPersisted()
  if (persisted !== hapticsEnabled.value) hapticsEnabled.value = persisted
})

export const setHapticsEnabled = (next: boolean): void => {
  if (!hapticsAvailable) return
  hapticsEnabled.value = next
  setState(HAPTICS_KEY, next)
  // Stop a running pattern the moment it is switched off.
  if (!next) {
    try { navigator.vibrate(0) } catch { /* see `haptic()` */ }
  }
}

/**
 * Fire one cue. Safe to call from the simulation at any density. Never
 * throws and never logs: some browsers refuse a vibration without a recent
 * gesture, and that must not cost a console line per shot.
 */
export const haptic = (id: HapticCue): void => {
  if (!hapticsAvailable) return
  if (!hapticsEnabled.value) return
  if (isGamePaused.value) return
  if (isPlatformAudioMuted.value) return
  if (!passesBudget(id)) return
  try {
    navigator.vibrate(PATTERNS[id])
  } catch { /* the picture carries the moment */ }
}

/** Test-only: drop the throttle history. */
export const __resetHapticThrottle = (): void => {
  for (const k of Object.keys(lastAt) as HapticCue[]) delete lastAt[k]
  for (const k of Object.keys(windowHits) as HapticCue[]) delete windowHits[k]
}
