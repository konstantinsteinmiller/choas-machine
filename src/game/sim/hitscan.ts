import { raycast, type Grid } from '../world/grid'
import { shieldUp, type Unit } from './garrison'

/**
 * ─── What a shot hits ────────────────────────────────────────────────────────
 *
 * A ray against the height grid and against every defender, each of which is
 * a few simple shapes with a ZONE: a guard has a head and a body, an Enforcer
 * armour and four glowing joints, the Goliath a hull and its rear vents. The
 * weapons decide what a zone is worth (`damage.ts`).
 *
 * Pure: plain numbers in, one reused record out.
 */

export type Zone = 'head' | 'body' | 'limb' | 'joint' | 'weak' | 'armor'

export interface ShotHit {
  kind: 'none' | 'world' | 'unit'
  /** Distance along the ray. */
  t: number
  x: number
  y: number
  z: number
  /** Surface normal for a world hit; the reverse of the ray for a unit. */
  nx: number
  ny: number
  nz: number
  /** Index of the unit hit, or −1. */
  unit: number
  zone: Zone
}

export const makeShotHit = (): ShotHit => ({ kind: 'none', t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, unit: -1, zone: 'body' })

/** A guard's head, generous on purpose: a headshot should feel earned, not
 *  pixel-hunted on a phone. */
export const HEAD_Y = 1.54
export const HEAD_R = 0.3
/** Below this (the hips) a round is in the legs. */
export const LIMB_TOP = 0.75
const BODY_R = 0.3
const DRONE_R = 0.5
/** The drone's eye: where it is in the drone's own frame, and how big. It is
 *  the drone's one weak point (`sim/damage.ts`). */
export const DRONE_EYE = { z: 0.3, y: -0.06, r: 0.19 } as const
/** The Warden's riot shield, in his own frame: how far in front, its middle's height, half its width and height. */
export const RIOT_SHIELD = { z: 0.42, y: 0.95, hw: 0.36, hh: 0.62 } as const
/** A guard's riot shield (#90): carried lower than the Warden's, so the head shows over it. */
export const GUARD_SHIELD = { z: 0.42, y: 0.78, hw: 0.34, hh: 0.48 } as const
/** ...and raised over his head (#151): the whole of him behind it but his legs. */
export const GUARD_SHIELD_UP = { z: 0.42, y: 1.32, hw: 0.34, hh: 0.48 } as const
/** A Roomba's shell and its dome (#72). */
const ROOMBA_R = 0.58
const ROOMBA_TOP = 0.43
const ROOMBA_DOME = { y: 0.45, r: 0.25, z: 0.12 } as const

/** A ray down through a disc's top face (a Roomba's shell, from above), or Infinity. */
const rayCap = (oy: number, ox: number, oz: number, dx: number, dy: number, dz: number, cx: number, cz: number, r: number, y: number): number => {
  if (dy >= -1e-6 || oy <= y) return Infinity
  const t = (y - oy) / dy
  return Math.hypot(ox + dx * t - cx, oz + dz * t - cz) <= r ? t : Infinity
}

/** Distance to a sphere along a unit ray, or Infinity. Hits from inside do
 *  not count: a muzzle that pokes into a body must not hit it at t = 0. */
export const raySphere = (
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number
): number => {
  const mx = ox - cx
  const my = oy - cy
  const mz = oz - cz
  const b = mx * dx + my * dy + mz * dz
  const c = mx * mx + my * my + mz * mz - r * r
  if (c <= 0) return Infinity
  const disc = b * b - c
  if (disc < 0) return Infinity
  const t = -b - Math.sqrt(disc)
  return t > 0 ? t : Infinity
}

/** Distance to an upright cylinder (no caps) between two heights, or Infinity. */
export const rayCylinder = (
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  cx: number, cz: number, r: number, y0: number, y1: number
): number => {
  const mx = ox - cx
  const mz = oz - cz
  const a = dx * dx + dz * dz
  if (a < 1e-9) return Infinity
  const b = mx * dx + mz * dz
  const c = mx * mx + mz * mz - r * r
  if (c <= 0) return Infinity
  const disc = b * b - a * c
  if (disc < 0) return Infinity
  const t = (-b - Math.sqrt(disc)) / a
  if (t <= 0) return Infinity
  const y = oy + dy * t
  return y >= y0 && y <= y1 ? t : Infinity
}

/** Distance to a box turned by `yaw` about the vertical, or Infinity. */
export const rayBox = (
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  cx: number, cy: number, cz: number, yaw: number, hx: number, hy: number, hz: number
): number => {
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  // Into the box's own frame (the inverse of a turn by `yaw`).
  const wx = ox - cx
  const wz = oz - cz
  const lo = [wx * cos - wz * sin, oy - cy, wx * sin + wz * cos]
  const ld = [dx * cos - dz * sin, dy, dx * sin + dz * cos]
  const h = [hx, hy, hz]
  let t0 = 0
  let t1 = Infinity
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ld[i]!) < 1e-9) {
      if (Math.abs(lo[i]!) > h[i]!) return Infinity
      continue
    }
    let a = (-h[i]! - lo[i]!) / ld[i]!
    let b = (h[i]! - lo[i]!) / ld[i]!
    if (a > b) { const s = a; a = b; b = s }
    t0 = Math.max(t0, a)
    t1 = Math.min(t1, b)
    if (t0 > t1) return Infinity
  }
  return t0 > 0 ? t0 : Infinity
}

/** A point given in a unit's own frame (x to ITS right is −x here: it faces
 *  +z), turned into the world. */
const local = (u: Unit, lx: number, lz: number): { x: number; z: number } => {
  const cos = Math.cos(u.yaw)
  const sin = Math.sin(u.yaw)
  return { x: u.x + lx * cos + lz * sin, z: u.z - lx * sin + lz * cos }
}

/** Where an Enforcer's four joints are, in its own frame: [x, y, z, radius]. */
export const ENFORCER_JOINT_SPOTS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.48, 0.75, 0.1, 0.42], [-0.48, 0.75, 0.1, 0.42], [1.0, 2.5, 0, 0.42], [-1.0, 2.5, 0, 0.42]
]
/** The Goliath's rear vents, in its own frame. */
export const GOLIATH_VENT_SPOT = [0, 1.35, -3.0, 0.95] as const

let bestT = 0
let bestZone: Zone = 'body'
const take = (t: number, zone: Zone): void => {
  if (t < bestT) { bestT = t; bestZone = zone }
}

/** The nearest hit on one unit within `maxT`. Returns the distance (and
 *  leaves the zone in `bestZone`), or Infinity. */
const hitUnit = (u: Unit, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number => {
  bestT = maxT
  if (u.kind === 'drone') {
    // The eye sits inside the shell's hit sphere: a round that finds it is an
    // eye hit, whatever it crossed first. Only from in front, though: a
    // round through its back does not get to the eye.
    const body = raySphere(ox, oy, oz, dx, dy, dz, u.x, u.y, u.z, DRONE_R)
    const e = local(u, 0, DRONE_EYE.z)
    const facing = dx * Math.sin(u.yaw) + dz * Math.cos(u.yaw) < 0.25
    const eye = facing ? raySphere(ox, oy, oz, dx, dy, dz, e.x, u.y + DRONE_EYE.y, e.z, DRONE_EYE.r) : Infinity
    if (eye < Infinity) take(Math.min(eye, body), 'weak')
    else take(body, 'body')
  } else if (u.kind === 'hound') {
    take(rayBox(ox, oy, oz, dx, dy, dz, u.x, u.y + 0.62, u.z, u.yaw, 0.32, 0.3, 0.72), 'body')
    const h = local(u, 0, 0.7)
    take(raySphere(ox, oy, oz, dx, dy, dz, h.x, u.y + 0.95, h.z, 0.26), 'head')
  } else if (u.kind === 'roomba') {
    take(rayCylinder(ox, oy, oz, dx, dy, dz, u.x, u.z, ROOMBA_R, u.y + 0.08, u.y + ROOMBA_TOP), 'body')
    take(rayCap(oy, ox, oz, dx, dy, dz, u.x, u.z, ROOMBA_R, u.y + ROOMBA_TOP), 'body')
    const d = local(u, 0, ROOMBA_DOME.z)
    take(raySphere(ox, oy, oz, dx, dy, dz, d.x, u.y + ROOMBA_DOME.y, d.z, ROOMBA_DOME.r), 'weak')
  } else if (u.kind === 'searchlight') {
    take(raySphere(ox, oy, oz, dx, dy, dz, u.x, u.y, u.z, DRONE_R), 'body')
  } else if (u.kind === 'enforcer') {
    take(rayCylinder(ox, oy, oz, dx, dy, dz, u.x, u.z, 0.8, u.y + 1.15, u.y + 2.45), 'armor')
    const head = local(u, 0, 0.25)
    take(raySphere(ox, oy, oz, dx, dy, dz, head.x, u.y + 2.75, head.z, 0.42), 'head')
    for (const [lx, ly, lz, r] of ENFORCER_JOINT_SPOTS) {
      const p = local(u, lx, lz)
      take(raySphere(ox, oy, oz, dx, dy, dz, p.x, u.y + ly, p.z, r), 'joint')
    }
  } else if (u.kind === 'goliath') {
    take(rayBox(ox, oy, oz, dx, dy, dz, u.x, u.y + 1.25, u.z, u.yaw, 2.4, 1.25, 3.1), 'armor')
    take(raySphere(ox, oy, oz, dx, dy, dz, u.x, u.y + 2.4, u.z, 1.5), 'armor')
    const v = local(u, GOLIATH_VENT_SPOT[0], GOLIATH_VENT_SPOT[2])
    take(raySphere(ox, oy, oz, dx, dy, dz, v.x, u.y + GOLIATH_VENT_SPOT[1], v.z, GOLIATH_VENT_SPOT[3]), 'weak')
  } else {
    // The Warden's riot shield: a plate held in front of him. A round that
    // meets it first stops there.
    if (u.shield) {
      const sh = u.boss ? RIOT_SHIELD : shieldUp(u) ? GUARD_SHIELD_UP : GUARD_SHIELD
      const s = local(u, -0.08, sh.z)
      take(rayBox(ox, oy, oz, dx, dy, dz, s.x, u.y + sh.y, s.z, u.yaw, sh.hw, sh.hh, 0.05), 'armor')
    }
    // The legs below the hips are limbs; the torso above is the body.
    take(rayCylinder(ox, oy, oz, dx, dy, dz, u.x, u.z, BODY_R, u.y + 0.1, u.y + LIMB_TOP), 'limb')
    take(rayCylinder(ox, oy, oz, dx, dy, dz, u.x, u.z, BODY_R, u.y + LIMB_TOP, u.y + 1.3), 'body')
    take(raySphere(ox, oy, oz, dx, dy, dz, u.x, u.y + HEAD_Y, u.z, HEAD_R), 'head')
  }
  return bestT < maxT ? bestT : Infinity
}

/**
 * Cast one shot. The direction must be a unit vector. `out` is filled and
 * returned.
 */
export const castShot = (
  g: Grid, units: readonly Unit[], ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  maxDist: number, out: ShotHit, skip = -1
): ShotHit => {
  const w = raycast(g, ox, oy, oz, dx, dy, dz, maxDist)
  let t = w.hit ? w.t : maxDist
  out.kind = w.hit ? 'world' : 'none'
  out.unit = -1
  out.zone = 'body'
  out.nx = w.nx
  out.ny = w.ny
  out.nz = w.nz
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!
    if (i === skip || u.state === 'dead' || u.state === 'reserve') continue
    // Skip anything whose whole body is further than the best hit so far.
    const reach = u.kind === 'goliath' ? 4.2 : u.kind === 'enforcer' ? 1.6 : 0.6
    const ux = u.x - ox
    const uz = u.z - oz
    const along = ux * dx + uz * dz
    if (along < -reach || along > t + reach) continue
    const hit = hitUnit(u, ox, oy, oz, dx, dy, dz, t)
    if (hit < t) {
      t = hit
      out.kind = 'unit'
      out.unit = i
      out.zone = bestZone
      out.nx = -dx
      out.ny = -dy
      out.nz = -dz
    }
  }
  out.t = t
  out.x = ox + dx * t
  out.y = oy + dy * t
  out.z = oz + dz * t
  return out
}
