// #39 (R14): a cable is walked, arms out, feet on the line; not slid along.

import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { buildMech, poseMech, restPose } from '@/game/models/mech'

const at = (rig: ReturnType<typeof buildMech>, bone: string): Vector3 => {
  const v = new Vector3()
  rig.bones[bone]!.getWorldPosition(v)
  return v
}

describe('the cable walk', () => {
  it('the arms go out wide to balance, not into the chest', () => {
    const rig = buildMech()
    poseMech(rig, { ...restPose(), cable: 1, speed: 1, stride: 1 })
    rig.root.updateMatrixWorld(true)
    for (const side of ['L', 'R']) {
      const shoulder = at(rig, `shoulder${side}`)
      const elbow = at(rig, `fore${side}`)
      // The elbow is further from the middle than the shoulder, and about as high.
      expect(Math.abs(elbow.x)).toBeGreaterThan(Math.abs(shoulder.x) + 0.3)
      expect(Math.abs(elbow.y - shoulder.y)).toBeLessThan(0.25)
    }
  })

  it('the feet step: a stride later, a different foot is forward', () => {
    const rig = buildMech()
    const forward = (stride: number): number => {
      poseMech(rig, { ...restPose(), cable: 1, speed: 1, stride })
      rig.root.updateMatrixWorld(true)
      return at(rig, 'shinL').z - at(rig, 'shinR').z
    }
    expect(Math.sign(forward(Math.PI / 2))).not.toBe(Math.sign(forward(-Math.PI / 2)))
  })

  it('the feet come in under the body, closer than when walking', () => {
    const rig = buildMech()
    const gap = (cable: number): number => {
      poseMech(rig, { ...restPose(), cable, speed: 1, stride: 0 })
      rig.root.updateMatrixWorld(true)
      return Math.abs(at(rig, 'footL').x - at(rig, 'footR').x)
    }
    expect(gap(1)).toBeLessThan(gap(0) * 0.6)
  })
})
