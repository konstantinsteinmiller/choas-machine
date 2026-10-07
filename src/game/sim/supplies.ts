import { SNIPER_MAG, type Arsenal } from './weapons'
import type { Armor } from './armor'

/**
 * ─── What the mech picks up in a fortress ────────────────────────────────────
 *
 * Round 4 made the mech live off the land (#76, #101). Armor does not mend by
 * itself any more and ammunition runs out, so a raid is paced by what lies
 * about:
 *  - repair kits (a wrench across a handful of screws) mend KIT_ARMOR;
 *  - ammo crates ("weapon piles") add rifle rounds and belt and put a rocket
 *    back in the rack (Round 5, #143: they top up, they no longer fill);
 *  - a fallen guard drops one or two rifle rounds (#183: the belt he used to
 *    drop was rarely wanted; a round for the rifle always is).
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
  /** A dropped pouch's rifle rounds, 1 or 2 (#183). */
  rounds?: number
}

export const KIT_ARMOR = 40
/** A guard's drop: one or two rifle rounds (#183), no belt. */
export const POUCH_ROUNDS_MIN = 1
export const POUCH_ROUNDS_MAX = 2
/** A crate: rifle rounds, belt, and a rocket. */
export const CRATE_RIFLE = 5
export const CRATE_BELT = 60
export const CRATE_ROCKETS = 1
/** Walk this near to take one; a step up or down is fine. */
export const PICK_M = 1.6
const PICK_DY = 1.5

/** Would the mech get anything out of it right now? */
export const wants = (s: Supply, a: Arsenal, armor: Armor, rocketMax: number): boolean => {
  if (s.kind === 'kit') return armor.hp < armor.max && !armor.down
  const rifle = a.sniperReserve < a.sniperReserveMax
  const belt = a.minigunBelt < a.minigunBeltMax
  // A round fits in the reserve, or straight into a magazine that is not full.
  if (s.kind === 'pouch') return rifle || a.sniperMag < SNIPER_MAG
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
    let n = s.rounds ?? POUCH_ROUNDS_MIN
    const into = Math.min(n, a.sniperReserveMax - a.sniperReserve)
    a.sniperReserve += into
    n -= into
    a.sniperMag = Math.min(SNIPER_MAG, a.sniperMag + n)
    return
  }
  a.sniperReserve = Math.min(a.sniperReserveMax, a.sniperReserve + CRATE_RIFLE)
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
