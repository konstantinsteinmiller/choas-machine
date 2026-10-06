import { Vector3 } from 'three'
import type { Rig } from '../models/kit'
import { aimBladeArm, reachFreeHand, BLADE_TIP_LOCAL } from '../models/mech'
import { pinBlade, pitchedFeet } from './airStrike'

/**
 * ─── The blade kills, on the body ────────────────────────────────────────────
 *
 * What the backstab (`backstab.ts`) and the assassination from above
 * (`airStrike.ts`) do to the mech's rig once `poseMech` has posed it: the
 * body leaned round its hips, the blade arm cocked along a direction or aimed
 * at the mark on the guard, and at the blow the blade's tip held a hand's
 * depth INTO the mark (the whole rig shifted by however far it would miss),
 * so the blade goes in exactly there whatever the arm's angles come to.
 *
 * Shared by the mission, the intro's dive kill and the tests.
 */

export interface KillBody {
  /** Forward lean round the point `pivot` over the feet (rad). */
  pitch: number
  pivot: number
  /** The blade arm taken over, cocked (0) … aimed at the mark (1); the cock direction in the mech's frame (x right, y up, z ahead). */
  arm: number
  aim: number
  cock: readonly [number, number, number]
  /** How firmly the tip is held on the mark. */
  pin: number
  /**
   * The stab's line (#174, world, unit: the way the blade goes in). With it,
   * `aim` puts the forearm on that line (`aimBladeLine`) and `drive` runs the
   * tip along it, from drawn back (0) to in (1): a thrust, not a swing.
   */
  line?: { x: number; y: number; z: number } | null
  drive?: number
  /** How far back along the line the blade is drawn before the thrust (m; `DRAW_BACK` if not given). */
  draw?: number
}

/** How far the blade is drawn back along its line before the thrust (m). */
export const DRAW_BACK = 0.34

/** How deep the tip goes past the mark (m). */
export const BLADE_DEPTH = 0.13
/** Shoulder to tip with the blade arm cocked (m; straight it is about 1.05). */
export const COCK_REACH = 0.62

const _sh = new Vector3()
const _dir = new Vector3()
const _aim = new Vector3()
const _tip = new Vector3()

/** The blade arm's direction in the world for a kill pose (cock blended to the mark by `aim`). */
export const bladeDir = (rig: Rig, yaw: number, k: KillBody, mark: { x: number; y: number; z: number } | null, out: Vector3): Vector3 => {
  const [cx, cy, cz] = k.cock
  // The mech's right is −x when it faces +z.
  out.set(-Math.cos(yaw) * cx + Math.sin(yaw) * cz, cy, Math.sin(yaw) * cx + Math.cos(yaw) * cz).normalize()
  const sh = rig.bones.shoulderR
  if (mark && sh && k.aim > 0) {
    rig.root.updateMatrixWorld(true)
    sh.getWorldPosition(_sh)
    _aim.set(mark.x - _sh.x, mark.y - _sh.y, mark.z - _sh.z).normalize()
    out.lerp(_aim, Math.min(1, k.aim)).normalize()
  }
  return out
}

/**
 * Place a posed mech for a kill: its feet at `feet` (as if upright), facing
 * `yaw`, leaned, the blade arm aimed and the tip pinned. Returns the shift
 * the pin gave the rig (zero when unpinned).
 */
export const placeKillBody = (
  rig: Rig, feet: { x: number; y: number; z: number }, yaw: number, k: KillBody,
  mark: { x: number; y: number; z: number } | null,
  /** The free hand onto this point on the guard, blended in by `handW` (after the pin: the hand stays on the body). */
  hand: { x: number; y: number; z: number } | null = null, handW = 0
): { x: number; y: number; z: number } => {
  const off = placeArm(rig, feet, yaw, k, mark)
  if (hand && handW > 0) reachFreeHand(rig, hand, handW)
  return off
}

const placeArm = (
  rig: Rig, feet: { x: number; y: number; z: number }, yaw: number, k: KillBody,
  mark: { x: number; y: number; z: number } | null
): { x: number; y: number; z: number } => {
  const root = rig.root
  root.rotation.order = 'YXZ'
  root.rotation.set(k.pitch, yaw, 0)
  const at = pitchedFeet(feet.x, feet.y, feet.z, yaw, k.pitch, k.pivot)
  root.position.set(at.x, at.y, at.z)
  if (k.arm <= 0) return { x: 0, y: 0, z: 0 }
  if (k.line) return placeOnLine(rig, at, k, mark, k.line)
  bladeDir(rig, yaw, k, mark, _dir)
  // Cocked, the elbow bent; aimed, the arm reaches exactly into the mark.
  let reach = COCK_REACH
  const sh = rig.bones.shoulderR
  if (mark && sh && k.aim > 0) {
    sh.getWorldPosition(_sh)
    reach += (Math.hypot(mark.x - _sh.x, mark.y - _sh.y, mark.z - _sh.z) + BLADE_DEPTH - COCK_REACH) * Math.min(1, k.aim)
  }
  aimBladeArm(rig, _dir, k.arm, reach)
  const blade = rig.bones.blade
  if (!mark || !blade || k.pin <= 0) return { x: 0, y: 0, z: 0 }
  root.updateMatrixWorld(true)
  blade.localToWorld(_tip.set(0, BLADE_TIP_LOCAL, 0))
  const off = pinBlade(_tip, { x: mark.x + _dir.x * BLADE_DEPTH, y: mark.y + _dir.y * BLADE_DEPTH, z: mark.z + _dir.z * BLADE_DEPTH }, k.pin)
  root.position.set(at.x + off.x, at.y + off.y, at.z + off.z)
  root.updateMatrixWorld(true)
  return off
}

/**
 * The blade arm of a kill posed on its stab's line (#174): cocked first (the
 * fist back by the hip, the elbow out), then by `aim` a two-bone reach for the
 * point `drive` of the way along the line from drawn back to in, the elbow
 * kept out to the side (`aimBladeArm`'s pole): the tip runs straight along
 * the line, a punch. At the blow the tip is held there (the whole rig shifted
 * by however far it would miss).
 */
const _line = new Vector3()
const _goal = new Vector3()
const placeOnLine = (
  rig: Rig, at: { x: number; y: number; z: number }, k: KillBody,
  mark: { x: number; y: number; z: number } | null, line: { x: number; y: number; z: number }
): { x: number; y: number; z: number } => {
  const root = rig.root
  const yaw = root.rotation.y
  bladeDir(rig, yaw, { ...k, aim: 0 }, null, _dir)
  aimBladeArm(rig, _dir, k.arm, COCK_REACH)
  if (!mark || k.aim <= 0) return { x: 0, y: 0, z: 0 }
  _line.set(line.x, line.y, line.z).normalize()
  const into = BLADE_DEPTH - (1 - (k.drive ?? 1)) * (k.draw ?? DRAW_BACK)
  _goal.set(mark.x, mark.y, mark.z).addScaledVector(_line, into)
  const sh = rig.bones.shoulderR
  if (!sh) return { x: 0, y: 0, z: 0 }
  root.updateMatrixWorld(true)
  sh.getWorldPosition(_sh)
  _aim.subVectors(_goal, _sh)
  const reach = _aim.length()
  if (reach > 1e-4) aimBladeArm(rig, _aim.multiplyScalar(1 / reach), Math.min(1, k.aim) * Math.min(1, k.arm), reach)
  const blade = rig.bones.blade
  if (!blade || k.pin <= 0) return { x: 0, y: 0, z: 0 }
  root.updateMatrixWorld(true)
  blade.localToWorld(_tip.set(0, BLADE_TIP_LOCAL, 0))
  const off = pinBlade(_tip, { x: _goal.x, y: _goal.y, z: _goal.z }, k.pin)
  root.position.set(at.x + off.x, at.y + off.y, at.z + off.z)
  root.updateMatrixWorld(true)
  return off
}

/**
 * The outermost points of the mech's body, by bone (the head's crown, the
 * hands, the knees, the toes, the blade's tip): kneeling on a body or riding
 * it down, every one stays above the floor.
 */
export const BODY_EXTREMES: ReadonlyArray<readonly [string, number, number, number]> = [
  ['head', 0, 0.45, 0], ['chest', 0, 0.25, -0.25], ['hips', 0, -0.1, -0.25],
  ['foreL', 0, -0.45, 0], ['foreR', 0, -0.45, 0],
  ['shinL', 0, 0, 0.1], ['shinR', 0, 0, 0.1], ['footL', 0, -0.1, 0.2], ['footR', 0, -0.1, 0.2],
  ['blade', 0, BLADE_TIP_LOCAL, 0]
]

/** How far the lowest point of the posed body sinks below `floor + clear` (0 when it does not). */
export const bodySink = (rig: Rig, floor: number, clear = 0.03): number => {
  rig.root.updateMatrixWorld(true)
  let low = Infinity
  for (const [bone, ox, oy, oz] of BODY_EXTREMES) {
    const b = rig.bones[bone]
    if (!b || !b.visible) continue
    low = Math.min(low, b.localToWorld(_tip.set(ox, oy, oz)).y)
  }
  return low === Infinity ? 0 : Math.max(0, floor + clear - low)
}
