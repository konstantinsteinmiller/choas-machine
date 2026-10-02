import { reactive } from 'vue'
import { emit } from '../bus'
import type { WeaponId } from '../data/ids'
import type { HintView } from '../sim/coach'

/**
 * ─── The HUD mirror ──────────────────────────────────────────────────────────
 *
 * The one reactive object the simulation writes for the DOM to read. The sim
 * itself keeps plain fields and never touches Vue; it copies what the HUD
 * needs in here, and only when a value CHANGES, so a 60 Hz step never drives a
 * 60 Hz re-render.
 *
 * Anything that moves every frame (the joystick knob, the hold ring) is not
 * in here at all: those are written straight to the DOM by a HUD ticker.
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
  phase: 'boot' as Phase,
  /** Which controls to draw: the touch HUD or the desktop one. */
  device: 'mouse' as 'touch' | 'mouse',
  crouched: false,
  sprinting: false,
  /** The weapon is up. */
  aiming: false,
  /** The camera is in the mech's head, looking through the scope. */
  scoped: false,
  weapon: 'sniper' as WeaponId,
  /** How the mech is getting about: decides which controls make sense. */
  mode: 'ground' as 'ground' | 'ladder' | 'cable' | 'air' | 'mantle',
  /** Lit segments of the base's alert meter, 0 … 5. */
  alert: 0,
  /** Full alert: the stealth phase is over. */
  chaos: false,
  /** Somebody has eyes on the mech right now and the meter is climbing. */
  watched: false,
  /** Rounds in hand: the magazine, or rockets left; −1 for the minigun. */
  ammo: 5,
  reloading: false,
  overheated: false,
  decoys: 0,
  /** A wall the hook can take is in front of the mech. */
  grapple: false,
  /** The hook is out: 'up' while it can still be recalled, 'over' once it cannot. */
  grappling: '' as '' | 'up' | 'over',
  /** How many heard the hook bite. */
  grappleHeard: 0,
  /** The blade's offer right now, or '' when there is none. */
  strike: '' as '' | 'backstab' | 'drop' | 'strike',
  /** Under a third of its armor: the HUD says so. */
  armorLow: false,
  /** A kill-cam is playing: the HUD stands down. */
  cine: false,
  /** What the mission wants next: the target dead, then the way out. */
  objective: 'target' as 'target' | 'extract' | 'done',
  /** The control lessons on screen (replaced only when they change). */
  hints: [] as HintView[]
})

/**
 * The objective's place on screen, for the marker: `x`, `y` in 0 … 1 of the
 * view (left to right, top to bottom), `behind` when it is at the camera's
 * back, `dist` in metres from the mech.
 */
export const waypoint = { on: false, x: 0.5, y: 0.5, behind: false, dist: 0 }

/** The mech's armor and the last hit it took: per-frame, so outside Vue. */
export const vital = {
  /** 0 … 1 of its armor. */
  armor: 1,
  /** Bearing of the last hit from the camera's heading (positive to the LEFT),
   *  and seconds since it. */
  hitAngle: 0,
  hitAge: 9
}

/** The weapon's gauges: they move every frame, so the HUD reads them from a
 *  ticker, not through Vue. */
export const gun = { heat: 0, spool: 0 }

/** Move to another phase and tell the bus. A no-op if nothing changes. */
export const setPhase = (phase: Phase): void => {
  const prev = hud.phase
  if (prev === phase) return
  hud.phase = phase
  emit('phase', { phase, prev })
}

/** Write a field of the mirror only when it changes. */
export const mirror = <K extends keyof typeof hud>(key: K, value: (typeof hud)[K]): void => {
  if (hud[key] !== value) hud[key] = value
}

// ─── Who is noticing the mech: per-frame, so outside Vue ─────────────────────

export const MAX_THREATS = 4
/**
 * The few defenders closest to noticing the mech, for the arcs round the
 * aim point. `angle` is the bearing from the camera's heading (radians,
 * positive to the LEFT); `level` the detection meter; `hot` a sure sighting.
 */
export const threats = {
  n: 0,
  angle: new Float32Array(MAX_THREATS),
  level: new Float32Array(MAX_THREATS),
  hot: new Uint8Array(MAX_THREATS)
}

// ─── HUD tickers: per-frame DOM writes, outside Vue ──────────────────────────

const tickers = new Set<(dt: number) => void>()

/** Run `fn` every rendered frame. Returns the function that stops it. */
export const addHudTicker = (fn: (dt: number) => void): (() => void) => {
  tickers.add(fn)
  return () => { tickers.delete(fn) }
}

/** Called by the live mode once per rendered frame. */
export const runHudTickers = (dt: number): void => {
  for (const fn of tickers) fn(dt)
}
