import type { GameIconName } from '@/components/icons/iconNames'
import type { HintId } from '@/game/sim/coach'
import type { PromptKind } from '@/game/state/hud'
import type { WeaponId } from '@/game/data/ids'

/**
 * ─── What each on-screen button looks like (#160) ────────────────────────────
 *
 * Every control the HUD offers has its own colour AND its own shape, so a
 * button can be named by its look alone (colour-blind players read the
 * shape): the shape says the family, the colour tells the family's members
 * apart. One table, read by the buttons themselves and by everything that
 * points at one: the hologram's press (`DemoPop`), the prompt over the world
 * (`WorldPrompt`) and the lessons (`ControlHints`) draw a small copy of the
 * very button to press, the way a desktop shows its keycap.
 *
 *   round    the hands on something: backstab, loot, burn, sabotage, drag
 *   diamond  the gadgets: hook, rope, decoy, hide box
 *   hex      the body: jump, crouch, sprint
 *   plate    the weapons: fire, the weapon in hand, zoom, cancel
 */

export type ButtonShape = 'plate' | 'hex' | 'diamond' | 'round'
export type ButtonTone = 'cyan' | 'pink' | 'violet' | 'warn' | 'danger' | 'ok' | 'lilac'
export type TouchButton =
  | 'strike' | 'loot' | 'burn' | 'sabotage' | 'drag'
  | 'grapple' | 'rope' | 'decoy' | 'hide'
  | 'jump' | 'crouch' | 'sprint'
  | 'fire' | 'weapon' | 'zoom' | 'cancel'

export interface ButtonLook { shape: ButtonShape; tone: ButtonTone; icon: GameIconName }

/** The weapon in hand colours its own chip (and the fire button's picture). */
export const WEAPON_TONES: Readonly<Record<WeaponId, ButtonTone>> = { sniper: 'cyan', minigun: 'violet', rocket: 'danger' }

export const BUTTON_LOOK: Readonly<Record<TouchButton, ButtonLook>> = {
  strike: { shape: 'round', tone: 'pink', icon: 'blade' },
  loot: { shape: 'round', tone: 'warn', icon: 'scrap' },
  burn: { shape: 'round', tone: 'danger', icon: 'flame' },
  sabotage: { shape: 'round', tone: 'lilac', icon: 'siren' },
  drag: { shape: 'round', tone: 'cyan', icon: 'skull' },
  grapple: { shape: 'diamond', tone: 'cyan', icon: 'hook' },
  rope: { shape: 'diamond', tone: 'ok', icon: 'rope' },
  decoy: { shape: 'diamond', tone: 'pink', icon: 'decoy' },
  hide: { shape: 'diamond', tone: 'violet', icon: 'box' },
  jump: { shape: 'hex', tone: 'cyan', icon: 'up' },
  crouch: { shape: 'hex', tone: 'violet', icon: 'crouch' },
  sprint: { shape: 'hex', tone: 'warn', icon: 'sprint' },
  fire: { shape: 'plate', tone: 'pink', icon: 'sniper' },
  weapon: { shape: 'plate', tone: 'cyan', icon: 'sniper' },
  zoom: { shape: 'plate', tone: 'ok', icon: 'scope' },
  cancel: { shape: 'plate', tone: 'warn', icon: 'close' }
}

/** The button a lesson's control is pressed with on touch; none for a gesture (the stick, a swipe, a hold). */
export const HINT_BUTTON: Readonly<Partial<Record<HintId, TouchButton>>> = {
  blade: 'strike', loot: 'loot', burn: 'burn', sabotage: 'sabotage',
  grapple: 'grapple', rope: 'rope', decoy: 'decoy', hide: 'hide',
  jump: 'jump', crouch: 'crouch', sprint: 'sprint',
  weapon: 'weapon', rocket: 'weapon'
}

/** The button an in-world prompt is answered with on touch. */
export const PROMPT_BUTTON: Readonly<Record<Exclude<PromptKind, ''>, TouchButton>> = {
  strike: 'strike', assassinate: 'strike', salvage: 'loot', sabotage: 'sabotage', silence: 'sabotage', cutPower: 'sabotage',
  jam: 'sabotage', hook: 'grapple', rope: 'rope', grab: 'drag', drop: 'drag', burn: 'burn'
}

/** A button's look with the picture it shows right now (the weapon in hand, a lesson's weapon). */
export const lookOf = (b: TouchButton, weapon: WeaponId = 'sniper', hint?: HintId): ButtonLook => {
  const l = BUTTON_LOOK[b]
  if (b === 'weapon') {
    const w: WeaponId = hint === 'rocket' ? 'rocket' : weapon
    return { ...l, tone: WEAPON_TONES[w], icon: w }
  }
  if (b === 'fire') return { ...l, icon: weapon }
  return l
}

/** A tone as its colour token, for whatever wears a button's colour (a prompt's edge). */
export const toneVar = (t: ButtonTone): string => `var(--cm-${t})`

/** On touch, a control with no button: the gesture that does it (the stick, a swipe, a hold). */
export const HINT_GESTURE: Readonly<Partial<Record<HintId, 'drag' | 'swipe' | 'hold' | 'release' | 'push' | 'tap'>>> = {
  move: 'drag', climb: 'push', cable: 'push', supply: 'push', goal: 'push', look: 'swipe', scope: 'hold', fire: 'release'
}
