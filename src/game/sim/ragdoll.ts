import { VOID, heightAt, type Grid } from '../world/grid'

/**
 * ─── Ragdolls (#64) ──────────────────────────────────────────────────────────
 *
 * A fallen person is a verlet ragdoll: sixteen joints held together by
 * sticks, pulled by gravity, stopped by the ground and the walls. How it dies
 * decides only the push it gets: a rocket throws it tumbling away from the
 * blast, a rifle round lets it buckle and sink where it stood, the blade lets
 * it slide down once the mech lets go, and minigun rounds keep shoving it
 * after death. It sleeps once it has settled (nothing is computed for a still
 * body), and wakes when something pushes it (a blast, a burst, the mech
 * dragging it by the pelvis).
 *
 * Pure: the garrison steps it on the fixed step; the view turns the joints
 * into bone rotations (`garrisonView.ts`).
 */

/** The joints, in the order of `TEMPLATE`. */
export const J = {
  pelvis: 0, chest: 1, neck: 2, head: 3,
  shoulderL: 4, elbowL: 5, handL: 6, shoulderR: 7, elbowR: 8, handR: 9,
  hipL: 10, kneeL: 11, ankleL: 12, hipR: 13, kneeR: 14, ankleR: 15
} as const
export const JOINTS = 16

/**
 * The joints of a person standing, facing +z, in metres from its feet: the
 * guard rig's own bone origins (`models/garrison.ts`), L at +x (the rig's mirror).
 */
export const TEMPLATE: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0.78, 0], [0, 0.92, 0], [0, 1.34, 0], [0, 1.72, 0.02],
  [0.29, 1.28, 0], [0.29, 1.02, 0], [0.29, 0.77, 0.03],
  [-0.29, 1.28, 0], [-0.29, 1.02, 0], [-0.29, 0.77, 0.03],
  [0.12, 0.68, 0], [0.12, 0.36, 0], [0.12, 0.06, 0],
  [-0.12, 0.68, 0], [-0.12, 0.36, 0], [-0.12, 0.06, 0]
]

/** The bones: a skeleton's sticks, plus braces that keep the torso and head a body. */
const STICKS: ReadonlyArray<readonly [number, number]> = [
  // The spine and head.
  [J.pelvis, J.chest], [J.chest, J.neck], [J.neck, J.head],
  // The arms and legs.
  [J.shoulderL, J.elbowL], [J.elbowL, J.handL], [J.shoulderR, J.elbowR], [J.elbowR, J.handR],
  [J.hipL, J.kneeL], [J.kneeL, J.ankleL], [J.hipR, J.kneeR], [J.kneeR, J.ankleR],
  // The torso as one block: shoulders, hips, and the diagonals between.
  [J.shoulderL, J.shoulderR], [J.hipL, J.hipR], [J.shoulderL, J.hipL], [J.shoulderR, J.hipR],
  [J.shoulderL, J.hipR], [J.shoulderR, J.hipL], [J.neck, J.shoulderL], [J.neck, J.shoulderR],
  [J.chest, J.shoulderL], [J.chest, J.shoulderR], [J.pelvis, J.hipL], [J.pelvis, J.hipR],
  [J.pelvis, J.neck], [J.chest, J.hipL], [J.chest, J.hipR],
  // The head stays on the shoulders.
  [J.head, J.shoulderL], [J.head, J.shoulderR], [J.head, J.chest]
]
/** Joints that must not fold through each other (a minimum distance only). */
const SPREAD: ReadonlyArray<readonly [number, number, number]> = [
  [J.handL, J.shoulderL, 0.2], [J.handR, J.shoulderR, 0.2],
  [J.ankleL, J.hipL, 0.3], [J.ankleR, J.hipR, 0.3],
  [J.handL, J.handR, 0.12], [J.kneeL, J.kneeR, 0.12], [J.ankleL, J.ankleR, 0.1],
  [J.head, J.pelvis, 0.7]
]

const GRAVITY = 18
/** How far a joint sits off the ground: the thickness of the body there. */
const RADIUS = 0.07
/** Velocity kept per second in the air (drag), and sliding on the ground. */
const AIR_KEEP = 0.995
const GROUND_KEEP = 0.62
/** A step a joint cannot climb: a wall. */
const WALL = 0.6
const ITERATIONS = 6
/** Asleep after this long with every joint moving slower than SLEEP_V. */
const SLEEP_V = 0.08
const SLEEP_S = 0.6
/** Never simulate a body longer than this after its last wake (s). */
const MAX_AWAKE_S = 8

export interface Ragdoll {
  /** Joint positions now and a step ago, x y z per joint. */
  p: Float32Array
  q: Float32Array
  /** Stick rest lengths. */
  len: Float32Array
  asleep: boolean
  /** Seconds every joint has been slow; seconds since the last wake. */
  still: number
  awake: number
  /** Dragged by the pelvis to here (the mech's hand), or null. */
  pin: { x: number; y: number; z: number } | null
}

/** A person standing at x, y, z (feet), facing `yaw`, becomes a ragdoll. */
/**
 * A ragdoll that starts from where a body's joints ARE (16 points, `J`
 * order), not from standing: a guard let go on its knees falls from its
 * knees. The sticks keep the template's lengths, so the body is the same one.
 */
export const ragdollFrom = (points: ArrayLike<number>): Ragdoll => {
  const p = new Float32Array(JOINTS * 3)
  for (let i = 0; i < JOINTS * 3; i++) p[i] = points[i]!
  const t = new Float32Array(JOINTS * 3)
  TEMPLATE.forEach(([tx, ty, tz], i) => { t[i * 3] = tx; t[i * 3 + 1] = ty; t[i * 3 + 2] = tz })
  const len = new Float32Array(STICKS.length)
  STICKS.forEach(([a, b], k) => { len[k] = dist(t, a, b) })
  return { p, q: p.slice(), len, asleep: false, still: 0, awake: 0, pin: null }
}

export const makeRagdoll = (x: number, y: number, z: number, yaw: number): Ragdoll => {
  const p = new Float32Array(JOINTS * 3)
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  TEMPLATE.forEach(([tx, ty, tz], i) => {
    // Facing +z turned by yaw: x' = x cos + z sin, z' = −x sin + z cos.
    p[i * 3] = x + tx * c + tz * s
    p[i * 3 + 1] = y + ty
    p[i * 3 + 2] = z - tx * s + tz * c
  })
  const len = new Float32Array(STICKS.length)
  STICKS.forEach(([a, b], k) => { len[k] = dist(p, a, b) })
  return { p, q: p.slice(), len, asleep: false, still: 0, awake: 0, pin: null }
}

const dist = (p: Float32Array, a: number, b: number): number =>
  Math.hypot(p[a * 3]! - p[b * 3]!, p[a * 3 + 1]! - p[b * 3 + 1]!, p[a * 3 + 2]! - p[b * 3 + 2]!)

/** Give joint `i` (or every joint, −1) a velocity change of vx vy vz, m/s, over a step of `dt`. */
export const push = (r: Ragdoll, i: number, vx: number, vy: number, vz: number, dt: number): void => {
  const from = i < 0 ? 0 : i
  const to = i < 0 ? JOINTS : i + 1
  for (let k = from; k < to; k++) {
    r.q[k * 3]! -= vx * dt
    r.q[k * 3 + 1]! -= vy * dt
    r.q[k * 3 + 2]! -= vz * dt
  }
  wake(r)
}

export const wake = (r: Ragdoll): void => {
  r.asleep = false
  r.still = 0
  r.awake = 0
}

/** A deterministic 0 … 1 from a number (a unit's seed): every body falls its own way, the same way on a replay. */
const hash = (n: number): number => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return v - Math.floor(v)
}

/**
 * The push of the killing blow. `hx hz` the direction it came from the
 * attacker to the body (unit), `how` what did it, `seed` the unit's own number.
 */
export const strike = (r: Ragdoll, how: 'shot' | 'spray' | 'blast' | 'blade', hx: number, hz: number, seed: number, dt: number): void => {
  const a = hash(seed)
  const b = hash(seed + 1.7)
  switch (how) {
    case 'blast': {
      // Off its feet: away and up, the legs kicked one way and the head
      // another, so it tumbles — never twice the same.
      const sp = 6 + a * 4
      const up = 5 + b * 3
      push(r, -1, hx * sp, up, hz * sp, dt)
      const twist = (a - 0.5) * 6
      for (const i of [J.head, J.neck, J.shoulderL, J.shoulderR]) push(r, i, -hz * twist, 1.5, hx * twist, dt)
      for (const i of [J.ankleL, J.ankleR, J.kneeL, J.kneeR]) push(r, i, hx * (2 + b * 3), -1 - b, hz * (2 + b * 3), dt)
      break
    }
    case 'spray':
      // Rounds into the chest: shoved back, turned a little.
      push(r, -1, hx * 2.5, 0.6, hz * 2.5, dt)
      for (const i of [J.chest, J.neck, J.head]) push(r, i, hx * 2, 0.3, hz * 2, dt)
      push(r, a < 0.5 ? J.shoulderL : J.shoulderR, -hz * 2, 0, hx * 2, dt)
      break
    case 'shot':
      // The legs go and it sinks where it stood; the round nudges the head
      // and shoulders the way it travelled.
      for (const i of [J.head, J.neck]) push(r, i, hx * (1.2 + a), 0, hz * (1.2 + a), dt)
      for (const i of [J.kneeL, J.kneeR]) push(r, i, -hx * 0.6 + (b - 0.5), 0, -hz * 0.6 + (a - 0.5), dt)
      break
    case 'blade':
      // Let go: it slides down where it was held, slumping forward.
      for (const i of [J.head, J.neck, J.chest]) push(r, i, hx * 0.6, 0, hz * 0.6, dt)
      for (const i of [J.kneeL, J.kneeR]) push(r, i, hx * 0.4, 0, hz * 0.4, dt)
      break
  }
}

/** A blast at x y z of `radius` flings every joint within it (a body already down too). */
export const blastRagdoll = (r: Ragdoll, x: number, y: number, z: number, radius: number, dt: number): boolean => {
  const px = r.p[0]!
  const pz = r.p[2]!
  const d = Math.hypot(px - x, pz - z)
  if (d > radius || Math.abs(r.p[1]! - y) > 3) return false
  const f = 1 - d / radius
  const nx = d > 0.01 ? (px - x) / d : 0
  const nz = d > 0.01 ? (pz - z) / d : 1
  push(r, -1, nx * 7 * f, 5 * f + 1, nz * 7 * f, dt)
  return true
}

/** Advance the ragdoll one step over the level. */
export const stepRagdoll = (r: Ragdoll, g: Grid, dt: number): void => {
  if (r.asleep && !r.pin) return
  r.awake += dt
  const p = r.p
  const q = r.q
  // Verlet: carry on from the last move, plus gravity.
  let fastest = 0
  for (let i = 0; i < JOINTS; i++) {
    const k = i * 3
    const vx = (p[k]! - q[k]!) * AIR_KEEP
    const vy = (p[k + 1]! - q[k + 1]!) * AIR_KEEP
    const vz = (p[k + 2]! - q[k + 2]!) * AIR_KEEP
    q[k] = p[k]!
    q[k + 1] = p[k + 1]!
    q[k + 2] = p[k + 2]!
    p[k] = p[k]! + vx
    p[k + 1] = p[k + 1]! + vy - GRAVITY * dt * dt
    p[k + 2] = p[k + 2]! + vz
    fastest = Math.max(fastest, Math.hypot(vx, vy, vz) / dt)
  }
  for (let it = 0; it < ITERATIONS; it++) {
    STICKS.forEach(([a, b], s) => solve(p, a, b, r.len[s]!, 1))
    for (const [a, b, min] of SPREAD) {
      if (dist(p, a, b) < min) solve(p, a, b, min, 1)
    }
    if (r.pin) {
      p[0] = r.pin.x
      p[1] = r.pin.y
      p[2] = r.pin.z
    }
    collide(r, g)
  }
  if (fastest < SLEEP_V && !r.pin) r.still += dt
  else r.still = 0
  if (r.still > SLEEP_S || r.awake > MAX_AWAKE_S) {
    r.asleep = true
    q.set(p)
  }
}

/** Move joints a and b toward `rest` apart, each half the way. */
const solve = (p: Float32Array, a: number, b: number, rest: number, stiff: number): void => {
  const ax = a * 3
  const bx = b * 3
  const dx = p[bx]! - p[ax]!
  const dy = p[bx + 1]! - p[ax + 1]!
  const dz = p[bx + 2]! - p[ax + 2]!
  const d = Math.hypot(dx, dy, dz) || 1e-4
  const k = ((d - rest) / d) * 0.5 * stiff
  p[ax] = p[ax]! + dx * k
  p[ax + 1] = p[ax + 1]! + dy * k
  p[ax + 2] = p[ax + 2]! + dz * k
  p[bx] = p[bx]! - dx * k
  p[bx + 1] = p[bx + 1]! - dy * k
  p[bx + 2] = p[bx + 2]! - dz * k
}

/** The ground and the walls: a joint lands on the floor under it, and does not go into a wall. */
const collide = (r: Ragdoll, g: Grid): void => {
  const p = r.p
  const q = r.q
  for (let i = 0; i < JOINTS; i++) {
    const k = i * 3
    let floor = heightAt(g, p[k]!, p[k + 2]!)
    const was = heightAt(g, q[k]!, q[k + 2]!)
    // Into something a step too high (a wall, a crate): back where it was, horizontally.
    if (floor !== VOID && was !== VOID && floor - Math.max(was, q[k + 1]! - RADIUS) > WALL) {
      p[k] = q[k]!
      p[k + 2] = q[k + 2]!
      floor = was
    }
    if (floor === VOID) continue
    if (p[k + 1]! < floor + RADIUS) {
      p[k + 1] = floor + RADIUS
      // Friction: what slides along the ground loses most of its speed.
      q[k] = p[k]! - (p[k]! - q[k]!) * GROUND_KEEP
      q[k + 2] = p[k + 2]! - (p[k + 2]! - q[k + 2]!) * GROUND_KEEP
      q[k + 1] = Math.max(q[k + 1]!, p[k + 1]!)
    }
  }
}

/** Where the body is, for whoever looks for it: its pelvis, and the floor under it. */
export const ragdollAt = (r: Ragdoll, g: Grid): { x: number; y: number; z: number } => {
  const x = r.p[0]!
  const z = r.p[2]!
  const f = heightAt(g, x, z)
  return { x, y: f === VOID ? r.p[1]! - 0.2 : f, z }
}

/** True if any part of the body lies within `m` of the segment from a to b (the minigun's ray), and the joint. */
export const nearRay = (r: Ragdoll, ax: number, ay: number, az: number, bx: number, by: number, bz: number, m: number): number => {
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  const l2 = dx * dx + dy * dy + dz * dz || 1
  let best = -1
  let bestD = m
  for (let i = 0; i < JOINTS; i++) {
    const k = i * 3
    const t = Math.max(0, Math.min(1, ((r.p[k]! - ax) * dx + (r.p[k + 1]! - ay) * dy + (r.p[k + 2]! - az) * dz) / l2))
    const d = Math.hypot(r.p[k]! - (ax + dx * t), r.p[k + 1]! - (ay + dy * t), r.p[k + 2]! - (az + dz * t))
    if (d < bestD) { bestD = d; best = i }
  }
  return best
}

