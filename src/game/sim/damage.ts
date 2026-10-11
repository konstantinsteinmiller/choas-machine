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
/** What a drone's shell lets through of a sniper round (its eye takes all of it). */
export const DRONE_SHELL = 0.32
const KILL = 1e6

const isHuman = (k: PostKind): boolean => k === 'guard' || k === 'sentry'
/** The Warden's helmet takes the edge off a headshot; his shield stops a round dead. */
export const WARDEN_HEAD = 2
const WARDEN_BODY = 0.7

/**
 * Damage of one round of `weapon` on `kind`, hit in `zone`. `mul` is the
 * weapon's tier and damage track (`data/upgrades`).
 */
/**
 * A guard or a sentry and the sniper (#60): one round to the head, two to the
 * body, three to the limbs. Shares of its full health, so the counts hold at
 * every threat level; the damage track still shortens them.
 */
export const HUMAN_BODY = 0.51
/** A sniper round into a Roomba's shell, short of its dome: half a kill (#72). */
const ROOMBA_SHELL = 0.42
export const HUMAN_LIMB = 0.34

export const shotDamage = (weapon: WeaponId, kind: PostKind, zone: Zone, mul = 1, maxHp = 30): number => {
  const base = BASE_DAMAGE[weapon] * mul
  if (weapon === 'sniper') {
    // A drone dies to a round in its eye; its shell takes a third of one.
    // A lamp is a lamp: any round puts it out.
    if (kind === 'drone') return zone === 'weak' ? KILL : base * DRONE_SHELL
    if (kind === 'searchlight' || kind === 'hound') return KILL
    // A Roomba (#72): a round in its dome ends it; its shell takes two.
    if (kind === 'roomba') return zone === 'weak' ? KILL : base * ROOMBA_SHELL
    if (isHuman(kind)) return zone === 'head' ? KILL : maxHp * (zone === 'limb' ? HUMAN_LIMB : HUMAN_BODY) * mul
    if (kind === 'commander') return zone === 'armor' ? 0 : zone === 'head' ? base * WARDEN_HEAD : zone === 'limb' ? base * WARDEN_BODY * 0.7 : base * WARDEN_BODY
    if (kind === 'enforcer') return zone === 'head' ? base * 2.5 : zone === 'joint' ? base * 1.5 : base * 0.6
    return zone === 'weak' ? base : base * 0.1
  }
  if (weapon === 'minigun') {
    if (kind === 'drone' || kind === 'searchlight' || kind === 'hound') return base * 2
    if (kind === 'roomba') return base * (zone === 'weak' ? 2.5 : 1.5)
    if (isHuman(kind)) return zone === 'head' ? base * 2 : zone === 'limb' ? base * 0.7 : base
    if (kind === 'commander') return zone === 'armor' ? base * 0.1 : zone === 'head' ? base * 2 : base
    if (kind === 'enforcer') return zone === 'joint' ? base * 3 : zone === 'head' ? base : base * 0.5
    if (kind === 'goliath') return zone === 'weak' ? base * 1.5 : base * GOLIATH_PLATE_MINIGUN
    return zone === 'weak' ? base * 1.5 : base * 0.1
  }
  // A rocket that hits something directly: the blast below does the rest.
  return 0
}

export const BLAST_RADIUS = 5.5
/** A rocket on the Goliath's plate takes this share of its hit points (three end it); in its vents, this. */
export const GOLIATH_PLATE_SHARE = 0.34
export const GOLIATH_REAR_SHARE = 0.5
/**
 * A mini-gun round on the Goliath's plate: a full belt (100 rounds) takes about
 * an eighth off it at threat III, so the playtester's two rockets (all a raid
 * starts with) and three belts are just enough.
 */
export const GOLIATH_PLATE_MINIGUN = 0.45
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
export const blast = (
  gar: Garrison, g: Grid, x: number, y: number, z: number, direct: number, radius = BLAST_RADIUS, mul = 1
): BlastResult => {
  const res: BlastResult = { kills: [], hurt: [], weakHit: false }
  for (const u of gar.units) {
    if (u.state === 'dead' || u.state === 'reserve') continue
    const spec = SPECS[u.kind]
    const dist = Math.max(0, Math.hypot(u.x - x, u.z - z, u.y + spec.height * 0.5 - y) - spec.radius)
    if (dist > radius) continue
    let amount = BASE_DAMAGE.rocket * mul * (1 - 0.75 * (dist / radius))
    // Behind a wall, nothing reaches it (#69): the blast has to see some of it.
    if (u.id !== direct) {
      const from = y + 0.3
      const open = [0.2, 0.6, 0.95].some(k => hasLineOfSight(g, x, from, z, u.x, u.y + spec.height * k, u.z))
      if (!open) continue
    }
    // A blast knocks a guard's riot shield away (#90; the Warden's is strapped on).
    if (u.shield && !u.boss) {
      u.shield = false
      gar.events.push({ type: 'shieldDown', id: u.id })
    }
    if (u.kind === 'goliath') {
      // A share of the tank, not of a rocket: three on its plate end it, at
      // any threat level, two in its vents from astern. (Plate took 35 % of a
      // flat 400 against 3,450 hit points at threat III: a playtester's two
      // rockets and three full belts left it standing — "indestructible".)
      const astern = Math.abs(angleDelta(u.yaw + Math.PI, headingTo(u.x, u.z, x, z))) < REAR_ARC
      if (astern) res.weakHit = true
      // A rocket that struck the hull takes the whole share; a blast beside it, less with distance.
      const near = u.id === direct ? 1 : 1 - 0.75 * (dist / radius)
      amount = u.maxHp * (astern ? GOLIATH_REAR_SHARE : GOLIATH_PLATE_SHARE) * mul * near
    }
    if (damageUnit(gar, u.id, amount, x, z, 'blast')) res.kills.push(u.id)
    else res.hurt.push(u.id)
  }
  return res
}
