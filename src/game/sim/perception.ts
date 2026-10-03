import { hasLineOfSight, type Grid } from '../world/grid'

/**
 * ─── Sight ───────────────────────────────────────────────────────────────────
 *
 * Whether one thing in the base can see another, and how fast seeing turns
 * into noticing. Pure: positions and the grid in, numbers out.
 *
 * A viewer has an eye, a heading and a cone. A target is seen when it is in
 * range, inside the cone and not hidden: two rays are cast, to its head and
 * to its chest, and the share that arrive is its EXPOSURE. A mech crouched
 * behind a cover block shows nothing; one standing behind it shows its head.
 *
 * The mech makes no sound when it moves (GDD 2.1), so there is no hearing of
 * footsteps here: noise comes only from things that are loud (`alert.ts`).
 */

export interface Viewer {
  x: number
  /** Eye height in world space. */
  y: number
  z: number
  /** Heading, radians, 0 along +z. */
  yaw: number
  /** Half of the cone's opening, radians. */
  halfAngle: number
  /** How far it sees, metres. */
  range: number
}

export interface Seen {
  x: number
  /** The ground it stands on. */
  feetY: number
  z: number
  /** Top of its silhouette above its feet (standing or crouched). */
  height: number
}

/** A viewer notices anything this close whatever way it faces: it is on top
 *  of it. Kept short, so a backstab from directly behind still works. */
export const PROXIMITY = 1.1

/**
 * How much of the target the viewer can see: 0 nothing, 0.5 the head only or
 * the body only, 1 all of it.
 */
export const exposure = (g: Grid, v: Viewer, t: Seen): number => {
  const dx = t.x - v.x
  const dz = t.z - v.z
  const dist = Math.hypot(dx, dz)
  if (dist > v.range) return 0
  if (dist > PROXIMITY) {
    // Angle between the viewer's heading and the way to the target.
    const fx = Math.sin(v.yaw)
    const fz = Math.cos(v.yaw)
    const cos = (dx * fx + dz * fz) / dist
    if (cos < Math.cos(v.halfAngle)) return 0
  }
  let seen = 0
  if (hasLineOfSight(g, v.x, v.y, v.z, t.x, t.feetY + t.height * 0.92, t.z)) seen += 0.5
  if (hasLineOfSight(g, v.x, v.y, v.z, t.x, t.feetY + t.height * 0.5, t.z)) seen += 0.5
  return seen
}

/** Seconds to notice a fully exposed, standing mech at point-blank range and
 *  at the very edge of sight. Between them the time grows with the distance. */
export const NOTICE_NEAR_S = 0.35
export const NOTICE_FAR_S = 2.6
/** A crouched mech is this much harder to notice (GDD 5: crouch). */
export const CROUCH_FACTOR = 0.5

/**
 * How fast a viewer's detection meter fills, per second (the meter runs 0 to
 * 1). Zero when the target is not exposed.
 */
export const noticeRate = (dist: number, range: number, exposed: number, crouched: boolean): number => {
  if (exposed <= 0) return 0
  const k = Math.min(1, Math.max(0, dist / range))
  // Closer is quadratically faster: a guard across the yard takes a moment,
  // one round the corner does not.
  const seconds = NOTICE_NEAR_S + (NOTICE_FAR_S - NOTICE_NEAR_S) * k * k
  return (exposed * (crouched ? CROUCH_FACTOR : 1)) / seconds
}

// ─── The graded meter (round 3, after Assassin's Creed: Odyssey) ─────────────
//
// A defender's meter fills in two bands. WHITE (0 … SUSPECT_AT in
// `garrison.ts`): it is noticing something; full, it turns YELLOW and walks
// to where it saw it. YELLOW (… 1): it is looking hard; full, RED: it is sure.
// White fills slowly and forgives a glance; yellow is sharper. Both are
// slower far off, crouched, at the edge of the cone and in shadow; within
// CLOSE_M either fills fast whatever.

/** Seconds a fully exposed, standing mech takes to fill the white band, near and at the edge of sight. */
export const WHITE_NEAR_S = 0.8
export const WHITE_FAR_S = 3.8
/** The same for the yellow band. */
export const YELLOW_NEAR_S = 0.8
export const YELLOW_FAR_S = 3.2
/** Crouching makes each band take this many times as long. */
export const CROUCH_SLOW = 2
/** The outer part of the cone (beyond this share of its half-angle) sees at half speed. */
export const PERIPHERY = 0.6
/** In shadow the bands take this many times as long. */
export const SHADOW_SLOW = 1.7
/** This close, either band fills three times as fast: nobody overlooks a mech at arm's length. */
export const CLOSE_M = 4
/** A first glance: the first this-many seconds of continuous sight add nothing while the defender is at ease. */
export const GRACE_S = 0.5

export interface Glimpse {
  /** Distance, and the viewer's range. */
  dist: number
  range: number
  /** 0 … 1 how much of the mech is in view. */
  exposed: number
  crouched: boolean
  /** The angle off the viewer's heading, over its half-angle (0 dead ahead … 1 at the edge). */
  off: number
  /** Standing in shadow. */
  shadow: boolean
  /** The meter is already in the yellow band. */
  yellow: boolean
}

/** How fast the meter fills, per second, for one band of width `band`. */
export const fillRate = (g: Glimpse, band: number): number => {
  if (g.exposed <= 0) return 0
  const k = Math.min(1, Math.max(0, g.dist / g.range))
  const near = g.yellow ? YELLOW_NEAR_S : WHITE_NEAR_S
  const far = g.yellow ? YELLOW_FAR_S : WHITE_FAR_S
  let seconds = near + (far - near) * k * k
  if (g.crouched) seconds *= CROUCH_SLOW
  if (g.off > PERIPHERY) seconds *= 2
  if (g.shadow) seconds *= SHADOW_SLOW
  if (g.dist < CLOSE_M) seconds /= 3
  return (band * g.exposed) / seconds
}
