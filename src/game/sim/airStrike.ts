/**
 * ─── The assassination from above ────────────────────────────────────────────
 *
 * Off a rope onto a guard below, choreographed after the air assassinations of
 * Assassin's Creed Odyssey and Origins (frame-read reference: scratchpad
 * `ac-brief.md`), as one fluid motion:
 *
 *   crouch   a beat on the rope, gathering, the blade snapping out
 *   flight   pushed off upright and feet first, arms out for balance; for the
 *            last third the blade arm rises overhead (the flight time is
 *            warped onto 0.45 … 1.0 s, as the games do, not left to physics)
 *   impact   knees onto the shoulders as the blade goes down into the neck
 *   ride     the guard folds under the weight: from behind it goes forward
 *            onto its knees and face, the mech riding its back down; from the
 *            front it goes over backwards and the mech lands astride its chest
 *   kneel    a held beat, kneeling on the body, the blade coming out
 *   rise     up onto its feet
 *
 * Pure: the sim moves the mech along `airAt`, the pose reads the same beats
 * (the blade arm cocked overhead, then aimed at the mark and pinned to it at
 * the blow, `mission.ts`), the camera is `airCam`.
 *
 * Positions are the mech's FEET as if it stood upright; the body leans round
 * its hips (`HIP_Y` above them).
 */

/** The beats that do not depend on the drop (s). */
export const AIR_CROUCH_S = 0.22
export const AIR_IMPACT_S = 0.12
export const AIR_RIDE_S = 0.6
export const AIR_KNEEL_S = 0.55
export const AIR_RISE_S = 0.6
/** The flight is warped onto this range, whatever the drop. */
export const AIR_FLIGHT_MIN_S = 0.45
export const AIR_FLIGHT_MAX_S = 1.0
/** The hips over the feet (the mech drawn at 0.8 of its design size): what the body leans round. */
export const HIP_Y = 0.85
/** After the blow the guard's knees give under the weight; it is let go to fold this long after it. */
export const AIR_RELEASE_S = 0.32

export interface AirPlan {
  /** The guard faced the mech (thrown on its back, the mech astride its chest) or away (driven forward). */
  front: boolean
  /** The mech's heading through the move. */
  yaw: number
  /** The guard's heading. */
  guardYaw: number
  from: { x: number; y: number; z: number }
  /** The guard's feet, and the mark the blade goes into. */
  guard: { x: number; y: number; z: number }
  mark: { x: number; y: number; z: number }
  /** Feet at the blow, kneeling on the body, standing at the end. */
  blow: { x: number; y: number; z: number }
  kneel: { x: number; y: number; z: number }
  end: { x: number; y: number; z: number }
  flight: number
  /** When the blow lands, when the guard is let go, and the whole move (s). */
  hitAt: number
  releaseAt: number
  total: number
}

export interface AirBeat {
  phase: 'crouch' | 'flight' | 'impact' | 'ride' | 'kneel' | 'rise' | 'done'
  x: number
  y: number
  z: number
  /** Forward lean of the body round the hips (rad). */
  pitch: number
  pivot: number
  crouch: number
  /** In the air (the arms out). */
  air: number
  /** The blade arm taken over, and cocked overhead (0) … aimed at the mark (1); the cock direction (mech frame). */
  arm: number
  aim: number
  cock: readonly [number, number, number]
  blade: number
  /** How firmly the blade's tip is held on the mark. */
  pin: number
  /** The guard: its knees giving under the weight, until it is let go. */
  guardKneel: number
}

const smooth = (k: number): number => { const c = k < 0 ? 0 : k > 1 ? 1 : k; return c * c * (3 - 2 * c) }
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k
const OVERHEAD = [0.08, 1, -0.12] as const

/** A point in a frame facing `yaw` at g (x its right, z ahead) to the world. */
const toWorld = (g: { x: number; y: number; z: number }, yaw: number, x: number, y: number, z: number): { x: number; y: number; z: number } =>
  ({ x: g.x - Math.cos(yaw) * x + Math.sin(yaw) * z, y: g.y + y, z: g.z + Math.sin(yaw) * x + Math.cos(yaw) * z })

/**
 * Plan the drop from `from` onto a guard standing at `guard` facing
 * `guardYaw`, its head at `headY`. `floor(x, z)` is the floor there, or null
 * over nothing: the kneel and the end stay on the guard's own floor.
 */
export const planAir = (
  from: { x: number; y: number; z: number },
  guard: { x: number; y: number; z: number },
  headY: number,
  floor: (x: number, z: number) => number | null,
  guardYaw = Math.atan2(guard.x - from.x, guard.z - from.z)
): AirPlan => {
  const yaw = Math.atan2(guard.x - from.x, guard.z - from.z)
  // It faces the mech when its heading is against the way the mech is going.
  const front = Math.cos(yaw - guardYaw) < 0
  const shoulders = headY - 0.22
  // Behind: the base of the neck; in front: the throat.
  const mark = toWorld(guard, guardYaw, 0, headY - guard.y - 0.32, front ? 0.07 : -0.05)
  // At the blow the knees are on the shoulders (a crouched mech's knees are
  // about 0.45 m over its feet), a little to the mech's side of the guard.
  const blow = toWorld(guard, yaw, 0, 0, -0.2)
  blow.y = shoulders - 0.45
  const ok = (p: { x: number; z: number }): boolean => { const h = floor(p.x, p.z); return h !== null && Math.abs(h - guard.y) < 0.6 }
  // Either way the body folds the way the mech is going (driven forward onto
  // its face, or over backward): kneeling on its back, or astride its chest.
  let kneel = toWorld(guard, yaw, 0, 0, front ? 0.75 : 0.6)
  if (!ok(kneel)) kneel = toWorld(guard, yaw, 0, 0, 0.1)
  const end = toWorld(guard, yaw, 0.3, 0, front ? 1.3 : 1.15)
  if (!ok(end)) { end.x = kneel.x; end.z = kneel.z }
  // The knees on the body, not through it.
  kneel.y = guard.y + 0.14
  end.y = guard.y
  const drop = Math.max(0, from.y - blow.y)
  const flight = Math.min(AIR_FLIGHT_MAX_S, Math.max(AIR_FLIGHT_MIN_S, Math.sqrt((2 * (drop + 0.5)) / 9.8) * 1.1))
  const hitAt = AIR_CROUCH_S + flight
  return {
    front, yaw, guardYaw, from: { ...from }, guard: { ...guard }, mark, blow, kneel, end, flight, hitAt,
    releaseAt: hitAt + AIR_RELEASE_S,
    total: hitAt + AIR_IMPACT_S + AIR_RIDE_S + AIR_KNEEL_S + AIR_RISE_S
  }
}

/** Where the mech is and how it holds itself `t` seconds into the move. */
export const airAt = (p: AirPlan, t: number): AirBeat => {
  const b: AirBeat = { phase: 'done', x: p.end.x, y: p.end.y, z: p.end.z, pitch: 0, pivot: HIP_Y, crouch: 0.3, air: 0, arm: 0, aim: 0, cock: OVERHEAD, blade: 0, pin: 0, guardKneel: 1 }
  const tImpact = p.hitAt
  const tRide = tImpact + AIR_IMPACT_S
  const tKneel = tRide + AIR_RIDE_S
  const tRise = tKneel + AIR_KNEEL_S
  if (t < AIR_CROUCH_S) {
    const k = t / AIR_CROUCH_S
    return { ...b, phase: 'crouch', x: p.from.x, y: p.from.y, z: p.from.z, pitch: 0.55 * smooth(k / 0.6), crouch: 0.8 * smooth(k / 0.6), blade: smooth((k - 0.4) / 0.4) * 1.2, guardKneel: 0 }
  }
  if (t < tImpact) {
    const k = (t - AIR_CROUCH_S) / p.flight
    // Out and up off the rope, then the fall onto the shoulders.
    const y = lerp(p.from.y, p.blow.y, k * k) + Math.sin(k * Math.PI) * 0.45
    const late = smooth((k - 0.62) / 0.3)
    return {
      ...b, phase: 'flight', x: lerp(p.from.x, p.blow.x, k), y, z: lerp(p.from.z, p.blow.z, k),
      pitch: lerp(0.55, 0.12, smooth(k / 0.25)) + 0.2 * late,
      crouch: lerp(0.8, 0.15, smooth(k / 0.3)) + 0.55 * smooth((k - 0.7) / 0.3),
      air: 1, arm: smooth((k - 0.45) / 0.25), aim: smooth((k - 0.86) / 0.14) * 0.6, blade: 1,
      pin: smooth((k - 0.88) / 0.12), guardKneel: 0
    }
  }
  if (t < tRide) {
    // The blow: knees on the shoulders, the blade in.
    const sag = smooth((t - tImpact) / (AIR_RELEASE_S + 0.02))
    return { ...b, phase: 'impact', x: p.blow.x, y: p.blow.y - AIR_SAG_M * sag, z: p.blow.z, pitch: 0.4, crouch: 0.75, air: 0.5, arm: 1, aim: 1, blade: 1, pin: 1, guardKneel: sag }
  }
  if (t < tKneel) {
    const r = (t - tRide) / AIR_RIDE_S
    const k = smooth(r)
    // Riding the body down: first a little with the buckling knees (the blade
    // still in), then on over it as it folds.
    const sag = smooth((t - tImpact) / (AIR_RELEASE_S + 0.02))
    const y = lerp(p.blow.y - AIR_SAG_M * sag, p.kneel.y, smooth((r - 0.3) / 0.7))
    return {
      ...b, phase: 'ride', x: lerp(p.blow.x, p.kneel.x, k), y, z: lerp(p.blow.z, p.kneel.z, k),
      pitch: 0.4 + 0.15 * k, crouch: lerp(0.75, 1, k), arm: 1, aim: 1, blade: 1, pin: 1 - smooth((r - 0.2) / 0.5), guardKneel: sag
    }
  }
  if (t < tRise) {
    const k = (t - tKneel) / AIR_KNEEL_S
    // Kneeling on the body; the blade comes out and back.
    return { ...b, phase: 'kneel', x: p.kneel.x, y: p.kneel.y, z: p.kneel.z, pitch: lerp(0.55, 0.3, smooth(k)), crouch: 1, arm: 1 - smooth((k - 0.35) / 0.5), aim: 1 - smooth((k - 0.25) / 0.4), blade: 1 - smooth((k - 0.6) / 0.4) }
  }
  if (t < p.total) {
    const k = smooth((t - tRise) / AIR_RISE_S)
    return { ...b, phase: 'rise', x: lerp(p.kneel.x, p.end.x, k), y: p.kneel.y, z: lerp(p.kneel.z, p.end.z, k), pitch: lerp(0.3, 0, k), crouch: lerp(1, 0.3, k) }
  }
  return b
}

/** How far the guard's marks drop as its knees give (m; `KNEEL_DROP` in `backstab.ts`). */
export const AIR_SAG_M = 0.27

/** Where the mark is now: lower as the guard's knees give under the mech. */
export const airMark = (p: AirPlan, b: AirBeat): { x: number; y: number; z: number } =>
  ({ x: p.mark.x, y: p.mark.y - AIR_SAG_M * b.guardKneel, z: p.mark.z })

/**
 * The kill-cam (after Odyssey's and Origins'): high behind the mech as it
 * leaves the rope; high and to the side over the guard as it falls;
 * then low and three-quarter, close, while it kneels on the body.
 */
export const airCam = (
  out: { x: number; y: number; z: number; tx: number; ty: number; tz: number; fov: number },
  p: AirPlan, t: number, mech: { x: number; y: number; z: number }, fov: number
): typeof out => {
  const g = p.guard
  const fx = Math.sin(p.yaw)
  const fz = Math.cos(p.yaw)
  const rx = -Math.cos(p.yaw)
  const rz = Math.sin(p.yaw)
  // 1: high behind the mech, looking past it at the guard.
  const a = { x: mech.x - fx * 3.2 + rx * 1.2, y: mech.y + 2.6, z: mech.z - fz * 3.2 + rz * 1.2, tx: g.x, ty: g.y + 1.0, tz: g.z }
  // 2: high over the guard and a little to the side, the mech dropping into
  // frame beside it (straight down, the mech would cover the blow).
  const top = { x: g.x - fx * 1.2 + rx * 1.5, y: g.y + 5.8, z: g.z - fz * 1.2 + rz * 1.5, tx: g.x, ty: g.y + 0.8, tz: g.z }
  // 3: low three-quarter, close, on the kneeling mech.
  const low = { x: p.kneel.x + rx * 2.3 + fx * 1.2, y: g.y + 1.25, z: p.kneel.z + rz * 2.3 + fz * 1.2, tx: p.kneel.x, ty: g.y + 0.55, tz: p.kneel.z }
  const toTop = smooth((t - (AIR_CROUCH_S + p.flight * 0.35)) / (p.flight * 0.45))
  const toLow = smooth((t - (p.hitAt + AIR_IMPACT_S + 0.1)) / 0.45)
  for (const f of ['x', 'y', 'z', 'tx', 'ty', 'tz'] as const) out[f] = lerp(lerp(a[f], top[f], toTop), low[f], toLow)
  out.fov = fov * lerp(lerp(0.85, 0.72, toTop), 0.66, toLow)
  return out
}

/**
 * The offset that puts the blade's tip on the mark, scaled by `pin`: the
 * pose adds it to the whole rig at the blow, so the blade goes in there
 * whatever the arm's angles come to.
 */
export const pinBlade = (
  tip: { x: number; y: number; z: number },
  mark: { x: number; y: number; z: number },
  pin: number
): { x: number; y: number; z: number } => ({ x: (mark.x - tip.x) * pin, y: (mark.y - tip.y) * pin, z: (mark.z - tip.z) * pin })

/** Where a lean round the point `pivot` over the feet puts the feet (the rig's origin), along `yaw`. */
export const pitchedFeet = (x: number, y: number, z: number, yaw: number, pitch: number, pivot = HIP_Y): { x: number; y: number; z: number } => {
  const along = -pivot * Math.sin(pitch)
  return { x: x + Math.sin(yaw) * along, y: y + pivot - pivot * Math.cos(pitch), z: z + Math.cos(yaw) * along }
}
