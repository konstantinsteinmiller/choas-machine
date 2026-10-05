/**
 * ─── The assassination from above ────────────────────────────────────────────
 *
 * Off a rope onto a guard below, the way the classic dive kill goes: the
 * mech dives head first, the blade arm cocked over its shoulder, and drives
 * the blade down through the guard's head; the dive carries it over the
 * falling body, it touches down beyond, and a forward roll brings it onto
 * its feet. Nothing lands on the guard's head but the blade.
 *
 * Pure: the sim moves the mech along `airAt`, the pose reads the same beats
 * (`mission.place`), and the blade is pinned to the head at the blow
 * (`pinBlade`), so whatever the rig's proportions it goes through the head.
 *
 * Positions are the mech's FEET as if it stood upright; the body pitches
 * round its hips (`HIP_Y` above them), which is how the dive leans and the
 * roll turns over.
 */

/** Seconds of sim time for each beat (the kill-cam slows them further). */
export const AIR_DIVE_S = 0.55
export const AIR_PASS_S = 0.3
export const AIR_ROLL_S = 0.42
export const AIR_TOTAL_S = AIR_DIVE_S + AIR_PASS_S + AIR_ROLL_S
/** The body's lean at the blow (rad, forward), and when it touches down. */
export const AIR_DIVE_PITCH = 1.05
export const AIR_PASS_PITCH = 1.7
/** The hips, above the feet: what the diving body turns round. */
export const HIP_Y = 0.9
/** Tucked into a ball for the roll, it turns round the ball's middle, this high. */
export const BALL_Y = 0.55
/** At the blow the hips are this far short of the target (m), and this high over its head. */
const BACK_M = 0.95
const OVER_HEAD_M = 0.35
/** Where it touches down past the target, and how far the roll carries it. */
const TOUCH_M = 1.15
const ROLL_M = 1.5

export interface AirPlan {
  yaw: number
  from: { x: number; y: number; z: number }
  /** The guard's head at the start (the blade's mark). */
  head: { x: number; y: number; z: number }
  /** Feet at the blow, at touch-down, at the end of the roll. */
  blow: { x: number; y: number; z: number }
  touch: { x: number; y: number; z: number }
  end: { x: number; y: number; z: number }
}

export interface AirBeat {
  phase: 'dive' | 'pass' | 'roll' | 'done'
  x: number
  y: number
  z: number
  /** Forward pitch of the body round the hips, rad (2π is a whole roll). */
  pitch: number
  /** The blade arm: cocked back (draw) and driven through (plunge), 0 … 1. */
  draw: number
  plunge: number
  /** Tucked (the roll), 0 … 1. */
  crouch: number
  /** How firmly the blade is held on the head, 0 … 1. */
  pin: number
  /** The height over the feet the body turns round: the hips in the dive, the ball's middle in the roll. */
  pivot: number
}

const smooth = (k: number): number => k * k * (3 - 2 * k)
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k

/**
 * Plan a dive from `from` onto a guard standing at `target` (feet) with its
 * head at `headY`. `floor(x, z)` is the floor height there, or null where
 * there is none: the touch-down and the roll shorten to stay on the guard's
 * own floor.
 */
export const planAir = (
  from: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
  headY: number,
  floor: (x: number, z: number) => number | null
): AirPlan => {
  const dx = target.x - from.x
  const dz = target.z - from.z
  const d = Math.hypot(dx, dz) || 1
  const ux = dx / d
  const uz = dz / d
  const yaw = Math.atan2(dx, dz)
  const onFloor = (m: number): boolean => {
    const h = floor(target.x + ux * m, target.z + uz * m)
    return h !== null && Math.abs(h - target.y) < 0.6
  }
  let touch = TOUCH_M
  while (touch > 0.4 && !onFloor(touch)) touch -= 0.15
  // The roll carries on while there is floor; at an edge it stops short (on the spot, if need be).
  let end = touch + ROLL_M
  while (end > touch && !onFloor(end)) end -= 0.15
  end = Math.max(touch, end)
  return {
    yaw,
    from: { ...from },
    head: { x: target.x, y: headY, z: target.z },
    blow: { x: target.x - ux * BACK_M, y: headY + OVER_HEAD_M - HIP_Y, z: target.z - uz * BACK_M },
    touch: { x: target.x + ux * touch, y: target.y, z: target.z + uz * touch },
    end: { x: target.x + ux * end, y: target.y, z: target.z + uz * end }
  }
}

/** Where the mech is and how it holds itself `t` seconds into the dive. */
export const airAt = (p: AirPlan, t: number): AirBeat => {
  if (t < AIR_DIVE_S) {
    // Out off the rope with a little lift, falling onto the mark; the body
    // leans into it and the blade arm comes back over the shoulder, then down.
    const k = t / AIR_DIVE_S
    const e = smooth(k)
    return {
      phase: 'dive',
      x: lerp(p.from.x, p.blow.x, k),
      y: lerp(p.from.y, p.blow.y, k * k) + Math.sin(k * Math.PI) * 0.7,
      z: lerp(p.from.z, p.blow.z, k),
      // Head first from the start: the lean is in by half way.
      pitch: AIR_DIVE_PITCH * smooth(Math.min(1, k / 0.5)),
      draw: Math.min(1, k / 0.6) * (1 - smooth(Math.max(0, (k - 0.6) / 0.4))),
      plunge: smooth(Math.max(0, (k - 0.6) / 0.4)),
      crouch: 0.15,
      pin: smooth(Math.max(0, (k - 0.7) / 0.3)),
      pivot: HIP_Y
    }
  }
  if (t < AIR_DIVE_S + AIR_PASS_S) {
    // The blade is in: the dive carries the mech over the falling body and
    // down beyond it, turning further over, the blade pulling free.
    const k = (t - AIR_DIVE_S) / AIR_PASS_S
    const e = smooth(k)
    return {
      phase: 'pass',
      x: lerp(p.blow.x, p.touch.x, e),
      y: lerp(p.blow.y, p.touch.y, k * k),
      z: lerp(p.blow.z, p.touch.z, e),
      pitch: lerp(AIR_DIVE_PITCH, AIR_PASS_PITCH, e),
      draw: 0,
      plunge: 1 - smooth(Math.max(0, (k - 0.35) / 0.65)),
      crouch: lerp(0.15, 1, e),
      pin: 1 - smooth(Math.min(1, k / 0.35)),
      pivot: lerp(HIP_Y, BALL_Y, e)
    }
  }
  if (t < AIR_TOTAL_S) {
    // Down: a forward roll along the floor, head over heels, onto its feet.
    const k = (t - AIR_DIVE_S - AIR_PASS_S) / AIR_ROLL_S
    const e = smooth(k)
    return {
      phase: 'roll',
      x: lerp(p.touch.x, p.end.x, e),
      y: p.touch.y,
      z: lerp(p.touch.z, p.end.z, e),
      pitch: lerp(AIR_PASS_PITCH, Math.PI * 2, e),
      draw: 0,
      plunge: 0,
      crouch: 1 - smooth(Math.max(0, (k - 0.75) / 0.25)) * 0.4,
      pin: 0,
      pivot: BALL_Y
    }
  }
  return { phase: 'done', x: p.end.x, y: p.end.y, z: p.end.z, pitch: 0, draw: 0, plunge: 0, crouch: 0.6, pin: 0, pivot: BALL_Y }
}

/**
 * The offset that puts the blade's tip on the mark, scaled by `pin`: the
 * pose adds it to the whole rig at the blow, so the blade goes through the
 * head whatever the arm's angles come to.
 */
export const pinBlade = (
  tip: { x: number; y: number; z: number },
  mark: { x: number; y: number; z: number },
  pin: number
): { x: number; y: number; z: number } => ({ x: (mark.x - tip.x) * pin, y: (mark.y - tip.y) * pin, z: (mark.z - tip.z) * pin })

/** Where a pitch round the point `pivot` over the feet puts the feet (the rig's origin), along `yaw`. */
export const pitchedFeet = (x: number, y: number, z: number, yaw: number, pitch: number, pivot = HIP_Y): { x: number; y: number; z: number } => {
  const along = -pivot * Math.sin(pitch)
  return { x: x + Math.sin(yaw) * along, y: y + pivot - pivot * Math.cos(pitch), z: z + Math.cos(yaw) * along }
}
