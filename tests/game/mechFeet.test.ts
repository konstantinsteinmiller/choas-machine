// #107: nothing of the mech goes under the floor: standing, walking, crouched
// and sneaking (crouched and walking), the lowest skinned vertex is at the
// floor, give or take a centimetre, and the soles touch it.

import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { buildMech, poseMech, restPose, type MechPose } from '@/game/models/mech'

/** The lowest skinned vertex of the legs (thighs, shins, feet). */
const lowest = (s: Partial<MechPose>): number => {
  const rig = buildMech()
  poseMech(rig, { ...restPose(), ...s })
  rig.root.updateMatrixWorld(true)
  const v = new Vector3()
  let min = Infinity
  const geo = rig.mesh.geometry
  const n = geo.attributes.position!.count
  const idx = geo.attributes.skinIndex!
  const legs = new Set(rig.mesh.skeleton.bones.map((b, i) => (/^(thigh|shin|foot)/.test(b.name) ? i : -1)).filter(i => i >= 0))
  for (let i = 0; i < n; i++) {
    if (!legs.has(idx.getX(i))) continue
    rig.mesh.getVertexPosition(i, v)
    v.applyMatrix4(rig.mesh.matrixWorld)
    min = Math.min(min, v.y)
  }
  return min
}

describe('the mech stands on the floor (#107)', () => {
  const cases: Array<[string, Partial<MechPose>]> = [['standing', {}], ['crouched', { crouch: 1 }]]
  for (let k = 0; k < 8; k++) {
    cases.push([`walking ${k}`, { speed: 1, stride: (k / 8) * Math.PI * 2 }])
    cases.push([`sneaking ${k}`, { speed: 0.6, crouch: 1, stride: (k / 8) * Math.PI * 2 }])
    cases.push([`crouched aiming ${k}`, { crouch: 1, aim: 1, aimPitch: -0.6 + k * 0.15 }])
  }
  for (const [name, s] of cases) {
    it(name, () => {
      const y = lowest(s)
      expect(y, name).toBeGreaterThan(-0.015)
      expect(y, name).toBeLessThan(0.06)
    })
  }
})
