import { Matrix4, Quaternion, Vector3 } from 'three'
import type { Rig } from './kit'
import { J, JOINTS, TEMPLATE } from '../sim/ragdoll'

/**
 * ─── A ragdoll's joints onto the guard's bones (#64) ─────────────────────────
 *
 * Each bone follows a segment of the ragdoll: its direction (joint → joint)
 * and a side vector for its twist (the shoulders for the arms and the chest,
 * the hips for the legs). A bone's world rotation is the segment's frame now,
 * times what that frame was in the rest pose relative to the bone (`C`), so
 * nothing depends on how the rig happens to orient its bones. The rig's root
 * sits at the world origin while this drives it; the hips bone carries the
 * pelvis position.
 */

type Bone = 'hips' | 'chest' | 'head' | 'armL' | 'foreL' | 'armR' | 'foreR' | 'legL' | 'shinL' | 'footL' | 'legR' | 'shinR' | 'footR'
interface Seg { from: number; to: number; sa: number; sb: number; parent: Bone | null }

const SEGS: Readonly<Record<Bone, Seg>> = {
  hips: { from: J.pelvis, to: J.chest, sa: J.hipL, sb: J.hipR, parent: null },
  chest: { from: J.chest, to: J.neck, sa: J.shoulderL, sb: J.shoulderR, parent: 'hips' },
  head: { from: J.neck, to: J.head, sa: J.shoulderL, sb: J.shoulderR, parent: 'chest' },
  armL: { from: J.shoulderL, to: J.elbowL, sa: J.shoulderL, sb: J.shoulderR, parent: 'chest' },
  foreL: { from: J.elbowL, to: J.handL, sa: J.shoulderL, sb: J.shoulderR, parent: 'armL' },
  armR: { from: J.shoulderR, to: J.elbowR, sa: J.shoulderL, sb: J.shoulderR, parent: 'chest' },
  foreR: { from: J.elbowR, to: J.handR, sa: J.shoulderL, sb: J.shoulderR, parent: 'armR' },
  legL: { from: J.hipL, to: J.kneeL, sa: J.hipL, sb: J.hipR, parent: 'hips' },
  shinL: { from: J.kneeL, to: J.ankleL, sa: J.hipL, sb: J.hipR, parent: 'legL' },
  footL: { from: J.kneeL, to: J.ankleL, sa: J.hipL, sb: J.hipR, parent: 'shinL' },
  legR: { from: J.hipR, to: J.kneeR, sa: J.hipL, sb: J.hipR, parent: 'hips' },
  shinR: { from: J.kneeR, to: J.ankleR, sa: J.hipL, sb: J.hipR, parent: 'legR' },
  footR: { from: J.kneeR, to: J.ankleR, sa: J.hipL, sb: J.hipR, parent: 'shinR' }
}
const ORDER = Object.keys(SEGS) as Bone[]

const _y = new Vector3()
const _x = new Vector3()
const _z = new Vector3()
const _m = new Matrix4()

/** The frame of a segment, from joint positions (x y z per joint). */
const frame = (p: ArrayLike<number>, s: Seg, out: Quaternion): Quaternion => {
  _y.set(p[s.to * 3]! - p[s.from * 3]!, p[s.to * 3 + 1]! - p[s.from * 3 + 1]!, p[s.to * 3 + 2]! - p[s.from * 3 + 2]!)
  if (_y.lengthSq() < 1e-8) _y.set(0, 1, 0)
  _y.normalize()
  _x.set(p[s.sa * 3]! - p[s.sb * 3]!, p[s.sa * 3 + 1]! - p[s.sb * 3 + 1]!, p[s.sa * 3 + 2]! - p[s.sb * 3 + 2]!)
  _x.addScaledVector(_y, -_x.dot(_y))
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0).addScaledVector(_y, -_y.x)
  _x.normalize()
  _z.crossVectors(_x, _y)
  _m.makeBasis(_x, _y, _z)
  return out.setFromRotationMatrix(_m)
}

/** Per bone: the rest frame's inverse times the bone's rest world rotation (shared by every guard rig). */
let C: Record<Bone, Quaternion> | null = null
const restOf = (rig: Rig): Record<Bone, Quaternion> => {
  if (C) return C
  const rest = new Float32Array(JOINTS * 3)
  TEMPLATE.forEach(([x, y, z], i) => rest.set([x, y, z], i * 3))
  const world: Partial<Record<Bone, Quaternion>> = {}
  const c: Partial<Record<Bone, Quaternion>> = {}
  for (const b of ORDER) {
    const s = SEGS[b]
    const local = rig.rest[b]?.q ?? new Quaternion()
    world[b] = s.parent ? world[s.parent]!.clone().multiply(local) : local.clone()
    c[b] = frame(rest, s, new Quaternion()).invert().multiply(world[b]!)
  }
  C = c as Record<Bone, Quaternion>
  return C
}

const _p = new Float32Array(JOINTS * 3)
const _w: Record<string, Quaternion> = Object.fromEntries(ORDER.map(b => [b, new Quaternion()]))
const _inv = new Quaternion()

/** Pose a guard rig from a ragdoll: `p` now, `q` a step ago, `alpha` between them. */
export const poseRagdoll = (rig: Rig, p: ArrayLike<number>, q: ArrayLike<number>, alpha: number): void => {
  const c = restOf(rig)
  for (let i = 0; i < JOINTS * 3; i++) _p[i] = q[i]! + (p[i]! - q[i]!) * alpha
  rig.root.position.set(0, 0, 0)
  rig.root.rotation.set(0, 0, 0)
  for (const b of ORDER) {
    const s = SEGS[b]
    const w = frame(_p, s, _w[b]!).multiply(c[b])
    const bone = rig.bones[b]
    if (!bone) continue
    if (s.parent) bone.quaternion.copy(_inv.copy(_w[s.parent]!).invert().multiply(w))
    else bone.quaternion.copy(w)
  }
  const hips = rig.bones.hips
  if (hips) hips.position.set(_p[0]!, _p[1]!, _p[2]!)
}
