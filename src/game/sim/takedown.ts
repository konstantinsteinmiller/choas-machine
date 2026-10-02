import type { CinePose } from './cine'

/**
 * ─── The takedown ────────────────────────────────────────────────────────────
 *
 * The blade from behind (or from above), as a piece of choreography instead
 * of a lunge and a pop. Pure: seconds in, numbers out.
 *
 * It starts when the mech has closed to arm's length behind its target:
 *
 *   draw    the free hand goes over the target's shoulder; the blade arm is
 *           cocked back and the blade jumps out of the forearm
 *   stab    the arm goes through: the blade enters the back and its tip
 *           shows at the stomach. This is the kill, and time slows
 *   hold    the target hangs on the blade, going limp. The camera is in
 *           front of it now: this is the shot
 *   pull    the blade comes back out and the hand lets go
 *   out     the body drops; the mech straightens
 *
 * The target does not fall until the blade is out: the simulation kills it at
 * `stab` and gives it a `hold` to wait out before its fall begins.
 */
export const TAKEDOWN = {
  draw: 0.36,
  stab: 0.1,
  hold: 0.85,
  pull: 0.28,
  out: 0.42,
  /** How far behind the target the mech stands, metres. */
  reach: 0.72,
  /** Time scale from the stab until the blade starts back out. */
  slow: 0.3
} as const

/** The beats, in seconds from the end of the lunge. */
export const TD_STAB = TAKEDOWN.draw
export const TD_IN = TD_STAB + TAKEDOWN.stab
export const TD_PULL = TD_IN + TAKEDOWN.hold
export const TD_FREE = TD_PULL + TAKEDOWN.pull
export const TD_END = TD_FREE + TAKEDOWN.out
/** How long the dead target waits on the blade before it may fall. */
export const TD_HOLD = TD_FREE - TD_IN

const sat = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (v: number): number => { const k = sat(v); return k * k * (3 - 2 * k) }

export interface TakedownPose {
  /** 0 … 1 the free hand on the target. */
  grab: number
  /** 0 … 1 the blade arm cocked back. */
  draw: number
  /** 0 … 1 the blade arm through. */
  plunge: number
  /** 0 hidden … 1 out (past 1 for the instant it springs). */
  blade: number
}

/** The mech's arms at `t` seconds into the takedown (negative: still lunging). */
export const takedownPose = (t: number, out: TakedownPose): TakedownPose => {
  const leaving = smooth((t - TD_PULL) / TAKEDOWN.pull)
  out.grab = smooth((t + 0.06) / 0.2) * (1 - leaving)
  out.plunge = smooth((t - TD_STAB) / TAKEDOWN.stab) * (1 - leaving)
  out.draw = smooth(t / (TAKEDOWN.draw * 0.7)) * (1 - smooth((t - TD_FREE) / (TAKEDOWN.out * 0.7)))
  // The blade springs out late in the draw, overshoots, and goes back in
  // once the arm has come home.
  const spring = sat((t - TAKEDOWN.draw * 0.45) / 0.1)
  const over = spring < 1 ? spring * 1.3 : 1 + 0.3 * Math.max(0, 1 - (t - TAKEDOWN.draw * 0.45 - 0.1) / 0.08)
  out.blade = Math.max(0, over * (1 - smooth((t - TD_FREE - 0.1) / 0.22)))
  return out
}

export interface VictimPose {
  /** 0 … 1 seized from behind, alive. */
  gripped: number
  /** 0 … 1 on the blade. */
  impaled: number
  /** 0 … 1 the life going out of it. */
  limp: number
}

/** The target's body at `t`. */
export const victimPose = (t: number, out: VictimPose): VictimPose => {
  out.gripped = smooth((t + 0.02) / 0.14)
  out.impaled = t >= TD_STAB ? smooth((t - TD_STAB) / TAKEDOWN.stab) : 0
  out.limp = smooth((t - TD_IN - 0.2) / (TAKEDOWN.hold * 0.8))
  return out
}

/**
 * The camera. Two set-ups and a cut between them:
 *
 * - until the stab, from the mech's weapon side and a little behind, so the
 *   blade's draw and the hand on the shoulder are both in the frame;
 * - from the stab on, in FRONT of the target and to one side, low, pushing in:
 *   the blade's tip at the stomach, the target's face, the mech's eyes over
 *   its shoulder. Then it eases back as the body is let go.
 *
 * `(vx, vy, vz)` is the target's feet, `yaw` the way it faces.
 */
export const takedownCam = (out: CinePose, t: number, vx: number, vy: number, vz: number, yaw: number, fov: number): CinePose => {
  const fx = Math.sin(yaw)
  const fz = Math.cos(yaw)
  // A character's right is −x when it faces +z.
  const rx = -Math.cos(yaw)
  const rz = Math.sin(yaw)
  if (t < TD_STAB) {
    const k = smooth((t + 0.3) / (TD_STAB + 0.3))
    const back = 1.5 - 0.3 * k
    const side = 2.5 - 0.3 * k
    out.x = vx - fx * back + rx * side
    out.y = vy + 1.55
    out.z = vz - fz * back + rz * side
    out.tx = vx - fx * 0.35
    out.ty = vy + 1.3
    out.tz = vz - fz * 0.35
    out.fov = fov * 0.74
    return out
  }
  const push = smooth((t - TD_STAB) / (TD_PULL - TD_STAB))
  const away = smooth((t - TD_PULL) / (TD_END - TD_PULL))
  const dist = 3.0 - 0.45 * push + 1.1 * away
  out.x = vx + fx * dist - rx * (1.0 - 0.2 * push)
  out.y = vy + 1.25 + 0.2 * away
  out.z = vz + fz * dist - rz * (1.0 - 0.2 * push)
  out.tx = vx - fx * 0.1
  out.ty = vy + 1.22 - 0.55 * away
  out.tz = vz - fz * 0.1
  out.fov = fov * (0.62 + 0.1 * away)
  return out
}
