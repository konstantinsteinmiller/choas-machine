import type { Grid } from '../world/grid'
import { VOID, heightAt } from '../world/grid'
import { angleDelta } from './player'
import { SPECS, fireTokens, goliathAim, headingTo, isAlive, killUnit, type Garrison, type Target, type Unit } from './garrison'

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
  // A sentry calls the alarm far and wide, and shoots badly (R22's roles).
  sentry: { burst: 2, gap: 0.3, pauseMin: 1.8, pauseMax: 2.8, damage: 7, near: 0.32, far: 0.05, range: 70 },
  commander: { burst: 2, gap: 0.18, pauseMin: 1.0, pauseMax: 1.6, damage: 8, near: 0.55, far: 0.08, range: 50 },
  enforcer: { burst: 12, gap: 0.085, pauseMin: 1.3, pauseMax: 2.0, damage: 4, near: 0.42, far: 0.06, range: 45 },
  // The hound's bite: only right up close.
  hound: { burst: 1, gap: 0.1, pauseMin: 0.9, pauseMax: 1.3, damage: 7, near: 0.8, far: 0.8, range: 2.2 },
  // A Roomba's SMG (#72): short bursts, light rounds; it sprays across a yard but rarely hits from far.
  roomba: { burst: 5, gap: 0.09, pauseMin: 1.1, pauseMax: 1.7, damage: 4, near: 0.5, far: 0.06, range: 45 }
}

/** A Roomba's shotgun (#72): murderous up close, nothing much past a few metres. */
const SHOTGUN: Gun = { burst: 1, gap: 0.1, pauseMin: 1.3, pauseMax: 1.8, damage: 24, near: 0.85, far: 0.02, range: 12 }
/** A marksman's long rifle (#90): one heavy round after the laser has drawn on the mech for MARKSMAN_AIM_S. */
const MARKSMAN: Gun = { burst: 1, gap: 0.1, pauseMin: 3.0, pauseMax: 3.6, damage: 45, near: 0.92, far: 0.55, range: 120 }
export const MARKSMAN_AIM_S = 1.8
/** A grenadier's grenade (#90): thrown at the last known position within reach, a ring on the ground, then the bang. */
export const GRENADE_RANGE = 25
export const GRENADE_FUSE_S = 2
export const GRENADE_RADIUS = 3.5
export const GRENADE_DAMAGE = 30
const GRENADE_EVERY_S = 7

/** What a defender fires. */
export const gunOf = (u: Unit): Gun | undefined => (u.shotgun ? SHOTGUN : u.role === 'marksman' ? MARKSMAN : GUNS[u.kind])

/**
 * Suppressing fire: for this long after a defender opens up on the mech,
 * its rounds mostly miss (loud, visible tracers, little damage): the moment
 * to move, before it settles its aim.
 */
export const SUPPRESS_S = 2
const SUPPRESS_HIT = 0.2
/**
 * Beyond its aimed range, out to this, a defender that has the mech in view
 * still puts rounds its way (#70): few hit, and none settle, but a sniper on
 * a far perch is no longer left in peace.
 */
export const VOLLEY_RANGE = 120
const VOLLEY_HIT = 0.35
const VOLLEY_PAUSE = 1.6

/** The Goliath's cannon. */
export const SHELL_WARN_S = 1.15
export const SHELL_RADIUS = 4.2
export const SHELL_DAMAGE = 46
export const SHELL_RELOAD_S = 3.1
/** A shell on its own position takes this share of its health; three shells and it overheats for this long. */
export const SELF_SHELL = 0.3
export const OVERHEAT_AFTER = 3
export const OVERHEAT_S = 5
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
    if (u.glintT > 0 || u.dashT > 0) { u.burst = 0; continue }
    if (u.role === 'grenadier') stepGrenade(u, gar, g, target, dt)
    const gun = gunOf(u)
    if (!gun) continue
    const dist = Math.hypot(target.x - u.x, target.z - u.z)
    const volley = dist > gun.range && u.kind !== 'hound'
    // The attention budget (#92): only those dealt a turn fire; the rest close
    // in. A turn going spare is taken at once by whoever is ready for it. A
    // marksman on its tower is outside the budget: it is the tower's danger.
    if (u.sees && !gar.shooters.has(u.id) && u.kind !== 'hound' && gar.shooters.size < fireTokens(gar)) gar.shooters.add(u.id)
    const turn = gar.shooters.has(u.id) || u.role === 'marksman'
    if (!u.sees || dist > (volley ? VOLLEY_RANGE : gun.range) || !turn) {
      // Lost the line: the burst is cut, and it takes a moment to re-acquire.
      u.burst = 0
      u.fireT = Math.max(u.fireT, 0.5)
      u.aimT = 0
      continue
    }
    u.aimT += dt
    // The marksman's laser draws on the mech before the round comes (#90).
    if (u.role === 'marksman' && u.aimT < MARKSMAN_AIM_S) continue
    if (u.burst > 0) {
      u.burstT -= dt
      if (u.burstT > 0) continue
      u.burst--
      u.burstT = gun.gap
      u.recoil = 1
      // Out past its range only a volley: the far end's chance, cut again.
      const p = volley ? gun.far * VOLLEY_HIT : hitChance(gun, dist, target) * (u.aimT < SUPPRESS_S ? SUPPRESS_HIT : 1)
      const hit = gar.rng() < p
      gar.events.push({ type: 'fire', id: u.id, damage: hit ? Math.max(1, Math.round(gun.damage * gar.threat.damage)) : 0 })
      if (u.burst === 0) u.fireT = (gun.pauseMin + gar.rng() * (gun.pauseMax - gun.pauseMin)) * (volley ? VOLLEY_PAUSE : 1)
      continue
    }
    u.fireT -= dt
    if (u.fireT <= 0) {
      u.burst = gun.burst
      u.burstT = 0
    }
  }
}

/**
 * A grenadier's throw (#90): every GRENADE_EVERY_S, with a last known position
 * within GRENADE_RANGE, a grenade arcs onto it: a red ring on the ground for
 * GRENADE_FUSE_S (the mech's moment to leave it), then the bang. It uses the
 * shell's fields and events (the Goliath's shell is the same idea).
 */
const stepGrenade = (u: Unit, gar: Garrison, g: Grid, target: Target, dt: number): void => {
  if (u.shellT > 0) {
    u.shellT -= dt
    if (u.shellT > 0) return
    const floor = heightAt(g, u.shellX, u.shellZ)
    const y = floor === VOID ? u.y : floor
    const d = Math.hypot(target.x - u.shellX, target.z - u.shellZ)
    const near = target.visible && d <= GRENADE_RADIUS && Math.abs(target.y - y) < 2.5
    const damage = near ? Math.max(1, Math.round(GRENADE_DAMAGE * (1 - d / GRENADE_RADIUS) * gar.threat.damage)) : 0
    gar.events.push({ type: 'shell', id: u.id, x: u.shellX, y, z: u.shellZ, damage })
    return
  }
  u.grenadeT -= dt
  if (u.grenadeT > 0 || gar.lkp.t < gar.time - 6) return
  if (Math.hypot(gar.lkp.x - u.x, gar.lkp.z - u.z) > GRENADE_RANGE) return
  u.grenadeT = GRENADE_EVERY_S
  u.shellT = GRENADE_FUSE_S
  u.shellX = gar.lkp.x
  u.shellZ = gar.lkp.z
  u.recoil = 1
  gar.events.push({ type: 'telegraph', id: u.id, x: u.shellX, z: u.shellZ, radius: GRENADE_RADIUS, dur: GRENADE_FUSE_S })
}

const stepCannon = (u: Unit, gar: Garrison, g: Grid, target: Target, dt: number): void => {
  if (u.overheat > 0) return
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
    // Lured into calling a shell onto a decoy at its own feet: it is under it.
    if (Math.hypot(u.x - u.shellX, u.z - u.shellZ) < SHELL_RADIUS + SPECS.goliath.radius) {
      const self = Math.round(u.maxHp * SELF_SHELL)
      u.hp -= self
      gar.events.push({ type: 'selfHit', id: u.id, damage: self })
      if (u.hp <= 0) killUnit(gar, u.id, u.shellX, u.shellZ, 'blast')
    }
    // Three shells and it must cool: the vents open.
    if (++u.shells >= OVERHEAT_AFTER && u.state !== 'dead') {
      u.shells = 0
      u.overheat = OVERHEAT_S
      gar.events.push({ type: 'overheat', id: u.id })
    }
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
