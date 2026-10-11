import { PAL } from './palette'

/**
 * The mech's paint schemes (#M3), as data: what the save, the menus and the
 * model builder need. Looks only: a scheme changes no rule. CM-07's own
 * lilac is everyone's; the rest unlock for good, with a rewarded video where
 * one can play, or scrap (#M6). The story's scenes always show CM-07 in his
 * own colours, whatever the player wears.
 */
export const PAINT_IDS = ['lilac', 'crimson', 'arctic', 'jungle', 'gilded', 'midnight', 'tangerine'] as const
export type PaintId = (typeof PAINT_IDS)[number]
/** The one every mech has from the start: CM-07's own colours. */
export const FREE_PAINT: PaintId = 'lilac'
/** Scrap to unlock one where there is no rewarded video (and always as the alternative). */
export const PAINT_SCRAP = 500

/**
 * A scheme's colours: the armour plates (body, its highlight and its shade),
 * the suit under them (trim), the visor, the eyes, the glowing power lines
 * (glow) and the blade's edge (decal tint).
 */
export interface MechPalette {
  body: string
  bodyHi: string
  bodyDeep: string
  trim: string
  trimDeep: string
  visor: string
  eye: string
  glow: string
  blade: string
}

export const PAINTS: Readonly<Record<PaintId, MechPalette>> = {
  // CM-07: lilac armour over a dark suit, a pink visor, cyan power lines (`palette.ts`, unchanged).
  lilac: {
    body: PAL.mechArmor, bodyHi: PAL.mechArmorHi, bodyDeep: PAL.mechArmorDeep, trim: PAL.mechSuit, trimDeep: PAL.mechSuitDeep,
    visor: PAL.mechVisor, eye: PAL.mechEye, glow: PAL.mechCore, blade: PAL.mechBlade
  },
  // Racing red over gunmetal, amber eyes, gold lines.
  crimson: {
    body: '#e2454f', bodyHi: '#ff8a86', bodyDeep: '#a92a3b', trim: '#33303f', trimDeep: '#1d1a26',
    visor: '#1a1018', eye: '#ffc23d', glow: '#ffd166', blade: '#ffb03d'
  },
  // Snow-white plates over steel blue, ice-blue light.
  arctic: {
    body: '#e8f1ff', bodyHi: '#ffffff', bodyDeep: '#a9bddc', trim: '#3c5578', trimDeep: '#22344e',
    visor: '#14223a', eye: '#4de8ff', glow: '#9ff6ff', blade: '#7fe9ff'
  },
  // Olive drab over brown webbing, lime light: the field kit.
  jungle: {
    body: '#7f9a4e', bodyHi: '#a9c46e', bodyDeep: '#566c33', trim: '#4a3a2a', trimDeep: '#2d231a',
    visor: '#141a10', eye: '#c6ff4d', glow: '#9dff6a', blade: '#d6ff7a'
  },
  // Polished gold over dark bronze, white light: the show-off.
  gilded: {
    body: '#f2c14e', bodyHi: '#ffe7a3', bodyDeep: '#c08a2a', trim: '#3d2a1c', trimDeep: '#241811',
    visor: '#1e140c', eye: '#ffffff', glow: '#fff3c4', blade: '#ffe08a'
  },
  // Gunmetal over black, red eyes: the night raider. Light enough to read at dusk.
  midnight: {
    body: '#5a5f80', bodyHi: '#8a90b4', bodyDeep: '#3d4160', trim: '#1c1d2b', trimDeep: '#101119',
    visor: '#0a0a10', eye: '#ff3b4e', glow: '#ff5a6e', blade: '#ff4d6a'
  },
  // Safety orange over deep teal, teal light: the demolition crew.
  tangerine: {
    body: '#ff9a3d', bodyHi: '#ffc58a', bodyDeep: '#d0672a', trim: '#16505a', trimDeep: '#0d333a',
    visor: '#0c1f24', eye: '#3dfff0', glow: '#5ffff2', blade: '#7affef'
  }
}

/** A stored value as a scheme, or the free one. */
export const asPaint = (v: unknown): PaintId => ((PAINT_IDS as readonly unknown[]).includes(v) ? (v as PaintId) : FREE_PAINT)
