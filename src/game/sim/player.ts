import {
  CELL, STEP_DOWN, STEP_UP, VOID, cellHeight, cellMid, heightAt, moveCircle, toCell,
  type Cable, type Grid, type Ladder, type MoveRule
} from '../world/grid'
import { MECH_EYE, MECH_EYE_CROUCH, MECH_RADIUS } from '../models/mech'

/**
 * ─── The mech's body ─────────────────────────────────────────────────────────
 *
 * Where the mech is and how it gets about the fortress: it walks, crouches,
 * climbs ladders, walks cables, mantles onto low blocks and drops off ledges.
 * There is no jump button: every way up or down engages by walking into it
 * (GDD 2.1, "simple touch controls").
 *
 * Pure: a `Player` record, the grid, a wish (which way, how hard), a time
 * step. No three.js, no input module, so every rule here is unit-tested.
 * Headings are radians, 0 looking along +z, growing toward +x.
 */

export const RUN_SPEED = 5.6
/** Flat out: fast, upright and loud (`SPRINT_EARSHOT` in the mission). */
export const SPRINT_SPEED = 8.1
export const CROUCH_SPEED = 2.7
export const AIM_SPEED = 2.2
export const LADDER_SPEED = 3.2
export const CABLE_SPEED = 3.4
const ACCEL = 14
const TURN_RATE = 11
const GRAVITY = 24
/** Highest block the mech pulls itself onto, and how long it pushes first. */
export const MANTLE_MAX = 2.0
const MANTLE_PUSH_S = 0.28
const MANTLE_S = 0.42
/** Standing on a ledge crouched, the mech will not step off a drop deeper
 *  than this: sneaking along a wall top never ends in a fall. */
const CROUCH_LEDGE = 1.2

export type PlayerMode = 'ground' | 'ladder' | 'cable' | 'air' | 'mantle'

export interface Player {
  x: number
  y: number
  z: number
  /** Last step's position, for the render to interpolate from. */
  px: number
  py: number
  pz: number
  /** Body heading and last step's. */
  yaw: number
  pyaw: number
  vx: number
  vz: number
  vy: number
  mode: PlayerMode
  crouched: boolean
  /** 0 standing … 1 crouched, eased. */
  crouch: number
  /** Walk cycle angle; advances with distance. */
  stride: number
  /** 0 still … 1 at a run. */
  speed01: number
  ladder: Ladder | null
  cable: Cable | null
  /** Along the cable, 0 at its A end … 1 at B. */
  cableT: number
  /** Height the current fall started from. */
  airFrom: number
  /** Seconds spent pushing against something that can be mantled. */
  push: number
  mantle: { fx: number; fy: number; fz: number; tx: number; ty: number; tz: number; t: number } | null
  /** Climb cycle angle on a ladder. */
  climbPhase: number
  /** The chassis' speed upgrade: a multiplier on every ground speed. */
  speedMul: number
  /** Flat out this step, and the same eased 0 … 1 for the body's pose. */
  sprinting: boolean
  sprint: number
}

export const makePlayer = (x: number, y: number, z: number, yaw = 0): Player => ({
  x, y, z, px: x, py: y, pz: z, yaw, pyaw: yaw, vx: 0, vz: 0, vy: 0,
  mode: 'ground', crouched: false, crouch: 0, stride: 0, speed01: 0,
  ladder: null, cable: null, cableT: 0, airFrom: y, push: 0, mantle: null, climbPhase: 0, speedMul: 1,
  sprinting: false, sprint: 0
})

/** What the hands ask of the body this step. */
export interface Wish {
  /** Desired travel direction in WORLD space, |v| ≤ 1 (the stick, turned by
   *  the camera). */
  mx: number
  mz: number
  /** Toggle crouch this step. */
  crouch: boolean
  /** Sprint while this is held: not crouched, not aiming. Optional so a
   *  caller that never sprints can leave it out. */
  sprint?: boolean
  /** The weapon is up: the mech walks slowly and faces `aimYaw`. */
  aiming: boolean
  aimYaw: number
}

export type PlayerEvent =
  | { type: 'land'; drop: number }
  | { type: 'ladder' }
  | { type: 'cable' }
  | { type: 'mantle' }

/** The mech drops off any ledge; it climbs only by the ways built for it. */
const FREE: MoveRule = { up: STEP_UP, down: 1000 }
const CAREFUL: MoveRule = { up: STEP_UP, down: CROUCH_LEDGE }

const approach = (v: number, target: number, maxDelta: number): number =>
  v < target ? Math.min(target, v + maxDelta) : Math.max(target, v - maxDelta)

/** Shortest signed turn from a to b. */
export const angleDelta = (a: number, b: number): number => {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export const eyeHeight = (p: Player): number => MECH_EYE + (MECH_EYE_CROUCH - MECH_EYE) * p.crouch

/** World position of a ladder's line: on the face of the block it climbs. */
const ladderPoint = (l: Ladder): { x: number; z: number } => ({
  x: cellMid(l.cx) + l.dx * (CELL / 2 - MECH_RADIUS - 0.05),
  z: cellMid(l.cz) + l.dz * (CELL / 2 - MECH_RADIUS - 0.05)
})

const cableEnds = (g: Grid, c: Cable): { ax: number; ay: number; az: number; bx: number; by: number; bz: number; len: number } => {
  const ax = cellMid(c.ax)
  const az = cellMid(c.az)
  const bx = cellMid(c.bx)
  const bz = cellMid(c.bz)
  return { ax, ay: cellHeight(g, c.ax, c.az), az, bx, by: cellHeight(g, c.bx, c.bz), bz, len: Math.hypot(bx - ax, bz - az) }
}

/** A ladder the mech would take by walking this way from here, if any. */
const ladderHere = (g: Grid, p: Player, mx: number, mz: number): { l: Ladder; top: boolean } | null => {
  const cx = toCell(p.x)
  const cz = toCell(p.z)
  for (const l of g.ladders) {
    // At the foot, walking into the block.
    if (l.cx === cx && l.cz === cz && mx * l.dx + mz * l.dz > 0.5) {
      const lp = ladderPoint(l)
      if (Math.hypot(p.x - lp.x, p.z - lp.z) < 0.75 && Math.abs(p.y - cellHeight(g, cx, cz)) < 0.3) return { l, top: false }
    }
    // On top, walking out over the edge the ladder hangs from.
    if (l.cx + l.dx === cx && l.cz + l.dz === cz && mx * l.dx + mz * l.dz < -0.5) {
      const ex = cellMid(l.cx) + l.dx * (CELL / 2)
      const ez = cellMid(l.cz) + l.dz * (CELL / 2)
      const along = (p.x - ex) * l.dx + (p.z - ez) * l.dz
      const across = Math.abs((p.x - ex) * l.dz + (p.z - ez) * l.dx)
      if (along < 0.75 && across < 0.7) return { l, top: true }
    }
  }
  return null
}

/** A cable the mech would step onto by walking this way from here, if any. */
const cableHere = (g: Grid, p: Player, mx: number, mz: number): { c: Cable; t: number } | null => {
  const cx = toCell(p.x)
  const cz = toCell(p.z)
  for (const c of g.cables) {
    const e = cableEnds(g, c)
    const ux = (e.bx - e.ax) / e.len
    const uz = (e.bz - e.az) / e.len
    const toward = mx * ux + mz * uz
    if (c.ax === cx && c.az === cz && toward > 0.6 && Math.abs(p.y - e.ay) < 0.3) return { c, t: 0 }
    if (c.bx === cx && c.bz === cz && toward < -0.6 && Math.abs(p.y - e.by) < 0.3) return { c, t: 1 }
  }
  return null
}

/**
 * Advance the mech by one step. Returns what happened, for sound, haptics,
 * the lessons and the drop assassination.
 */
export const stepPlayer = (p: Player, g: Grid, w: Wish, dt: number): PlayerEvent[] => {
  const events: PlayerEvent[] = []
  p.px = p.x
  p.py = p.y
  p.pz = p.z
  p.pyaw = p.yaw

  if (w.crouch && (p.mode === 'ground')) p.crouched = !p.crouched
  // Sprinting out of a crouch stands the mech up: one intent, one key.
  const wantSprint = !!w.sprint && !w.aiming && p.mode === 'ground' && Math.hypot(w.mx, w.mz) > 0.5
  if (wantSprint && p.crouched) p.crouched = false
  p.sprinting = wantSprint
  p.sprint = approach(p.sprint, wantSprint ? 1 : 0, dt * 5)
  p.crouch = approach(p.crouch, p.crouched && p.mode === 'ground' ? 1 : 0, dt * 7)

  const mag = Math.min(1, Math.hypot(w.mx, w.mz))
  const dirX = mag > 1e-4 ? w.mx / Math.hypot(w.mx, w.mz) : 0
  const dirZ = mag > 1e-4 ? w.mz / Math.hypot(w.mx, w.mz) : 0

  if (p.mode === 'ladder' && p.ladder) {
    const l = p.ladder
    const foot = cellHeight(g, l.cx, l.cz)
    const top = cellHeight(g, l.cx + l.dx, l.cz + l.dz)
    // Pushing toward the wall climbs; pulling away climbs down.
    const v = (w.mx * l.dx + w.mz * l.dz) * LADDER_SPEED
    p.y += v * dt
    p.climbPhase += Math.abs(v) * dt * 3.2
    p.speed01 = 0
    p.yaw += angleDelta(p.yaw, Math.atan2(l.dx, l.dz)) * Math.min(1, dt * TURN_RATE)
    if (p.y >= top) {
      // Over the lip and onto the block.
      p.y = top
      p.x = cellMid(l.cx) + l.dx * (CELL / 2 + MECH_RADIUS + 0.1)
      p.z = cellMid(l.cz) + l.dz * (CELL / 2 + MECH_RADIUS + 0.1)
      p.mode = 'ground'
      p.ladder = null
    } else if (p.y <= foot) {
      p.y = foot
      p.mode = 'ground'
      p.ladder = null
    }
    return events
  }

  if (p.mode === 'cable' && p.cable) {
    const e = cableEnds(g, p.cable)
    const ux = (e.bx - e.ax) / e.len
    const uz = (e.bz - e.az) / e.len
    const v = (w.mx * ux + w.mz * uz) * CABLE_SPEED
    p.cableT += (v * dt) / e.len
    p.stride += Math.abs(v) * dt * 2.2
    p.speed01 = Math.min(1, Math.abs(v) / CABLE_SPEED)
    if (Math.abs(v) > 0.05) p.yaw += angleDelta(p.yaw, Math.atan2(ux * Math.sign(v), uz * Math.sign(v))) * Math.min(1, dt * TURN_RATE)
    const t = Math.min(1, Math.max(0, p.cableT))
    p.x = e.ax + (e.bx - e.ax) * t
    p.z = e.az + (e.bz - e.az) * t
    p.y = e.ay + (e.by - e.ay) * t
    if (p.cableT >= 1 || p.cableT <= 0) {
      p.mode = 'ground'
      p.cable = null
    }
    return events
  }

  if (p.mode === 'mantle' && p.mantle) {
    const m = p.mantle
    m.t = Math.min(1, m.t + dt / MANTLE_S)
    // Up first, then over: the body clears the edge before it moves across.
    const up = Math.min(1, m.t / 0.6)
    const over = Math.max(0, (m.t - 0.4) / 0.6)
    p.y = m.fy + (m.ty - m.fy) * up
    p.x = m.fx + (m.tx - m.fx) * over
    p.z = m.fz + (m.tz - m.fz) * over
    p.climbPhase += dt * 9
    if (m.t >= 1) {
      p.mode = 'ground'
      p.mantle = null
    }
    return events
  }

  // ── Walking, or falling ──
  const top = (p.crouched ? CROUCH_SPEED : w.aiming ? AIM_SPEED : p.sprinting ? SPRINT_SPEED : RUN_SPEED) * p.speedMul
  const control = p.mode === 'air' ? 0.25 : 1
  const k = Math.min(1, ACCEL * control * dt)
  p.vx += (dirX * mag * top - p.vx) * k
  p.vz += (dirZ * mag * top - p.vz) * k

  if (p.mode === 'ground' && mag > 0.3) {
    const ladder = ladderHere(g, p, dirX, dirZ)
    if (ladder) {
      const lp = ladderPoint(ladder.l)
      p.mode = 'ladder'
      p.ladder = ladder.l
      p.x = lp.x
      p.z = lp.z
      if (ladder.top) p.y = cellHeight(g, ladder.l.cx + ladder.l.dx, ladder.l.cz + ladder.l.dz) - 0.05
      p.vx = p.vz = 0
      p.crouched = false
      events.push({ type: 'ladder' })
      return events
    }
    const cable = cableHere(g, p, dirX, dirZ)
    if (cable) {
      p.mode = 'cable'
      p.cable = cable.c
      p.cableT = cable.t
      p.vx = p.vz = 0
      p.crouched = false
      events.push({ type: 'cable' })
      return events
    }
  }

  const stepX = p.vx * dt
  const stepZ = p.vz * dt
  const wanted = Math.hypot(stepX, stepZ)
  const moved = moveCircle(g, p.x, p.z, p.y, stepX, stepZ, MECH_RADIUS, p.crouched && p.mode === 'ground' ? CAREFUL : FREE)
  const went = Math.hypot(moved.x - p.x, moved.z - p.z)
  p.x = moved.x
  p.z = moved.z

  if (p.mode === 'ground') {
    // Blocked by something low enough to climb: push on it for a moment.
    let pushing = false
    if (mag > 0.5 && wanted > 1e-5 && went < wanted * 0.4) {
      const ax = p.x + dirX * (MECH_RADIUS + 0.35)
      const az = p.z + dirZ * (MECH_RADIUS + 0.35)
      const h = heightAt(g, ax, az)
      if (h !== VOID && h - p.y > STEP_UP && h - p.y <= MANTLE_MAX) {
        pushing = true
        p.push += dt
        if (p.push >= MANTLE_PUSH_S) {
          const cx = toCell(ax)
          const cz = toCell(az)
          // Land a body's width inside the block's edge, on the line of travel.
          const tx = Math.min((cx + 1) * CELL - MECH_RADIUS - 0.1, Math.max(cx * CELL + MECH_RADIUS + 0.1, p.x + dirX * (MECH_RADIUS * 2 + 0.3)))
          const tz = Math.min((cz + 1) * CELL - MECH_RADIUS - 0.1, Math.max(cz * CELL + MECH_RADIUS + 0.1, p.z + dirZ * (MECH_RADIUS * 2 + 0.3)))
          p.mode = 'mantle'
          p.mantle = { fx: p.x, fy: p.y, fz: p.z, tx, ty: h, tz, t: 0 }
          p.push = 0
          p.vx = p.vz = 0
          p.crouched = false
          events.push({ type: 'mantle' })
          return events
        }
      }
    }
    if (!pushing) p.push = 0

    const floor = heightAt(g, p.x, p.z)
    if (floor !== VOID && p.y - floor > STEP_DOWN) {
      // Walked off a ledge.
      p.mode = 'air'
      p.airFrom = p.y
      p.vy = 0
    } else if (floor !== VOID) {
      // A stair tread or a kerb: follow it without a visible snap.
      p.y = approach(p.y, floor, dt * 9)
    }
  }

  if (p.mode === 'air') {
    p.vy -= GRAVITY * dt
    p.y += p.vy * dt
    const floor = heightAt(g, p.x, p.z)
    if (floor !== VOID && p.y <= floor) {
      p.y = floor
      p.mode = 'ground'
      events.push({ type: 'land', drop: p.airFrom - floor })
      p.vy = 0
    }
  }

  // ── Heading and gait ──
  const flat = Math.hypot(p.vx, p.vz)
  p.speed01 = Math.min(1, flat / (RUN_SPEED * p.speedMul))
  p.stride += went * (p.crouched ? 3.2 : 2.3)
  if (w.aiming) p.yaw += angleDelta(p.yaw, w.aimYaw) * Math.min(1, dt * TURN_RATE * 1.6)
  else if (mag > 0.1) p.yaw += angleDelta(p.yaw, Math.atan2(dirX, dirZ)) * Math.min(1, dt * TURN_RATE)
  return events
}
