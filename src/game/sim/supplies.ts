import type { Arsenal } from './weapons'
import type { Armor } from './armor'

/**
 * ─── What the mech picks up in a fortress ────────────────────────────────────
 *
 * Round 4 made the mech live off the land (#76, #101). Armor does not mend by
 * itself any more and ammunition runs out, so a raid is paced by what lies
 * about:
 *  - repair kits (a wrench across a handful of screws) mend KIT_ARMOR;
 *  - ammo crates ("weapon piles") fill the rifle's reserve and the mini-gun's
 *    belt and put a rocket back in the rack;
 *  - a fallen guard drops a pouch: a few rifle rounds and a stretch of belt.
 * The mech takes one by walking over it, and only when it is short of what
 * it gives, so a full mech walks past and leaves it for later. Pure.
 */

export type SupplyKind = 'kit' | 'crate' | 'pouch'

export interface Supply {
  kind: SupplyKind
  x: number
  /** The floor it lies on. */
  y: number
  z: number
  taken: boolean
}

export const KIT_ARMOR = 40
/** A guard's pouch: rifle rounds and mini-gun belt. */
export const POUCH_RIFLE = 5
export const POUCH_BELT = 60
/** A crate: the belt by this much (the rifle's reserve to full), and a rocket. */
export const CRATE_BELT = 150
export const CRATE_ROCKETS = 1
/** Walk this near to take one; a step up or down is fine. */
export const PICK_M = 1.6
const PICK_DY = 1.5

/** Would the mech get anything out of it right now? */
export const wants = (s: Supply, a: Arsenal, armor: Armor, rocketMax: number): boolean => {
  if (s.kind === 'kit') return armor.hp < armor.max && !armor.down
  const rifle = a.sniperReserve < a.sniperReserveMax
  const belt = a.minigunBelt < a.minigunBeltMax
  if (s.kind === 'pouch') return rifle || belt
  return rifle || belt || a.rockets + (a.rocketLoaded ? 1 : 0) < rocketMax
}

/** Take it: what it gives goes into the mech. */
export const take = (s: Supply, a: Arsenal, armor: Armor, rocketMax: number): void => {
  s.taken = true
  if (s.kind === 'kit') {
    armor.hp = Math.min(armor.max, armor.hp + KIT_ARMOR)
    return
  }
  if (s.kind === 'pouch') {
    a.sniperReserve = Math.min(a.sniperReserveMax, a.sniperReserve + POUCH_RIFLE)
    a.minigunBelt = Math.min(a.minigunBeltMax, a.minigunBelt + POUCH_BELT)
    return
  }
  a.sniperReserve = a.sniperReserveMax
  a.minigunBelt = Math.min(a.minigunBeltMax, a.minigunBelt + CRATE_BELT)
  const room = rocketMax - a.rockets - (a.rocketLoaded ? 1 : 0)
  a.rockets += Math.max(0, Math.min(CRATE_ROCKETS, room))
}

/** The supply the mech stands on and wants, or null. */
export const supplyUnderfoot = (list: readonly Supply[], x: number, y: number, z: number, a: Arsenal, armor: Armor, rocketMax: number): Supply | null => {
  for (const s of list) {
    if (s.taken || Math.hypot(s.x - x, s.z - z) > PICK_M || Math.abs(s.y - y) > PICK_DY) continue
    if (wants(s, a, armor, rocketMax)) return s
  }
  return null
}
