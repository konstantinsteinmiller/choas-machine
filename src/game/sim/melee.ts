import { VOID, hasLineOfSight, heightAt, raycast, type Grid } from '../world/grid'
import { angleDelta } from './player'
import { headingTo, lureTo, type Garrison, type Unit } from './garrison'

/**
 * ─── The blade, and the decoy ────────────────────────────────────────────────
 *
 * The two silent tools. Pure.
 *
 * The blade is contextual (GDD 2.1): close behind a guard it is a backstab,
 * from a ledge above one it is a drop, and face to face it is a plain strike.
 * `findStrike` says which is on offer right now, so the HUD can show it and
 * the right-side tap can take it.
 */

export type StrikeKind = 'backstab' | 'drop' | 'strike' | 'air'
export interface Strike { id: number; kind: StrikeKind }

/** Reach of the blade on the level, and of a drop from above. */
export const BLADE_REACH = 2.4
export const DROP_REACH = 4.5
/** A drop needs at least this much height over the target. */
export const DROP_MIN_HEIGHT = 1.8
/** Past this angle off the target's nose the mech is behind it. */
const BEHIND = (100 * Math.PI) / 180

const isHuman = (u: Unit): boolean => u.kind === 'guard' || u.kind === 'sentry' || u.kind === 'commander'

/** From a rope (jam build): how far out (m) and how far below (m) a target may be. */
export const ROPE_STRIKE_REACH = 5.5
export const ROPE_STRIKE_MIN = 1.4
export const ROPE_STRIKE_MAX = 9

/** What a rope assassination can take: people and the walking machines, never a boss. */
const ropeTarget = (u: Unit): boolean =>
  isHuman(u) || u.kind === 'enforcer' || u.kind === 'roomba' || u.kind === 'hound'

/**
 * The assassination on offer from a rope (jam build): a person or a walking
 * machine below, within reach and in clear sight, the one nearest to where
 * the camera looks. Null when there is none.
 */
export const findRopeStrike = (gar: Garrison, g: Grid, x: number, y: number, z: number, lookYaw: number): Strike | null => {
  let best: Strike | null = null
  let bestScore = Infinity
  for (const u of gar.units) {
    if (u.state === 'dead' || u.state === 'reserve' || u.state === 'dormant' || !ropeTarget(u) || u.boss) continue
    const dist = Math.hypot(u.x - x, u.z - z)
    const below = y - u.y
    if (dist > ROPE_STRIKE_REACH || below < ROPE_STRIKE_MIN || below > ROPE_STRIKE_MAX) continue
    if (!hasLineOfSight(g, x, y + 0.5, z, u.x, u.y + 1.2, u.z)) continue
    const score = Math.abs(angleDelta(lookYaw, headingTo(x, z, u.x, u.z))) + dist * 0.15
    if (score < bestScore) { bestScore = score; best = { id: u.id, kind: 'air' } }
  }
  return best
}

/**
 * The strike on offer from where the mech stands, or null. With several in
 * reach, the one nearest to where the camera looks wins.
 */
export const findStrike = (gar: Garrison, g: Grid, x: number, y: number, z: number, lookYaw: number, grounded: boolean): Strike | null => {
  if (!grounded) return null
  let best: Strike | null = null
  let bestScore = Infinity
  for (const u of gar.units) {
    // A boss is not taken quietly: no blade reaches it.
    if (u.state === 'dead' || u.state === 'reserve' || !isHuman(u) || u.boss) continue
    const dist = Math.hypot(u.x - x, u.z - z)
    const above = y - u.y
    let kind: StrikeKind | null = null
    if (above >= DROP_MIN_HEIGHT && dist <= DROP_REACH && dist > 0.2) {
      if (hasLineOfSight(g, x, y + 1.2, z, u.x, u.y + 1.2, u.z)) kind = 'drop'
    } else if (Math.abs(above) < 1 && dist <= BLADE_REACH) {
      const off = Math.abs(angleDelta(u.yaw, headingTo(u.x, u.z, x, z)))
      kind = off > BEHIND ? 'backstab' : 'strike'
      if (!hasLineOfSight(g, x, y + 1.2, z, u.x, u.y + 1.2, u.z)) kind = null
    }
    if (!kind) continue
    const score = Math.abs(angleDelta(lookYaw, headingTo(x, z, u.x, u.z))) + dist * 0.15
    if (score < bestScore) { bestScore = score; best = { id: u.id, kind } }
  }
  return best
}

// ─── Decoys ──────────────────────────────────────────────────────────────────

export const DECOYS_PER_MISSION = 3
export const DECOY_LIFE_S = 9
export const DECOY_RANGE = 12
/** Guards this near who can see it come over. */
export const DECOY_LURE_RADIUS = 17
const DECOY_PULSE_S = 0.6

export interface Decoy {
  x: number
  y: number
  z: number
  /** Heading the hologram stands at. */
  yaw: number
  /** Seconds since it lit up, and how long it lasts. */
  t: number
  life: number
  pulse: number
}

/**
 * Where a decoy thrown from (x, y, z) along `yaw` comes down: up to
 * `DECOY_RANGE` away, short of the first wall, on ground the mech could
 * stand on. Null when there is nowhere (the edge of the island).
 */
export const decoySpot = (g: Grid, x: number, y: number, z: number, yaw: number): { x: number; y: number; z: number } | null => {
  const dx = Math.sin(yaw)
  const dz = Math.cos(yaw)
  const wall = raycast(g, x, y + 1.3, z, dx, 0, dz, DECOY_RANGE)
  for (let d = Math.max(0, wall.t - 0.8); d >= 1.5; d -= 0.5) {
    const px = x + dx * d
    const pz = z + dz * d
    const floor = heightAt(g, px, pz)
    // It is a throw, so it may come down a storey lower, not climb one.
    if (floor === VOID || floor > y + 0.6) continue
    return { x: px, y: floor, z: pz }
  }
  return null
}

/**
 * Let the decoys run: each calls out to the guards round it every so often,
 * and goes out when its time is up. Returns how many went out this step.
 */
export const stepDecoys = (decoys: Decoy[], gar: Garrison, g: Grid, dt: number): number => {
  let out = 0
  for (let i = decoys.length - 1; i >= 0; i--) {
    const d = decoys[i]!
    d.t += dt
    d.pulse -= dt
    if (d.t >= d.life) {
      decoys.splice(i, 1)
      out++
      continue
    }
    if (d.pulse <= 0) {
      d.pulse = DECOY_PULSE_S
      lureTo(gar, g, d.x, d.y, d.z, DECOY_LURE_RADIUS)
    }
  }
  return out
}
