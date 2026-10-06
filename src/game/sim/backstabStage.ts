import type { Rig } from '../models/kit'
import { poseMech, type MechPose } from '../models/mech'
import type { GuardPose } from '../models/garrison'
import { HIP_Y } from './airStrike'
import {
  STAB_DRAW, VARIANTS, backstabAt, grabWorld, guardToWorld, guardYawAt, lineWorld, markAt, markWorld, type BackstabPose, type BackstabVariant
} from './backstab'
import { placeKillBody } from './killPose'

/**
 * ─── A backstab off the mission's stage ──────────────────────────────────────
 *
 * The training ground's hologram demo (#110) and the model bench play a
 * variant of the backstab (`backstab.ts`) on their own clock: the mech posed
 * with the kill's channels and placed by `placeKillBody` the way the mission
 * does it, and the guard held as the choreography holds it (seized, arched on
 * the blade, going limp, on its knees, turned) until the variant lets it go.
 * There is no ragdoll here: from the release on, the guard falls forward (its
 * 'front' death).
 *
 * The guard's feet are at (gx, gy, gz), facing `gyaw` as it stood when the
 * kill began; `t` is seconds into the variant.
 */

const _mech = backstabAt('neck', 0)
const _guard = backstabAt('neck', 0)

/** How far the blade's pin moved the body in the last `poseBackstabMech` (the arm could not reach: tests read it). */
export const stagePin = { x: 0, y: 0, z: 0 }

/** Pose and place the mech `t` into a variant (`s` carries everything else: the time, the weapon). */
export const poseBackstabMech = (
  rig: Rig, s: MechPose, variant: BackstabVariant, t: number, gx: number, gy: number, gz: number, gyaw: number
): BackstabPose => {
  const bp = backstabAt(variant, t, _mech)
  s.stab = 0
  s.draw = s.plunge = 0
  s.stow = 1
  s.grab = bp.grab
  s.blade = bp.blade
  s.crouch = bp.crouch
  poseMech(rig, s)
  const [fx, , fz] = guardToWorld(gx, gy, gz, gyaw, bp.mx, 0, bp.mz)
  const mark = markWorld(markAt(variant, t), bp, gx, gy, gz, gyaw)
  const at = markAt(variant, t)
  const line = lineWorld(at, bp, gyaw)
  const off = placeKillBody(rig, { x: fx, y: gy, z: fz }, gyaw + bp.myaw, { pitch: bp.lean, pivot: HIP_Y, arm: bp.arm, aim: bp.aim, cock: bp.cock, pin: bp.pin, line, drive: bp.drive, draw: STAB_DRAW[at] }, mark, grabWorld(variant, bp, gx, gy, gz, gyaw), bp.grab)
  stagePin.x = off.x
  stagePin.y = off.y
  stagePin.z = off.z
  return bp
}

/** The guard's channels `t` into a variant, written into `g`; returns its heading (the throat kill turns it). */
export const poseBackstabGuard = (g: GuardPose, variant: BackstabVariant, t: number, gyaw: number): number => {
  const v = VARIANTS[variant]
  const held = t < v.release
  const bp = backstabAt(variant, Math.min(t, v.release), _guard)
  // Let go, it is dead on the blade's terms, as the mission's view poses a fallen body.
  g.gripped = held ? bp.grip : 1
  g.impaled = held ? bp.arch : 1
  g.limp = held ? bp.limp : 1
  g.kneel = held ? bp.kneel : 0
  g.deadT = held ? 0 : Math.max(1e-3, t - v.release)
  g.death = 'front'
  return guardYawAt(gyaw, bp)
}
