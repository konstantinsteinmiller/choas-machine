import { CELL, CellKind, STEP_UP, VOID, cellHeight, cellKind, inGrid, toCell, type Grid } from '../world/grid'
import { MANTLE_MAX, angleDelta, type Player } from './player'
import { MECH_RADIUS } from '../models/mech'

/**
 * ─── The grappling hook ──────────────────────────────────────────────────────
 *
 * Over a wall from its foot. Pure.
 *
 * Standing at a wall too high to pull itself onto, the mech can throw a hook
 * to the top and reel itself up. The catch is the sound: the hook BITES, and
 * whoever is near the top hears it. They stand and wonder for two seconds
 * before anybody walks over (`wonderAt` in `garrison.ts`), and in those two
 * seconds the player may recall the hook and drop back down: a noise nobody
 * can find the cause of is shrugged off.
 *
 *   fly    the hook goes up the wall                         FLY_S
 *   bite   it catches: this is the noise
 *   climb  the line goes taut (TAUT_S), then the mech is reeled up the face
 *   over   it swings its legs over the edge and stands
 *   drop   recalled: the mech lets go and lands where it started
 */

/** Highest wall the hook reaches, metres above the mech's feet. */
export const GRAPPLE_MAX = 9.5
/** How far ahead of the mech a wall may be. */
export const GRAPPLE_REACH = 3.2
/** How far the hook's bite carries. */
export const GRAPPLE_EARSHOT = 10
export const FLY_S = 0.28
export const TAUT_S = 0.4
export const OVER_S = 0.38
/** Reel speed, m/s, and the limits on how long a climb takes. */
const REEL = 5
const CLIMB_MIN = 0.8
const CLIMB_MAX = 1.7
const GRAVITY = 24

export interface Point3 { x: number; y: number; z: number }

export interface GrappleSpot {
  /** Where the mech stands to climb: at the wall's foot. */
  foot: Point3
  /** The top edge of the wall, where the hook catches. */
  edge: Point3
  /** Where the mech ends up standing, on top. */
  top: Point3
  /** The way the mech faces the wall. */
  yaw: number
  rise: number
}

/**
 * The wall the hook could take from here, looking along `yaw`: the first
 * thing in the way within reach, if it is too high to mantle and not too high
 * for the line. Null when the way is clear, the obstacle is low, or it is a
 * cliff with nothing to stand on at the top.
 */
export const findGrapple = (g: Grid, x: number, y: number, z: number, yaw: number, reach = GRAPPLE_REACH, max = GRAPPLE_MAX): GrappleSpot | null => {
  const dx = Math.sin(yaw)
  const dz = Math.cos(yaw)
  let pcx = toCell(x)
  let pcz = toCell(z)
  for (let d = 0.3; d <= reach; d += 0.15) {
    const cx = toCell(x + dx * d)
    const cz = toCell(z + dz * d)
    if (cx === pcx && cz === pcz) continue
    if (!inGrid(g, cx, cz)) return null
    const h = cellHeight(g, cx, cz)
    if (h === VOID) return null
    const rise = h - y
    if (rise <= STEP_UP) { pcx = cx; pcz = cz; continue }
    // Something low: that is the mantle's, not the hook's.
    if (rise <= MANTLE_MAX) return null
    if (rise > max) return null
    if (cellKind(g, cx, cz) === CellKind.Cover) return null
    // The face it came through: the neighbour it stepped from.
    let nx = pcx - cx
    let nz = pcz - cz
    if (nx !== 0 && nz !== 0) {
      // A diagonal step: take the face the travel is more square to.
      if (Math.abs(dx) > Math.abs(dz)) nz = 0
      else nx = 0
    }
    nx = Math.sign(nx)
    nz = Math.sign(nz)
    // The foot must be ground the mech can stand on, level with where it is.
    const fcx = cx + nx
    const fcz = cz + nz
    if (!inGrid(g, fcx, fcz)) return null
    const fh = cellHeight(g, fcx, fcz)
    if (fh === VOID || Math.abs(fh - y) > STEP_UP) return null
    // Along the wall: where the mech already is, kept inside the wall cell.
    const lo = MECH_RADIUS + 0.15
    const along = (v: number, c: number): number => Math.min((c + 1) * CELL - lo, Math.max(c * CELL + lo, v))
    const faceX = nx !== 0 ? (nx > 0 ? (cx + 1) * CELL : cx * CELL) : along(x, cx)
    const faceZ = nz !== 0 ? (nz > 0 ? (cz + 1) * CELL : cz * CELL) : along(z, cz)
    const off = MECH_RADIUS + 0.12
    return {
      foot: { x: faceX + nx * off, y: fh, z: faceZ + nz * off },
      edge: { x: faceX, y: h, z: faceZ },
      top: { x: faceX - nx * (MECH_RADIUS + 0.3), y: h, z: faceZ - nz * (MECH_RADIUS + 0.3) },
      yaw: Math.atan2(-nx, -nz),
      rise: h - fh
    }
  }
  return null
}

export type GrapplePhase = 'fly' | 'climb' | 'over' | 'drop' | 'done'

export interface GrappleRun {
  spot: GrappleSpot
  phase: GrapplePhase
  /** Seconds in the current phase. */
  t: number
  /** Where the mech was when it threw. */
  from: Point3
  /** The noise it made, for taking it back (`voidNoise`). */
  noise: number
  /** How many heard the bite. */
  heard: number
  climbS: number
  /** 0 … 1 the hook's way up the wall; 1 once it has caught. */
  hook: number
  /** Recalled: falling back. */
  vy: number
  cancelled: boolean
}

export const startGrapple = (p: Player, spot: GrappleSpot): GrappleRun => ({
  spot, phase: 'fly', t: 0, from: { x: p.x, y: p.y, z: p.z }, noise: 0, heard: 0,
  climbS: Math.min(CLIMB_MAX, Math.max(CLIMB_MIN, spot.rise / REEL)), hook: 0, vy: 0, cancelled: false
})

export type GrappleEvent =
  /** The hook caught at the top: the noise is made here. */
  | { type: 'bite' }
  /** The mech is standing on top. */
  | { type: 'top' }
  /** Recalled, and back on the ground: `drop` metres fallen. */
  | { type: 'landed'; drop: number }

const smooth = (v: number): number => { const k = v < 0 ? 0 : v > 1 ? 1 : v; return k * k * (3 - 2 * k) }

/** The player may still take the hook back: not once it is going over the edge. */
export const canCancel = (r: GrappleRun): boolean => r.phase === 'fly' || r.phase === 'climb'

/** Recall the hook. The mech lets go and falls back to the foot of the wall. */
export const cancelGrapple = (r: GrappleRun): boolean => {
  if (!canCancel(r)) return false
  r.phase = 'drop'
  r.t = 0
  r.vy = 0
  r.cancelled = true
  return true
}

/** Advance the hook by `dt`, moving the mech with it. */
export const stepGrapple = (r: GrappleRun, p: Player, dt: number): GrappleEvent[] => {
  const events: GrappleEvent[] = []
  const s = r.spot
  p.px = p.x
  p.py = p.y
  p.pz = p.z
  p.pyaw = p.yaw
  p.vx = p.vz = 0
  p.speed01 = 0
  p.crouched = false
  r.t += dt
  if (r.phase !== 'drop') p.yaw += angleDelta(p.yaw, s.yaw) * Math.min(1, dt * 14)

  if (r.phase === 'fly') {
    const k = Math.min(1, r.t / FLY_S)
    // Step up to the wall while the hook is in the air.
    p.x = r.from.x + (s.foot.x - r.from.x) * smooth(k)
    p.z = r.from.z + (s.foot.z - r.from.z) * smooth(k)
    p.y = s.foot.y
    p.mode = 'ground'
    r.hook = k
    if (k >= 1) {
      r.phase = 'climb'
      r.t = 0
      r.hook = 1
      events.push({ type: 'bite' })
    }
    return events
  }
  if (r.phase === 'climb') {
    const k = Math.max(0, (r.t - TAUT_S) / r.climbS)
    p.x = s.foot.x
    p.z = s.foot.z
    // Up the face: quick off the ground, slowing into the edge.
    p.y = s.foot.y + (s.rise - 1.1) * (1 - (1 - Math.min(1, k)) ** 2)
    p.mode = 'ladder'
    p.climbPhase += dt * (r.t > TAUT_S ? 9 : 0)
    if (k >= 1) { r.phase = 'over'; r.t = 0 }
    return events
  }
  if (r.phase === 'over') {
    const k = Math.min(1, r.t / OVER_S)
    const e = smooth(k)
    p.x = s.foot.x + (s.top.x - s.foot.x) * e
    p.z = s.foot.z + (s.top.z - s.foot.z) * e
    p.y = s.foot.y + (s.rise - 1.1) + 1.1 * Math.min(1, k * 1.6) + Math.sin(k * Math.PI) * 0.25
    p.mode = 'mantle'
    if (k >= 1) {
      p.x = s.top.x
      p.z = s.top.z
      p.y = s.top.y
      p.vy = 0
      p.airFrom = p.y
      p.mode = 'ground'
      r.phase = 'done'
      events.push({ type: 'top' })
    }
    return events
  }
  if (r.phase === 'drop') {
    // Let go: straight down the wall it was on.
    const from = p.y
    r.vy -= GRAVITY * dt
    p.y = Math.max(s.foot.y, p.y + r.vy * dt)
    p.x += (s.foot.x - p.x) * Math.min(1, dt * 10)
    p.z += (s.foot.z - p.z) * Math.min(1, dt * 10)
    p.mode = p.y > s.foot.y ? 'air' : 'ground'
    r.hook = Math.max(0, r.hook - dt * 5)
    if (p.y <= s.foot.y) {
      p.y = s.foot.y
      p.vy = 0
      p.airFrom = p.y
      r.phase = 'done'
      events.push({ type: 'landed', drop: Math.max(0, from - s.foot.y) + Math.abs(r.vy) * 0.05 })
    }
  }
  return events
}

/** Where the hook is: on its way up the face while it flies, at the edge after. */
export const hookAt = (r: GrappleRun, out: Point3): Point3 => {
  const s = r.spot
  const k = r.hook
  out.x = s.foot.x + (s.edge.x - s.foot.x) * k
  out.y = s.foot.y + 1.9 + (s.edge.y - s.foot.y - 1.9) * k
  out.z = s.foot.z + (s.edge.z - s.foot.z) * k
  return out
}
