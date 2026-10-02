import { VOID, findPath, hasLineOfSight, heightAt, smoothPath, toCell, walkLine, type Grid } from '../world/grid'
import type { Fortress, PostKind, Waypoint } from '../world/fortress'
import { exposure, noticeRate, type Viewer, type Seen } from './perception'
import { makeAlert, raiseAlert, pressAlert, stepAlert, ENGAGED_PER_S, type Alert, type AlertCause } from './alert'
import { angleDelta } from './player'
import { hashSeed, mulberry32, type Rng } from '../world/rng'

/**
 * ─── The garrison ────────────────────────────────────────────────────────────
 *
 * Everyone who defends the base, as plain data and one step function. Pure:
 * no renderer, no DOM, so a test can run a whole infiltration in memory.
 *
 * A guard walks its route. When it half-sees the mech its detection meter
 * fills; past a threshold it is SUSPICIOUS and walks over to look, and when
 * the meter is full it has SPOTTED the mech: the base's alert jumps, and keeps
 * climbing for as long as that guard still has eyes on it. Break the line of
 * sight (or silence the witness) and it searches, then goes back to its
 * route. A body in view does the same as a glimpse, once per body.
 *
 * Drones do not look along a cone but down: a searchlight on the ground,
 * ahead of the drone, that the player can see and step round.
 *
 * Enforcers and the Goliath stand dormant here; the alarm wakes them
 * (`chaos.ts`).
 */

/** `dormant`: a machine powered down. `reserve`: not in the base yet. */
export type UnitState = 'patrol' | 'suspicious' | 'search' | 'combat' | 'dormant' | 'reserve' | 'dead'

interface Spec {
  /** Sight range (metres) and half-angle of the cone (radians). */
  range: number
  half: number
  /** Eye height above the feet. */
  eye: number
  /** Top of the silhouette above the feet. */
  height: number
  radius: number
  walk: number
  /** Speed when walking over to look, and when running to a fight. */
  look: number
  run: number
  hp: number
}

const HUMAN = { eye: 1.5, height: 1.72, radius: 0.35, walk: 1.5, look: 2.3, run: 3.9 }
export const SPECS: Readonly<Record<PostKind, Spec>> = {
  // A guard sees a 110° cone, some 22 m deep (plan G4).
  guard: { ...HUMAN, range: 22, half: 0.96, hp: 30 },
  // A sentry watches one way, far and narrow: the thing a sniper deals with first.
  sentry: { ...HUMAN, range: 30, half: 0.55, hp: 30 },
  commander: { ...HUMAN, range: 20, half: 0.96, hp: 60 },
  drone: { eye: 0, height: 0.5, radius: 0.45, walk: 2.6, look: 1.2, run: 3.6, range: 0, half: 0, hp: 20 },
  enforcer: { eye: 2.9, height: 3.3, radius: 0.95, walk: 2.0, look: 2.0, run: 2.6, range: 30, half: 1.0, hp: 600 },
  goliath: { eye: 2.6, height: 3.0, radius: 2.6, walk: 1.4, look: 1.4, run: 1.8, range: 40, half: 1.2, hp: 3000 }
}

/** The drone's searchlight: this far ahead of it on the ground, this wide. */
export const SPOT_AHEAD = 3
export const SPOT_RADIUS = 4.5
/** Seconds a fully lit, standing mech has before a drone is sure of it. */
const SPOT_NOTICE_S = 0.9

/** Detection meter thresholds: past the first a unit goes to look. */
export const SUSPECT_AT = 0.4
const DECAY_PER_S = 0.3
const DECAY_WARY_PER_S = 0.1
/** A unit already looking for something notices faster. */
const WARY_GAIN = 1.6

/** How far a body can be told for what it is, and how long a look takes. */
const BODY_RANGE = 14
const BODY_NOTICE_S = 0.5
const BODY_HEIGHT = 0.45

/** What a second (third …) witness adds to the alert. */
const SECOND_WITNESS = 8

/** A drone that has lost the mech this long goes back to its sweep. */
const DRONE_LOST_S = 4

const TURN_RATE = 5.5
/** The Goliath's hull turns this slowly, its turret this fast (rad/s). */
export const GOLIATH_HULL_TURN = 0.55
export const GOLIATH_TURRET_TURN = 1.3
/** Seconds of full alert at which each reinforcement wave arrives, and its size. */
export const WAVE_AT_S: readonly number[] = [8, 24, 42]
export const WAVE_SIZE = 2
/** A machine takes this long to power up. */
export const WAKE_S = 1.6
const HUH_S = 0.9
const SCAN_S = 3.5
const SCAN_LURED_S = 6
const HUNT_SCAN_S = 5
/** In full alert the base knows where the mech is: guards re-route this often. */
const HUNT_REPATH_S = 1.5
/** A guard in a fight stops closing in once it is this near. */
const ENGAGE_DIST = 11

/**
 * How hard a threat level makes the garrison (plan 10.3): tougher, harder
 * hitting, quicker to notice. Level I is gentler than the baseline, for a
 * player's first night.
 */
export interface Threat {
  hp: number
  damage: number
  notice: number
}
const THREATS: readonly Threat[] = [
  { hp: 1, damage: 0.75, notice: 0.8 },
  { hp: 1, damage: 1, notice: 1 },
  { hp: 1.15, damage: 1.1, notice: 1 },
  { hp: 1.3, damage: 1.25, notice: 1.1 },
  { hp: 1.6, damage: 1.5, notice: 1.25 }
]
export const threatOf = (level: number): Threat => THREATS[Math.min(THREATS.length, Math.max(1, Math.round(level))) - 1]!

export interface Unit {
  id: number
  kind: PostKind
  x: number
  /** Feet (walkers) or body (drones). */
  y: number
  z: number
  px: number
  py: number
  pz: number
  /** Body heading; `look` is the head's turn on top of it. Sight follows both. */
  yaw: number
  pyaw: number
  look: number
  state: UnitState
  /** Seconds in the current state. */
  t: number
  /** Detection meter, 0 … 1. */
  detect: number
  /** It has the mech in view this step. */
  sees: boolean
  /** Where it last saw (or heard of) something worth a look. */
  seenX: number
  seenZ: number
  /** Walking over because of a decoy: not a worry for the base. */
  lured: boolean
  route: Waypoint[]
  /** Route stop it is heading for. */
  wp: number
  wait: number
  path: Array<{ x: number; z: number }>
  pathI: number
  /** Seconds until the next re-route while hunting. */
  repath: number
  bodyT: number
  hp: number
  /** Seconds since it died; the fall plays out over the first of them. */
  deadT: number
  /** 1 fell forward, −1 backward. */
  fallDir: number
  /** A body, and somebody has already raised the alarm over it. */
  found: boolean
  stride: number
  speed01: number
  homeX: number
  homeZ: number
  homeYaw: number
  altitude: number
  /** Its own phase for idle sweeps, so no two guards move in step. */
  seed: number
  /** Machines: 0 powered down … 1 awake. Always 1 for the living. */
  power: number
  /** Seconds until it may start its next burst (or shell). */
  fireT: number
  /** Rounds left in the burst it is firing, and seconds to the next one. */
  burst: number
  burstT: number
  /** The Goliath: seconds until the shell it has called lands, and where. */
  shellT: number
  shellX: number
  shellZ: number
  /** 0 … 1 kick of its last shot, for the pose. */
  recoil: number
}

export interface Garrison {
  units: Unit[]
  alert: Alert
  time: number
  /** What happened since the mission last drained it (`drainEvents`). */
  events: GarrisonEvent[]
  /** Hit rolls; seeded per fortress, so a test replays the same fight. */
  rng: Rng
  /** Reinforcement waves sent so far, and seconds of full alert. */
  wave: number
  chaosT: number
  /** Decoys standing in the base (the mission's list): the Goliath shoots at
   *  the nearest one it can see in preference to the mech. */
  lures: ReadonlyArray<{ x: number; y: number; z: number }>
  threat: Threat
}

/** What the garrison is looking for: the mech. */
export interface Target {
  x: number
  /** Feet. */
  y: number
  z: number
  /** Top of its silhouette above its feet. */
  height: number
  crouched: boolean
  /** False while it cannot be seen at all (the drop-in, the extraction). */
  visible: boolean
  /** 0 standing still … 1 at a run: a moving mech is harder to hit. */
  moving?: number
}

export type GarrisonEvent =
  | { type: 'suspicious'; id: number }
  | { type: 'spotted'; id: number }
  | { type: 'calm'; id: number }
  | { type: 'body'; id: number; corpse: number }
  | { type: 'kill'; id: number }
  | { type: 'chaos' }
  /** A machine powers up. */
  | { type: 'wake'; id: number }
  /** A reinforcement wave came in: `n` guards. */
  | { type: 'wave'; n: number }
  /** A round fired at the mech: `damage` is 0 for a miss. */
  | { type: 'fire'; id: number; damage: number }
  /** The Goliath has called a shell onto a point; it lands in `dur` seconds. */
  | { type: 'telegraph'; id: number; x: number; z: number; radius: number; dur: number }
  /** The shell landed. `damage` is what the mech took from it. */
  | { type: 'shell'; id: number; x: number; y: number; z: number; damage: number }

const isHuman = (u: Unit): boolean => u.kind === 'guard' || u.kind === 'sentry' || u.kind === 'commander'
/** Still on its feet (or in the air) and part of the defence. */
export const isAlive = (u: Unit): boolean => u.state !== 'dead' && u.state !== 'reserve'
/** Has no idea: the state a blade needs. */
export const isUnaware = (u: Unit): boolean => u.state === 'patrol' || (u.state === 'suspicious' && u.lured)
/** Heading from a to b: 0 along +z, growing toward +x. */
export const headingTo = (ax: number, az: number, bx: number, bz: number): number => Math.atan2(bx - ax, bz - az)

export const makeGarrison = (f: Fortress, level = 2): Garrison => {
  const threat = threatOf(level)
  const units: Unit[] = f.posts.map((p, id) => {
    const ground = heightAt(f.grid, p.x, p.z)
    const y = p.kind === 'drone' ? p.altitude : ground
    const mech = p.kind === 'enforcer' || p.kind === 'goliath'
    return {
      id, kind: p.kind, x: p.x, y, z: p.z, px: p.x, py: y, pz: p.z,
      yaw: p.facing, pyaw: p.facing, look: 0,
      state: p.reserve ? 'reserve' : mech ? 'dormant' : 'patrol', t: 0, detect: 0, sees: false, seenX: p.x, seenZ: p.z, lured: false,
      route: p.route, wp: p.route.length > 1 ? 1 : 0, wait: p.route[0]?.wait ?? 0,
      path: [], pathI: 0, repath: 0, bodyT: 0, hp: Math.round(SPECS[p.kind].hp * threat.hp), deadT: 0, fallDir: 1, found: false,
      stride: 0, speed01: 0, homeX: p.x, homeZ: p.z, homeYaw: p.facing, altitude: p.altitude,
      seed: (id * 2.399) % (Math.PI * 2),
      power: mech ? 0 : 1, fireT: 0, burst: 0, burstT: 0, shellT: 0, shellX: 0, shellZ: 0, recoil: 0
    }
  })
  return { units, alert: makeAlert(), time: 0, events: [], rng: mulberry32(hashSeed(f.id)), wave: 0, chaosT: 0, lures: [], threat }
}

// ─── Getting about ───────────────────────────────────────────────────────────

const turnToward = (u: Unit, yaw: number, dt: number, rate = TURN_RATE): void => {
  const d = angleDelta(u.yaw, yaw)
  const step = rate * dt
  u.yaw += Math.abs(d) <= step ? d : Math.sign(d) * step
}

/** Plan a walk to a point. False when there is no way there on foot. */
const goTo = (u: Unit, g: Grid, x: number, z: number): boolean => {
  u.path = []
  u.pathI = 0
  const cells = findPath(g, toCell(u.x), toCell(u.z), toCell(x), toCell(z))
  if (cells.length === 0) return false
  const pts = smoothPath(g, cells)
  // The unit stands somewhere in its cell, not at its middle: skip the walk
  // back to the middle when the next point is reachable from where it is.
  if (pts.length > 1 && walkLine(g, u.x, u.z, pts[1]!.x, pts[1]!.z)) pts.shift()
  // And end on the point itself, not on its cell's middle, when that works.
  const last = pts[pts.length - 1]!
  const before = pts.length > 1 ? pts[pts.length - 2]! : { x: u.x, z: u.z }
  if (walkLine(g, before.x, before.z, x, z)) { last.x = x; last.z = z }
  u.path = pts
  return true
}

/** Walk the planned path. True once there is nothing left of it. */
const follow = (u: Unit, g: Grid, speed: number, dt: number, turn = TURN_RATE): boolean => {
  const p = u.path[u.pathI]
  if (!p) { u.speed01 = 0; return true }
  const dx = p.x - u.x
  const dz = p.z - u.z
  const dist = Math.hypot(dx, dz)
  const step = speed * dt
  if (dist <= step) {
    u.x = p.x
    u.z = p.z
    u.pathI++
  } else {
    u.x += (dx / dist) * step
    u.z += (dz / dist) * step
    turnToward(u, Math.atan2(dx, dz), dt, turn)
  }
  const floor = heightAt(g, u.x, u.z)
  if (floor !== VOID) u.y += (floor - u.y) * Math.min(1, dt * 12)
  u.stride += step * 3.4
  u.speed01 = Math.min(1, speed / SPECS[u.kind].run)
  return u.pathI >= u.path.length
}

const stand = (u: Unit): void => { u.speed01 = 0 }

const enter = (u: Unit, state: UnitState): void => {
  u.state = state
  u.t = 0
}

// ─── Sight ───────────────────────────────────────────────────────────────────

const viewerOf = (u: Unit): Viewer => {
  const s = SPECS[u.kind]
  return { x: u.x, y: u.y + s.eye, z: u.z, yaw: u.yaw + u.look, halfAngle: s.half, range: s.range }
}

/** Where a drone's searchlight falls. */
export const spotCentre = (u: Unit): { x: number; z: number } => ({
  x: u.x + Math.sin(u.yaw) * SPOT_AHEAD,
  z: u.z + Math.cos(u.yaw) * SPOT_AHEAD
})

/** How much of something a unit can see: 0, 0.5 or 1. */
const sight = (u: Unit, g: Grid, t: Seen): number => {
  if (u.kind !== 'drone') return exposure(g, viewerOf(u), t)
  const c = spotCentre(u)
  if (Math.hypot(t.x - c.x, t.z - c.z) > SPOT_RADIUS) return 0
  let seen = 0
  if (hasLineOfSight(g, u.x, u.y - 0.2, u.z, t.x, t.feetY + t.height * 0.92, t.z)) seen += 0.5
  if (hasLineOfSight(g, u.x, u.y - 0.2, u.z, t.x, t.feetY + t.height * 0.5, t.z)) seen += 0.5
  return seen
}

// ─── One step ────────────────────────────────────────────────────────────────

/** The base goes to full alert: every defender still standing comes for the mech. */
const goChaos = (gar: Garrison, target: Target): void => {
  gar.events.push({ type: 'chaos' })
  for (const u of gar.units) {
    if (!isAlive(u)) continue
    if (u.state === 'dormant') { wake(gar, u, target.x, target.z); continue }
    u.detect = 1
    u.lured = false
    u.seenX = target.x
    u.seenZ = target.z
    u.repath = 0
    if (u.state !== 'combat') enter(u, 'combat')
  }
}

/** Power a dormant machine up and point it at something. */
const wake = (gar: Garrison, u: Unit, x: number, z: number): void => {
  if (u.state !== 'dormant') return
  u.detect = 1
  u.seenX = x
  u.seenZ = z
  u.fireT = 1
  enter(u, 'combat')
  gar.events.push({ type: 'wake', id: u.id })
}

/** Wake the dormant Enforcer nearest to a point (a drone's report does this). */
const wakeNearest = (gar: Garrison, x: number, z: number): void => {
  let best: Unit | null = null
  for (const u of gar.units) {
    if (u.state !== 'dormant' || u.kind !== 'enforcer') continue
    if (!best || Math.hypot(u.x - x, u.z - z) < Math.hypot(best.x - x, best.z - z)) best = u
  }
  if (best) wake(gar, best, x, z)
}

const raise = (gar: Garrison, cause: AlertCause, target: Target): void => {
  if (raiseAlert(gar.alert, cause)) goChaos(gar, target)
}

const suspect = (gar: Garrison, u: Unit, x: number, z: number, lured: boolean): void => {
  u.seenX = x
  u.seenZ = z
  if (u.state === 'suspicious' && u.lured === lured) return
  u.lured = lured
  enter(u, 'suspicious')
  u.path = []
  gar.events.push({ type: 'suspicious', id: u.id })
}

const patrol = (u: Unit, g: Grid, time: number, dt: number): void => {
  if (u.route.length < 2) {
    // A post with nowhere to go: watch, with a slow sweep of the head.
    const away = Math.hypot(u.homeX - u.x, u.homeZ - u.z)
    if (away > 0.3 && u.kind !== 'drone') {
      if (u.path.length === 0 && !goTo(u, g, u.homeX, u.homeZ)) { u.homeX = u.x; u.homeZ = u.z }
      follow(u, g, SPECS[u.kind].walk, dt)
      u.look *= Math.max(0, 1 - dt * 4)
      return
    }
    stand(u)
    turnToward(u, u.homeYaw, dt, 2.5)
    u.look = Math.sin(time * 0.45 + u.seed) * 0.45
    return
  }
  if (u.wait > 0) {
    u.wait -= dt
    stand(u)
    const stop = u.route[(u.wp + u.route.length - 1) % u.route.length]!
    if (stop.look !== undefined) turnToward(u, stop.look, dt, 2.5)
    u.look = Math.sin(time * 0.7 + u.seed) * 0.6
    return
  }
  u.look *= Math.max(0, 1 - dt * 4)
  const stop = u.route[u.wp]!
  if (u.kind === 'drone') {
    // Drones fly straight from stop to stop.
    const dx = stop.x - u.x
    const dz = stop.z - u.z
    const dist = Math.hypot(dx, dz)
    const step = SPECS.drone.walk * dt
    turnToward(u, Math.atan2(dx, dz), dt, 1.8)
    if (dist <= step) {
      u.x = stop.x
      u.z = stop.z
      u.wait = stop.wait
      u.wp = (u.wp + 1) % u.route.length
    } else {
      u.x += (dx / dist) * step
      u.z += (dz / dist) * step
    }
    u.y += (u.altitude - u.y) * Math.min(1, dt * 2)
    u.speed01 = 0.6
    return
  }
  if (u.path.length === 0 && !goTo(u, g, stop.x, stop.z)) {
    // No way to the next stop from here (it was led off its loop): skip it.
    u.wp = (u.wp + 1) % u.route.length
    return
  }
  if (follow(u, g, SPECS[u.kind].walk, dt)) {
    u.path = []
    u.wait = stop.wait
    u.wp = (u.wp + 1) % u.route.length
  }
}

/** Walk over to where something was seen, look about, give up. */
const investigate = (u: Unit, g: Grid, dt: number): void => {
  const face = headingTo(u.x, u.z, u.seenX, u.seenZ)
  if (u.state === 'suspicious') {
    if (u.t < HUH_S) {
      // The double-take: stop and turn to it before taking a step.
      stand(u)
      turnToward(u, face, dt)
      u.look *= Math.max(0, 1 - dt * 6)
      return
    }
    if (u.kind === 'drone') {
      // A drone swings its light onto the spot and holds there.
      const c = spotCentre(u)
      const dx = u.seenX - c.x
      const dz = u.seenZ - c.z
      const dist = Math.hypot(dx, dz)
      if (dist > 0.4) {
        const step = Math.min(dist, SPECS.drone.look * dt)
        u.x += (dx / dist) * step
        u.z += (dz / dist) * step
      }
      turnToward(u, face, dt, 2)
      if (u.t > HUH_S + (u.lured ? SCAN_LURED_S : SCAN_S)) enter(u, 'search')
      return
    }
    if (u.path.length === 0) {
      const near = Math.hypot(u.seenX - u.x, u.seenZ - u.z) < 1.2
      if (near || !goTo(u, g, u.seenX, u.seenZ)) {
        // Already there, or it cannot be walked to (the mech is up a tower):
        // look from here.
        enter(u, 'search')
        return
      }
    }
    if (follow(u, g, SPECS[u.kind].look, dt)) {
      u.path = []
      enter(u, 'search')
    }
    return
  }
  // search: stand and sweep.
  stand(u)
  u.look = Math.sin(u.t * 1.9 + u.seed) * 1.1
  if (u.kind !== 'drone') u.yaw += Math.sin(u.t * 0.8) * 0.5 * dt
}

/** What the Goliath shoots at: the nearest decoy it can see, else the mech. */
export const goliathAim = (u: Unit, gar: Garrison, g: Grid, target: Target): { x: number; z: number; lure: boolean } | null => {
  const eye = u.y + SPECS.goliath.eye
  let best: { x: number; z: number; lure: boolean } | null = null
  let bestD = Infinity
  for (const d of gar.lures) {
    const dist = Math.hypot(d.x - u.x, d.z - u.z)
    if (dist < bestD && dist <= SPECS.goliath.range && hasLineOfSight(g, u.x, eye, u.z, d.x, d.y + 1.2, d.z)) {
      best = { x: d.x, z: d.z, lure: true }
      bestD = dist
    }
  }
  if (best) return best
  return u.sees ? { x: target.x, z: target.z, lure: false } : null
}

/** The turret swings onto its aim, faster than the hull can follow. */
const aimTurret = (u: Unit, gar: Garrison, g: Grid, target: Target, dt: number): void => {
  const aim = goliathAim(u, gar, g, target)
  // With nothing in view it swings to where the mech was last reported, so
  // the turret (and its sight) gets there well before the hull does.
  const want = aim
    ? angleDelta(u.yaw, headingTo(u.x, u.z, aim.x, aim.z))
    : gar.alert.chaos ? angleDelta(u.yaw, headingTo(u.x, u.z, u.seenX, u.seenZ)) : 0
  const d = angleDelta(u.look, want)
  const step = GOLIATH_TURRET_TURN * dt
  u.look += Math.abs(d) <= step ? d : Math.sign(d) * step
}

const fight = (u: Unit, g: Grid, gar: Garrison, target: Target, dt: number): void => {
  const spec = SPECS[u.kind]
  if (u.kind !== 'goliath') u.look *= Math.max(0, 1 - dt * 8)
  const dist = Math.hypot(u.seenX - u.x, u.seenZ - u.z)
  if (u.kind === 'drone') {
    // Keep the light on the mech.
    const c = spotCentre(u)
    const dx = u.seenX - c.x
    const dz = u.seenZ - c.z
    const d = Math.hypot(dx, dz)
    if (d > 0.3) {
      const step = Math.min(d, spec.run * dt)
      u.x += (dx / d) * step
      u.z += (dz / d) * step
    }
    turnToward(u, headingTo(u.x, u.z, u.seenX, u.seenZ), dt, 3)
    u.speed01 = 1
    if (u.sees) u.repath = 0
    else if (!gar.alert.chaos && (u.repath += dt) > DRONE_LOST_S) { u.repath = 0; enter(u, 'search') }
    return
  }
  // Machines are slow to turn: that is how they are flanked.
  const turn = u.kind === 'goliath' ? GOLIATH_HULL_TURN : u.kind === 'enforcer' ? 2.2 : 8
  const engage = u.kind === 'goliath' ? 30 : u.kind === 'enforcer' ? 14 : ENGAGE_DIST
  if (u.kind === 'goliath') {
    // The tank holds its ground (it is wider than a gate): it turns its
    // hull, slowly, toward where the mech is or was last reported.
    aimTurret(u, gar, g, target, dt)
    if (gar.alert.chaos && (u.repath -= dt) <= 0 && !u.sees) {
      u.repath = HUNT_REPATH_S
      u.seenX = target.x
      u.seenZ = target.z
    }
    stand(u)
    turnToward(u, headingTo(u.x, u.z, u.sees ? target.x : u.seenX, u.sees ? target.z : u.seenZ), dt, turn)
    return
  }
  if (u.sees) {
    turnToward(u, headingTo(u.x, u.z, target.x, target.z), dt, turn)
    if (dist > engage) {
      if (u.path.length === 0 || (u.repath -= dt) <= 0) {
        u.repath = HUNT_REPATH_S
        goTo(u, g, target.x, target.z)
      }
      follow(u, g, spec.run, dt, turn)
    } else {
      u.path = []
      stand(u)
    }
    return
  }
  // Lost it: run to where it was last seen. In full alert the base keeps
  // calling the mech's position out, so the hunt never goes cold.
  if (gar.alert.chaos && (u.repath -= dt) <= 0) {
    u.repath = HUNT_REPATH_S
    u.seenX = target.x
    u.seenZ = target.z
    u.path = []
  }
  if (u.path.length === 0) {
    if (dist < 1.5 || !goTo(u, g, u.seenX, u.seenZ)) {
      if (gar.alert.chaos) {
        stand(u)
        turnToward(u, headingTo(u.x, u.z, u.seenX, u.seenZ), dt, turn)
      } else {
        enter(u, 'search')
      }
      return
    }
  }
  if (follow(u, g, spec.run, dt, turn)) u.path = []
}

/**
 * Advance the whole garrison by one step. What happened is queued on
 * `gar.events` for the mission to turn into sound, markers and score.
 */
export const stepGarrison = (gar: Garrison, g: Grid, target: Target, dt: number): void => {
  gar.time += dt
  const seen: Seen = { x: target.x, feetY: target.y, z: target.z, height: target.height }
  let calm = true
  let watched = false

  for (const u of gar.units) {
    u.px = u.x
    u.py = u.y
    u.pz = u.z
    u.pyaw = u.yaw
    u.t += dt
    if (u.state === 'dead') {
      u.deadT += dt
      // A drone drops out of the sky.
      if (u.kind === 'drone') {
        const floor = heightAt(g, u.x, u.z)
        u.y = Math.max((floor === VOID ? 0 : floor) + 0.2, u.y - (4 + u.deadT * 14) * dt)
      }
      continue
    }
    if (u.state === 'dormant' || u.state === 'reserve') continue
    if (u.power < 1) {
      // Powering up: it stands and whirs, and does nothing else yet.
      u.power = Math.min(1, u.power + dt / WAKE_S)
      calm = false
      continue
    }

    // ── What it sees of the mech ──
    const exposed = target.visible ? sight(u, g, seen) : 0
    u.sees = exposed > 0
    if (u.sees) {
      const wary = u.state === 'suspicious' || u.state === 'search' ? WARY_GAIN : 1
      const rate = u.kind === 'drone'
        ? (exposed * (target.crouched ? 0.7 : 1)) / SPOT_NOTICE_S
        : noticeRate(Math.hypot(target.x - u.x, target.z - u.z), SPECS[u.kind].range, exposed, target.crouched)
      u.detect = Math.min(1, u.detect + rate * wary * gar.threat.notice * dt)
      u.seenX = target.x
      u.seenZ = target.z
    } else if (u.state !== 'combat') {
      u.detect = Math.max(0, u.detect - (u.state === 'patrol' ? DECAY_PER_S : DECAY_WARY_PER_S) * dt)
    }

    // ── What it makes of it ──
    if (u.state !== 'combat' && u.detect >= 1) {
      enter(u, 'combat')
      u.lured = false
      u.path = []
      u.repath = 0
      gar.events.push({ type: 'spotted', id: u.id })
      // The first to be sure raises the alarm; one more pair of eyes on a
      // mech the base already knows about adds little.
      const known = gar.units.some(o => o !== u && o.state === 'combat')
      // A drone's report sends a machine (plan G7).
      if (u.kind === 'drone') wakeNearest(gar, target.x, target.z)
      if (!known) raise(gar, u.kind === 'drone' ? 'drone' : 'seen', target)
      else if (pressAlert(gar.alert, SECOND_WITNESS)) goChaos(gar, target)
    } else if (u.state === 'patrol' && u.detect >= SUSPECT_AT) {
      suspect(gar, u, u.seenX, u.seenZ, false)
    } else if (u.state === 'suspicious' && u.lured && u.detect >= SUSPECT_AT) {
      // What it walked over to look at turns out to be worth a real look.
      u.lured = false
    }

    // ── Bodies ──
    if (u.state !== 'combat') {
      let looking = false
      for (const c of gar.units) {
        if (c.state !== 'dead' || c.found || c.kind === 'drone' || c.deadT < 0.6) continue
        if (Math.hypot(c.x - u.x, c.z - u.z) > BODY_RANGE) continue
        if (sight(u, g, { x: c.x, feetY: c.y, z: c.z, height: BODY_HEIGHT }) <= 0) continue
        looking = true
        u.bodyT += dt
        if (u.bodyT >= BODY_NOTICE_S) {
          c.found = true
          u.bodyT = 0
          u.detect = Math.max(u.detect, 0.6)
          gar.events.push({ type: 'body', id: u.id, corpse: c.id })
          suspect(gar, u, c.x, c.z, false)
          raise(gar, 'body', target)
        }
        break
      }
      if (!looking) u.bodyT = 0
    }

    // ── What it does ──
    switch (u.state as UnitState) {
      case 'patrol':
        patrol(u, g, gar.time, dt)
        break
      case 'suspicious':
        investigate(u, g, dt)
        break
      case 'search': {
        investigate(u, g, dt)
        const limit = u.lured ? SCAN_LURED_S : gar.alert.level > 0 ? HUNT_SCAN_S : SCAN_S
        if (u.t > limit && !u.sees) {
          u.lured = false
          u.detect = Math.min(u.detect, SUSPECT_AT * 0.5)
          u.path = []
          enter(u, 'patrol')
          gar.events.push({ type: 'calm', id: u.id })
        }
        break
      }
      case 'combat':
        fight(u, g, gar, target, dt)
        if (u.sees) watched = true
        // Out of sight long enough, and not in full alert: it lets go.
        if (!u.sees && !gar.alert.chaos) u.detect = Math.max(0.5, u.detect - 0.12 * dt)
        break
    }
    if (u.state === 'combat' || u.state === 'search' || (u.state === 'suspicious' && !u.lured)) calm = false
  }

  // Full alert: reinforcements come in through the gates, in waves.
  if (gar.alert.chaos) {
    gar.chaosT += dt
    if (gar.wave < WAVE_AT_S.length && gar.chaosT >= WAVE_AT_S[gar.wave]!) {
      gar.wave++
      let n = 0
      for (const u of gar.units) {
        if (u.state !== 'reserve' || n >= WAVE_SIZE) continue
        n++
        u.detect = 1
        u.seenX = target.x
        u.seenZ = target.z
        u.fireT = 1.2
        enter(u, 'combat')
      }
      if (n > 0) gar.events.push({ type: 'wave', n })
    }
  }

  // However many are watching, the meter climbs at one rate: being seen by
  // two guards is not twice as bad, it is two witnesses to silence.
  if (watched && pressAlert(gar.alert, ENGAGED_PER_S * dt)) goChaos(gar, target)
  stepAlert(gar.alert, dt, calm)
}

/** Take the queued events (the queue is emptied). */
export const drainEvents = (gar: Garrison): GarrisonEvent[] => gar.events.splice(0, gar.events.length)

// ─── What the mech does to the garrison ──────────────────────────────────────

/**
 * Take a unit out. `fromX/fromZ` is where the blow came from, which decides
 * the way it falls.
 */
export const killUnit = (gar: Garrison, id: number, fromX: number, fromZ: number): void => {
  const u = gar.units[id]
  if (!u || !isAlive(u)) return
  const toSource = angleDelta(u.yaw, headingTo(u.x, u.z, fromX, fromZ))
  // Hit from the front it goes over backward; from behind, onto its face.
  u.fallDir = Math.abs(toSource) < Math.PI / 2 ? -1 : 1
  u.hp = 0
  u.state = 'dead'
  u.t = 0
  u.deadT = 0
  u.sees = false
  u.detect = 0
  u.speed01 = 0
  u.path = []
  // A wrecked drone is scrap, not a body anyone raises the alarm over.
  u.found = u.kind === 'drone'
  gar.events.push({ type: 'kill', id })
}

/**
 * A defender was hit and lived, or stood next to something that did not:
 * it knows it is under attack and from where.
 */
export const alarmUnit = (gar: Garrison, id: number, fromX: number, fromZ: number): void => {
  const u = gar.units[id]
  if (!u || !isAlive(u) || u.state === 'combat') return
  // A machine that is hit wakes up.
  if (u.state === 'dormant') { wake(gar, u, fromX, fromZ); return }
  u.detect = 1
  u.seenX = fromX
  u.seenZ = fromZ
  u.lured = false
  u.path = []
  u.repath = 0
  enter(u, 'combat')
  gar.events.push({ type: 'spotted', id })
  const target: Target = { x: fromX, y: 0, z: fromZ, height: 0, crouched: false, visible: false }
  raise(gar, 'seen', target)
}

/** Hurt a unit; kills it when its health runs out. True if it died. */
export const damageUnit = (gar: Garrison, id: number, amount: number, fromX: number, fromZ: number): boolean => {
  const u = gar.units[id]
  if (!u || !isAlive(u)) return false
  u.hp -= amount
  if (u.hp > 0) return false
  killUnit(gar, id, fromX, fromZ)
  return true
}

/**
 * Something was heard at a point: a round hitting a wall, a rocket. Raises
 * the alert by `cause` (once, if anyone is in earshot) and sends everyone in
 * earshot to look. Returns true if that tipped the base into full alert.
 */
export const noiseAt = (gar: Garrison, target: Target, x: number, z: number, radius: number, cause: AlertCause): boolean => {
  let heard = false
  for (const u of gar.units) {
    if (!isAlive(u) || u.state === 'dormant' || u.state === 'combat') continue
    if (Math.hypot(u.x - x, u.z - z) > radius) continue
    heard = true
    u.detect = Math.max(u.detect, SUSPECT_AT + 0.05)
    suspect(gar, u, x, z, false)
  }
  if (!heard && cause !== 'loud') return false
  const was = gar.alert.chaos
  raise(gar, cause, target)
  return !was && gar.alert.chaos
}

/**
 * A decoy lights up at a point: every human in range who can see it walks
 * over to look, without the base thinking anything of it.
 */
export const lureTo = (gar: Garrison, g: Grid, x: number, y: number, z: number, radius: number): number => {
  let n = 0
  for (const u of gar.units) {
    if (!isAlive(u) || !isHuman(u) || u.state === 'combat') continue
    if (u.state === 'suspicious' && !u.lured) continue
    if (Math.hypot(u.x - x, u.z - z) > radius) continue
    if (!hasLineOfSight(g, u.x, u.y + SPECS[u.kind].eye, u.z, x, y + 1.2, z)) continue
    suspect(gar, u, x, z, true)
    n++
  }
  return n
}

/** How many of the garrison are still up (dormant machines included). */
export const livingCount = (gar: Garrison): number => gar.units.reduce((n, u) => n + (isAlive(u) ? 1 : 0), 0)
