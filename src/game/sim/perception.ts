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
