import { hasLineOfSight, type Grid } from '../world/grid'
import type { PostKind } from '../world/fortress'
import type { WeaponId } from '../data/ids'
import { angleDelta } from './player'
import { SPECS, damageUnit, headingTo, type Garrison } from './garrison'
import type { Zone } from './hitscan'

/**
 * ─── What a hit is worth ─────────────────────────────────────────────────────
 *
 * One table for the three weapons against the five kinds of defender, by the
 * zone that was hit. The shape of it is the GDD's: the sniper ends a human
 * with one round to the head; the minigun chews through an Enforcer's joints
 * and does little to its plate; the Goliath shrugs at everything from the
 * front and dies to rockets in its rear vents.
 */

export const BASE_DAMAGE: Readonly<Record<WeaponId, number>> = { sniper: 34, minigun: 9, rocket: 400 }
const KILL = 1e6

const isHuman = (k: PostKind): boolean => k === 'guard' || k === 'sentry' || k === 'commander'

/** Damage of one round of `weapon` on `kind`, hit in `zone`. */
export const shotDamage = (weapon: WeaponId, kind: PostKind, zone: Zone): number => {
  const base = BASE_DAMAGE[weapon]
  if (weapon === 'sniper') {
    if (kind === 'drone') return KILL
    if (isHuman(kind)) return zone === 'head' ? KILL : base
    if (kind === 'enforcer') return zone === 'head' ? base * 2.5 : zone === 'joint' ? base * 1.5 : base * 0.6
    return zone === 'weak' ? base : base * 0.1
  }
  if (weapon === 'minigun') {
    if (kind === 'drone') return base * 2
    if (isHuman(kind)) return zone === 'head' ? base * 2 : base
    if (kind === 'enforcer') return zone === 'joint' ? base * 3 : zone === 'head' ? base : base * 0.5
    return zone === 'weak' ? base * 1.5 : base * 0.1
  }
  // A rocket that hits something directly: the blast below does the rest.
  return 0
}

export const BLAST_RADIUS = 5.5
/** The Goliath's rear: within this of dead astern, a blast gets at the vents. */
const REAR_ARC = 1.05

export interface BlastResult {
  /** Units that died of it. */
  kills: number[]
  /** Units that were hurt and lived. */
  hurt: number[]
  /** It reached the Goliath's vents. */
  weakHit: boolean
}

/**
 * A rocket goes off at a point. Everyone in the radius is hurt, less with
 * distance and much less behind a wall; plate takes a fraction, the Goliath's
 * vents take triple.
 */
export const blast = (gar: Garrison, g: Grid, x: number, y: number, z: number, direct: number): BlastResult => {
  const res: BlastResult = { kills: [], hurt: [], weakHit: false }
  for (const u of gar.units) {
    if (u.state === 'dead' || u.state === 'reserve') continue
    const spec = SPECS[u.kind]
    const dist = Math.max(0, Math.hypot(u.x - x, u.z - z, u.y + spec.height * 0.5 - y) - spec.radius)
    if (dist > BLAST_RADIUS) continue
    let amount = BASE_DAMAGE.rocket * (1 - 0.75 * (dist / BLAST_RADIUS))
    if (u.id !== direct && !hasLineOfSight(g, x, y + 0.3, z, u.x, u.y + spec.height * 0.6, u.z)) amount *= 0.15
    if (u.kind === 'goliath') {
      // From astern the blast gets into the vents; anywhere else it is plate.
      const astern = Math.abs(angleDelta(u.yaw + Math.PI, headingTo(u.x, u.z, x, z))) < REAR_ARC
      if (astern) { amount *= 3; res.weakHit = true } else amount *= 0.35
    }
    if (damageUnit(gar, u.id, amount, x, z)) res.kills.push(u.id)
    else res.hurt.push(u.id)
  }
  return res
}
