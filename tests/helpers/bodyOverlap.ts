// How far one posed rig's body sinks into another's (#172): the backstab's
// mech must not stand inside its guard. The guard's body is taken as a box
// round each of its bones' parts (in that bone's frame: boxes ride the
// pose); every vertex of the mech's parts on the bones that count is
// skinned to the world and tested against those boxes, shrunk by `margin`.

import { Box3, Matrix4, Vector3 } from 'three'
import type { Rig } from '@/game/models/kit'

const _m = new Matrix4()
const _v = new Vector3()

/** Each bone's parts as a box in that bone's own frame. */
export const boneBoxes = (rig: Rig): Array<{ bone: number; box: Box3 }> => {
  const bones = rig.mesh.skeleton.bones
  const inv = rig.mesh.skeleton.boneInverses
  const boxes = new Map<number, Box3>()
  for (const p of rig.parts) {
    const pos = p.geo.attributes.position!
    const b = boxes.get(p.bone) ?? new Box3()
    for (let i = 0; i < pos.count; i++) b.expandByPoint(_v.fromBufferAttribute(pos, i).applyMatrix4(inv[p.bone]!))
    boxes.set(p.bone, b)
  }
  void bones
  return [...boxes].map(([bone, box]) => ({ bone, box }))
}

/** The deepest a vertex of `a` (on the bones named in `only`, or every bone not in `skip`) is inside `b`'s boxes (m), and where. */
export const overlapDepth = (
  a: Rig, b: Rig, opts: { skip?: readonly string[]; margin?: number; boxes?: Array<{ bone: number; box: Box3 }> } = {}
): { depth: number; bone: string; guardBone: string } => {
  a.root.updateMatrixWorld(true)
  b.root.updateMatrixWorld(true)
  const margin = opts.margin ?? 0.02
  const boxes = (opts.boxes ?? boneBoxes(b)).map(({ bone, box }) => ({
    bone, box: box.clone().expandByScalar(-margin), toLocal: new Matrix4().copy(b.mesh.skeleton.bones[bone]!.matrixWorld).invert()
  })).filter(x => !x.box.isEmpty())
  const ab = a.mesh.skeleton.bones
  const ainv = a.mesh.skeleton.boneInverses
  const skip = new Set(opts.skip ?? [])
  let best = { depth: 0, bone: '', guardBone: '' }
  for (const p of a.parts) {
    const name = ab[p.bone]!.name
    if (skip.has(name)) continue
    // A part scaled to nothing (a holstered weapon) is not there.
    if (ab[p.bone]!.getWorldScale(_v).x < 0.01) continue
    _m.multiplyMatrices(ab[p.bone]!.matrixWorld, ainv[p.bone]!)
    const pos = p.geo.attributes.position!
    for (let i = 0; i < pos.count; i += 2) {
      const w = _v.fromBufferAttribute(pos, i).applyMatrix4(_m)
      for (const g of boxes) {
        const l = w.clone().applyMatrix4(g.toLocal)
        if (!g.box.containsPoint(l)) continue
        const d = Math.min(l.x - g.box.min.x, g.box.max.x - l.x, l.y - g.box.min.y, g.box.max.y - l.y, l.z - g.box.min.z, g.box.max.z - l.z)
        if (d > best.depth) best = { depth: d, bone: name, guardBone: b.mesh.skeleton.bones[g.bone]!.name }
      }
    }
  }
  return best
}
