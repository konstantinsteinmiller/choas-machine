/**
 * ─── The backstab, three ways ────────────────────────────────────────────────
 *
 * Choreographed after the stealth kills of Assassin's Creed Odyssey and
 * Origins (frame-read reference: scratchpad `ac-brief.md`), for the mech's
 * forearm blade. One is picked at random for each kill, never the same one
 * twice running, so the kill-cams do not repeat:
 *
 *   neck    (Origins, the classic hidden blade) the free hand clamps over
 *           the mouth, a short rising thrust into the side of the neck, a
 *           struggle that goes limp, the body lowered to its knees.
 *   kneel   (Odyssey "Back Standing #2") a level thrust into the lower back,
 *           the guard arches and drops to his knees; the blade arm goes up
 *           overhead and plunges down into the base of the neck.
 *   throat  (Odyssey "Back Standing #1") a hand on the shoulder spins the
 *           guard half round, the mech drops into a crouch under him and
 *           drives the blade up into the throat, then shoves him away.
 *
 * Pure: a variant and seconds in, poses out. Positions are in the GUARD's
 * frame as it stood when the kill began: x to its right, z ahead of it, so
 * "behind" is −z. The blade arm is either free (posed as usual), cocked along
 * a direction in the MECH's frame, or aimed at a point on the guard's body;
 * the mission aims the arm and pins the blade's tip to that point at the
 * blow, so it goes in exactly there.
 */

export type BackstabVariant = 'neck' | 'kneel' | 'throat'
export const BACKSTAB_VARIANTS: readonly BackstabVariant[] = ['neck', 'kneel', 'throat']

/** Where on the guard the blade goes (its own frame, standing upright; `kneel` lowers it). */
export type BodyMark = 'neckSide' | 'lowerBack' | 'neckBase' | 'throat'
export const MARKS: Readonly<Record<BodyMark, readonly [number, number, number]>> = {
  neckSide: [0.07, 1.5, -0.02],
  lowerBack: [0.0, 1.02, 0.04],
  neckBase: [0.0, 1.38, -0.04],
  throat: [0.0, 1.47, 0.07]
}
/**
 * Where the free hand goes on the guard, its own frame: over the mouth (the
 * neck kill), on top of the far shoulder (driven to its knees), on the near
 * shoulder to spin it round (the throat kill).
 */
export const GRAB_AT: Readonly<Record<BackstabVariant, readonly [number, number, number]>> = {
  // Read off the guard as it is held: pulled back onto the mech, its head tipped back.
  neck: [0.0, 1.55, -0.08],
  kneel: [-0.24, 1.36, -0.1],
  throat: [0.26, 1.37, -0.1]
}

/** How much a kneeling guard's marks drop (m). */
export const KNEEL_DROP = 0.27

interface Key {
  t: number
  /** The mech's feet, guard frame. */
  mx: number
  mz: number
  /** The mech's heading relative to the guard's (0: looking at its back). */
  myaw: number
  crouch: number
  /** Forward lean of the mech's body (rad). */
  lean: number
  /** The free hand on the guard. */
  grab: number
  /** The blade arm taken over (0: posed as usual), and cocked (0) … aimed at the mark (1). */
  arm: number
  aim: number
  /** The cock direction, mech frame (x right, y up, z ahead). */
  cock: readonly [number, number, number]
  blade: number
  /** The guard: seized, arched on the blade, going limp, on its knees, turned toward the mech (0 … 1). */
  grip: number
  arch: number
  limp: number
  kneel: number
  turn: number
}

interface Variant {
  keys: Key[]
  /** The blows: when, and where. The first kills; the guard is held up until `release`. */
  hits: ReadonlyArray<{ t: number; mark: BodyMark }>
  /** The guard is let go to fall (its ragdoll starts from where it is then), and the push it gets (m/s, guard frame). */
  release: number
  shove: readonly [number, number, number]
  end: number
}

const k = (t: number, o: Partial<Key>, base: Key): Key => ({ ...base, ...o, t })

const REST: Key = { t: 0, mx: 0.4, mz: -0.75, myaw: 0, crouch: 0, lean: 0.1, grab: 0, arm: 0, aim: 0, cock: [0, -0.5, -0.85], blade: 0, grip: 0, arch: 0, limp: 0, kneel: 0, turn: 0 }

const chain = (list: Array<[number, Partial<Key>]>): Key[] => {
  const out: Key[] = []
  let prev = REST
  for (const [t, o] of list) { prev = k(t, o, prev); out.push(prev) }
  return out
}

export const VARIANTS: Readonly<Record<BackstabVariant, Variant>> = {
  neck: {
    keys: chain([
      [0, { mx: 0.42, mz: -0.62, myaw: 0.2, crouch: 0.35, lean: 0.25 }],
      [0.22, { mx: 0.24, mz: -0.4, myaw: 0.1, crouch: 0.1, lean: 0.1, grab: 1, arm: 1, aim: 0, cock: [0.15, -0.55, -0.8], blade: 1, grip: 1 }],
      [0.5, { mx: 0.24, mz: -0.34, aim: 1, arch: 1 }],
      [1.0, { arch: 1, limp: 0.35 }],
      [1.45, { limp: 1, crouch: 0.35, kneel: 0.35 }],
      [2.05, { mx: 0.1, mz: -0.4, crouch: 0.65, lean: 0.3, kneel: 1, arm: 0.7, aim: 0.6 }],
      [2.45, { arm: 0, aim: 0, grab: 0, blade: 0, crouch: 0.3, lean: 0.1 }]
    ]),
    hits: [{ t: 0.5, mark: 'neckSide' }],
    release: 2.2,
    shove: [0, -0.4, 0.8],
    end: 2.6
  },
  kneel: {
    keys: chain([
      [0, { mx: 0.42, mz: -0.72, myaw: 0.15, crouch: 0.25, lean: 0.2 }],
      [0.26, { mx: 0.14, mz: -0.42, myaw: 0.05, crouch: 0.1, grab: 1, arm: 1, aim: 0, cock: [0.2, -0.25, -0.95], blade: 1, grip: 1 }],
      [0.58, { mx: 0.04, mz: -0.36, lean: 0.25, aim: 1, arch: 1 }],
      [0.85, { arch: 1 }],
      [1.2, { kneel: 1, arch: 0.7, aim: 0, cock: [0.1, 1, -0.2], lean: -0.15, crouch: 0, mz: -0.4 }],
      [1.48, { aim: 0, lean: -0.2 }],
      [1.64, { aim: 1, lean: 0.4, crouch: 0.15, limp: 0.4 }],
      [2.05, { limp: 1, aim: 1, lean: 0.3 }],
      [2.4, { arm: 0, aim: 0, grab: 0, blade: 0, lean: 0.05, crouch: 0, mz: -0.55 }]
    ]),
    hits: [{ t: 0.58, mark: 'lowerBack' }, { t: 1.64, mark: 'neckBase' }],
    release: 2.25,
    shove: [0, -0.2, 1.4],
    end: 2.8
  },
  throat: {
    keys: chain([
      [0, { mx: 0.36, mz: -0.82, myaw: 0, crouch: 0.2, lean: 0.2 }],
      [0.22, { mx: 0.32, mz: -0.52, myaw: 0.35, grab: 1, arm: 1, aim: 0, cock: [0.1, -0.9, -0.35], blade: 1, grip: 1 }],
      [0.62, { mx: 0.42, mz: -0.2, myaw: 1.05, crouch: 0.85, lean: 0.45, turn: 1 }],
      [0.98, { mx: 0.5, mz: -0.17, crouch: 0.3, lean: -0.05, aim: 1, arch: 1 }],
      [1.35, { arch: 1, limp: 0.55 }],
      [1.62, { aim: 0, arm: 0.6, lean: -0.2, crouch: 0.15 }],
      [2.0, { arm: 0, grab: 0, blade: 0, lean: 0.05, crouch: 0, limp: 1 }]
    ]),
    hits: [{ t: 0.98, mark: 'throat' }],
    release: 1.66,
    // The guard faces the mech by now: shoved away, backward in its own frame.
    shove: [0.2, 0.5, -2.6],
    end: 2.3
  }
}

export interface BackstabPose extends Omit<Key, 't'> {
  /** The latest blow struck by now (−1 before the first), and how firmly the blade is pinned to its mark. */
  hit: number
  pin: number
}

const smooth = (v: number): number => { const c = v < 0 ? 0 : v > 1 ? 1 : v; return c * c * (3 - 2 * c) }
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** The pose `t` seconds into a variant (from the moment the mech has closed in). */
export const backstabAt = (variant: BackstabVariant, t: number, out?: BackstabPose): BackstabPose => {
  const v = VARIANTS[variant]
  const keys = v.keys
  let i = 0
  while (i < keys.length - 1 && keys[i + 1]!.t <= t) i++
  const a = keys[i]!
  const b = keys[Math.min(keys.length - 1, i + 1)]!
  const e = b.t > a.t ? smooth((t - a.t) / (b.t - a.t)) : 1
  const o = out ?? ({} as BackstabPose)
  for (const f of ['mx', 'mz', 'myaw', 'crouch', 'lean', 'grab', 'arm', 'aim', 'blade', 'grip', 'arch', 'limp', 'kneel', 'turn'] as const) o[f] = lerp(a[f], b[f], e)
  const c = [lerp(a.cock[0], b.cock[0], e), lerp(a.cock[1], b.cock[1], e), lerp(a.cock[2], b.cock[2], e)] as const
  const n = Math.hypot(c[0], c[1], c[2]) || 1
  o.cock = [c[0] / n, c[1] / n, c[2] / n]
  let hit = -1
  for (let h = 0; h < v.hits.length; h++) if (t >= v.hits[h]!.t - 0.02) hit = h
  o.hit = hit
  // The blade is held on its mark from just before the blow while the arm is aimed.
  const next = v.hits.find(h => t <= h.t + 0.6)
  o.pin = next ? o.aim * o.arm * smooth((t - (next.t - 0.12)) / 0.12) : 0
  return o
}

/** The mark the blade is going for at `t`: the next blow's, or the last one's. */
export const markAt = (variant: BackstabVariant, t: number): BodyMark => {
  const hits = VARIANTS[variant].hits
  for (const h of hits) if (t <= h.t + 0.45) return h.mark
  return hits[hits.length - 1]!.mark
}

/** How far the throat kill turns the guard toward the mech (rad, to its right). */
export const TURN_ANGLE = 1.15

/** The guard's heading during the kill (the throat kill turns it to its right, toward the mech). */
export const guardYawAt = (yaw: number, p: { turn: number }): number => yaw - TURN_ANGLE * p.turn

/** Where a mark on the guard is in the world, as the guard stands (turned, kneeling) in pose `p`. */
export const markWorld = (mark: BodyMark, p: { turn: number; kneel: number }, gx: number, gy: number, gz: number, yaw: number): { x: number; y: number; z: number } => {
  const m = MARKS[mark]
  const [x, y, z] = guardToWorld(gx, gy, gz, guardYawAt(yaw, p), m[0], m[1] - KNEEL_DROP * p.kneel, m[2])
  return { x, y, z }
}

/** Where the free hand goes now, in the world (the guard turned and kneeling as in pose `p`). */
export const grabWorld = (variant: BackstabVariant, p: { turn: number; kneel: number }, gx: number, gy: number, gz: number, yaw: number): { x: number; y: number; z: number } => {
  const m = GRAB_AT[variant]
  const [x, y, z] = guardToWorld(gx, gy, gz, guardYawAt(yaw, p), m[0], m[1] - KNEEL_DROP * p.kneel, m[2])
  return { x, y, z }
}

/** A point in the guard's frame (x right, z ahead) to the world, the guard at (gx, gz) facing `yaw`. */
export const guardToWorld = (gx: number, gy: number, gz: number, yaw: number, x: number, y: number, z: number): [number, number, number] => {
  // A character's right is −x when it faces +z.
  const fx = Math.sin(yaw)
  const fz = Math.cos(yaw)
  return [gx - Math.cos(yaw) * x + fx * z, gy + y, gz + Math.sin(yaw) * x + fz * z]
}

/** The next variant: random, never the one just played. */
export const pickVariant = (last: BackstabVariant | null, roll: number): BackstabVariant => {
  const pool = BACKSTAB_VARIANTS.filter(x => x !== last)
  return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))]!
}

/**
 * The kill-cam (after Odyssey's): a cut at the start to a locked shot from
 * the side the blade comes in on, a little in front of the guard, about three metres out and a
 * little above, with no cuts during the kill; it eases in a touch toward the
 * blow and back as the body is let go. `side` 1 is the guard's right.
 */
export const backstabCam = (
  out: { x: number; y: number; z: number; tx: number; ty: number; tz: number; fov: number },
  variant: BackstabVariant, t: number, gx: number, gy: number, gz: number, yaw: number, fov: number
): typeof out => {
  const v = VARIANTS[variant]
  const last = v.hits[v.hits.length - 1]!.t
  const inK = smooth(t / last)
  const outK = smooth((t - v.release) / (v.end - v.release))
  // From the blade's side, a little in front of the guard: its face, the hand
  // over its mouth and the blade at its neck (from behind, the mech's back
  // hides the guard; square in profile, the mech's shoulder hides the neck).
  // The throat kill turns the guard toward the mech: film the two in profile,
  // from in front.
  const sideX = variant === 'throat' ? 0.9 : 2.4
  const backZ = variant === 'throat' ? 2.5 : 0.9
  const dist = 1 - 0.12 * inK + 0.15 * outK
  const [x, , z] = guardToWorld(gx, gy, gz, yaw, sideX * dist, 0, backZ * dist)
  out.x = x
  out.y = gy + 1.75 - 0.2 * inK + 0.15 * outK
  out.z = z
  const [lx, , lz] = guardToWorld(gx, gy, gz, yaw, 0.15, 0, -0.2)
  out.tx = lx
  out.ty = gy + 1.15 - (variant === 'kneel' ? 0.2 * smooth((t - 1.0) / 0.4) : 0) - 0.4 * outK
  out.tz = lz
  out.fov = fov * (0.7 - 0.05 * inK)
  return out
}
