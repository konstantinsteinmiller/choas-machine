import type { Grid } from '../world/grid'
import { VOID, heightAt } from '../world/grid'
import { angleDelta } from './player'
import { SPECS, goliathAim, headingTo, isAlive, type Garrison, type Target, type Unit } from './garrison'

/**
 * ─── The base shoots back ────────────────────────────────────────────────────
 *
 * Who fires at the mech, when, and whether it hits. Run after the garrison's
 * own step, on the same fixed step. Pure: every roll comes from the
 * garrison's seeded generator.
 *
 *  - Guards fire short bursts, and are poor shots at range.
 *  - Enforcers hose the mech's position: long bursts, light rounds.
 *  - The Goliath calls a shell onto a POINT, marked on the ground for a
 *    moment before it lands, so it is dodged by moving. It shoots at a decoy
 *    in preference to the mech, which is how its rear is reached.
 *
 * The mech's armor, and what a round does to it, is in `armor.ts`.
 */

interface Gun {
  /** Rounds per burst and seconds between them. */
  burst: number
  gap: number
  /** Seconds between bursts, least and most. */
  pauseMin: number
  pauseMax: number
  damage: number
  /** Chance to hit at point blank and at the edge of its range. */
  near: number
  far: number
  range: number
}

// Ranges reach across the base (#59): anyone who has spotted the mech can
// put rounds near it from far off, just not many on it.
export const GUNS: Readonly<Partial<Record<Unit['kind'], Gun>>> = {
  guard: { burst: 3, gap: 0.13, pauseMin: 1.2, pauseMax: 1.9, damage: 6, near: 0.5, far: 0.06, range: 55 },
  sentry: { burst: 2, gap: 0.3, pauseMin: 1.6, pauseMax: 2.4, damage: 9, near: 0.6, far: 0.12, range: 70 },
  commander: { burst: 2, gap: 0.18, pauseMin: 1.0, pauseMax: 1.6, damage: 8, near: 0.55, far: 0.08, range: 50 },
  enforcer: { burst: 12, gap: 0.085, pauseMin: 1.3, pauseMax: 2.0, damage: 4, near: 0.42, far: 0.06, range: 45 }
}

/**
 * Suppressing fire: for this long after a defender opens up on the mech,
 * its rounds mostly miss (loud, visible tracers, little damage): the moment
 * to move, before it settles its aim.
 */
export const SUPPRESS_S = 2
const SUPPRESS_HIT = 0.2

/** The Goliath's cannon. */
export const SHELL_WARN_S = 1.15
export const SHELL_RADIUS = 4.2
export const SHELL_DAMAGE = 46
export const SHELL_RELOAD_S = 3.1
/** The turret must be this near to on-aim before it fires (radians). */
const SHELL_ALIGN = 0.16

/** A moving mech is this much harder to hit at a full run; a crouched one, this. */
const MOVING_FACTOR = 0.5
const CROUCH_FACTOR = 0.7

/** Chance that one round of `gun` fired from `dist` away hits. */
export const hitChance = (gun: Gun, dist: number, target: Target): number => {
  const k = Math.min(1, dist / gun.range)
  let p = gun.near + (gun.far - gun.near) * k
  p *= 1 - (1 - MOVING_FACTOR) * Math.min(1, target.moving ?? 0)
  if (target.crouched) p *= CROUCH_FACTOR
  return p
}

/**
 * The garrison's guns for one step. Queues `fire`, `telegraph` and `shell`
 * events on `gar.events`.
 */
export const stepFire = (gar: Garrison, g: Grid, target: Target, dt: number): void => {
  for (const u of gar.units) {
    u.recoil = Math.max(0, u.recoil - dt * 6)
    if (!isAlive(u) || u.state !== 'combat' || u.power < 1) continue
    if (u.kind === 'goliath') { stepCannon(u, gar, g, target, dt); continue }
    const gun = GUNS[u.kind]
    if (!gun) continue
    const dist = Math.hypot(target.x - u.x, target.z - u.z)
    if (!u.sees || dist > gun.range) {
      // Lost the line: the burst is cut, and it takes a moment to re-acquire.
      u.burst = 0
      u.fireT = Math.max(u.fireT, 0.5)
      u.aimT = 0
      continue
    }
    u.aimT += dt
    if (u.burst > 0) {
      u.burstT -= dt
      if (u.burstT > 0) continue
      u.burst--
      u.burstT = gun.gap
      u.recoil = 1
      const hit = gar.rng() < hitChance(gun, dist, target) * (u.aimT < SUPPRESS_S ? SUPPRESS_HIT : 1)
      gar.events.push({ type: 'fire', id: u.id, damage: hit ? Math.max(1, Math.round(gun.damage * gar.threat.damage)) : 0 })
      if (u.burst === 0) u.fireT = gun.pauseMin + gar.rng() * (gun.pauseMax - gun.pauseMin)
      continue
    }
    u.fireT -= dt
    if (u.fireT <= 0) {
      u.burst = gun.burst
      u.burstT = 0
    }
  }
}

const stepCannon = (u: Unit, gar: Garrison, g: Grid, target: Target, dt: number): void => {
  if (u.shellT > 0) {
    u.shellT -= dt
    if (u.shellT > 0) return
    // It lands where it was called, wherever the mech is by now.
    const floor = heightAt(g, u.shellX, u.shellZ)
    const y = floor === VOID ? 0 : floor
    const d = Math.hypot(target.x - u.shellX, target.z - u.shellZ)
    const level = Math.abs(target.y - y) < 3
    const damage = target.visible && level && d < SHELL_RADIUS ? Math.round(SHELL_DAMAGE * gar.threat.damage * (1 - 0.6 * (d / SHELL_RADIUS))) : 0
    u.recoil = 1
    gar.events.push({ type: 'shell', id: u.id, x: u.shellX, y, z: u.shellZ, damage })
    u.fireT = SHELL_RELOAD_S
    return
  }
  u.fireT -= dt
  if (u.fireT > 0) return
  const aim = goliathAim(u, gar, g, target)
  if (!aim) return
  if (Math.hypot(aim.x - u.x, aim.z - u.z) > SPECS.goliath.range) return
  const off = Math.abs(angleDelta(u.yaw + u.look, headingTo(u.x, u.z, aim.x, aim.z)))
  if (off > SHELL_ALIGN) return
  u.shellX = aim.x
  u.shellZ = aim.z
  u.shellT = SHELL_WARN_S
  gar.events.push({ type: 'telegraph', id: u.id, x: aim.x, z: aim.z, radius: SHELL_RADIUS, dur: SHELL_WARN_S })
}
