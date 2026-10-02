// Round 2, R2: guards walk and stand like people.

import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { buildGuard, poseGuard, restGuardPose, type GuardPose } from '@/game/models/garrison'

const rigAt = (pose: Partial<GuardPose>, commander = false) => {
  const rig = buildGuard(commander)
  poseGuard(rig, { ...restGuardPose(), proud: commander, ...pose })
  rig.root.updateMatrixWorld(true)
  return rig
}
const v = new Vector3()
const lowerAnkle = (pose: Partial<GuardPose>): number => {
  const rig = rigAt(pose)
  return Math.min(...['L', 'R'].map(t => rig.bones[`foot${t}`]!.getWorldPosition(v).y))
}
/** How far forward of the hips the left foot is. */
const footAhead = (pose: Partial<GuardPose>): number => {
  const rig = rigAt(pose)
  return rig.bones.footL!.getWorldPosition(v).z - rig.bones.hips!.getWorldPosition(new Vector3()).z
}
const strideLength = (speed: number): number => {
  let min = Infinity
  let max = -Infinity
  for (let s = 0; s < Math.PI * 2; s += 0.1) {
    const z = footAhead({ stride: s, speed })
    min = Math.min(min, z)
    max = Math.max(max, z)
  }
  return max - min
}

describe('a guard walks like a person', () => {
  it('a foot is on the ground all the way through a stride, at a walk and at a run', () => {
    for (const speed of [0.42, 1]) {
      for (let s = 0; s < Math.PI * 2; s += 0.2) {
        const y = lowerAnkle({ stride: s, speed })
        // The ankle is 6 cm above the sole.
        expect(y, `speed ${speed} stride ${s.toFixed(1)}`).toBeGreaterThan(0.03)
        expect(y, `speed ${speed} stride ${s.toFixed(1)}`).toBeLessThan(0.1)
      }
    }
  })

  it('a patrol at walking pace takes whole steps, not a shuffle', () => {
    const walk = strideLength(0.42)
    const run = strideLength(1)
    expect(walk).toBeGreaterThan(0.38)
    expect(walk).toBeGreaterThan(run * 0.6)
    expect(run).toBeGreaterThan(walk)
  })

  it('the foot rolls: toes up as the heel comes down, heel up as the toe leaves', () => {
    const pitchOf = (stride: number): number => {
      const rig = rigAt({ stride, speed: 0.42 })
      const q = rig.bones.footL!.getWorldQuaternion(new Quaternion())
      return new Vector3(0, 0, 1).applyQuaternion(q).y
    }
    // Reaching forward (heel strike): the toe points up. Trailing (toe off): down.
    expect(pitchOf(Math.PI * 0.6)).toBeGreaterThan(0.08)
    expect(pitchOf(Math.PI * 1.75)).toBeLessThan(-0.08)
  })

  it('the pelvis turns with the stride and the chest turns against it', () => {
    const rig = rigAt({ stride: Math.PI / 2, speed: 0.42 })
    const hips = rig.bones.hips!.rotation.y
    const chest = rig.bones.chest!.rotation.y
    expect(Math.abs(hips)).toBeGreaterThan(0.08)
    expect(Math.sign(chest)).toBe(-Math.sign(hips))
  })

  it('no two guards move alike', () => {
    const a = rigAt({ stride: 1, speed: 0.42, seed: 0.1, time: 3 })
    const b = rigAt({ stride: 1, speed: 0.42, seed: 0.9, time: 3 })
    expect(a.bones.legL!.quaternion.angleTo(b.bones.legL!.quaternion)).toBeGreaterThan(0.03)
  })
})

describe('a guard standing', () => {
  it('is never frozen: it shifts its weight and breathes', () => {
    const a = rigAt({ time: 1 })
    const b = rigAt({ time: 4 })
    expect(Math.abs(a.bones.hips!.position.x - b.bones.hips!.position.x)).toBeGreaterThan(0.005)
    expect(a.bones.chest!.quaternion.angleTo(b.bones.chest!.quaternion)).toBeGreaterThan(0.002)
  })

  it('fidgets now and then: a hand goes up to the helmet', () => {
    let highest = -Infinity
    let lowest = Infinity
    for (let t = 0; t < 60; t += 0.25) {
      const y = rigAt({ time: t, seed: 0.7 }).bones.foreL!.getWorldPosition(v).y
      highest = Math.max(highest, y)
      lowest = Math.min(lowest, y)
    }
    expect(highest - lowest).toBeGreaterThan(0.3)
  })

  it('the Commander does not fidget, and keeps a hand behind his back', () => {
    let spread = 0
    let first = 0
    for (let t = 0; t < 60; t += 0.25) {
      const y = rigAt({ time: t, seed: 0.7 }, true).bones.foreL!.getWorldPosition(v).y
      if (t === 0) first = y
      spread = Math.max(spread, Math.abs(y - first))
    }
    expect(spread).toBeLessThan(0.08)
    const cmd = rigAt({ time: 0 }, true)
    const hand = cmd.bones.foreL!.getWorldPosition(new Vector3())
    expect(hand.z).toBeLessThan(cmd.bones.chest!.getWorldPosition(v).z)
  })

  it('wary, it lowers itself and brings the rifle to the ready; startled, it rears back', () => {
    const calm = rigAt({ time: 2 })
    const wary = rigAt({ time: 2, caution: 1 })
    expect(wary.bones.head!.getWorldPosition(new Vector3()).y).toBeLessThan(calm.bones.head!.getWorldPosition(v).y - 0.03)
    // The rifle bone is in the hand: it comes forward, to the ready.
    expect(wary.bones.rifle!.getWorldPosition(new Vector3()).z).toBeGreaterThan(calm.bones.rifle!.getWorldPosition(v).z + 0.15)
    const jump = rigAt({ time: 2, startle: 1 })
    expect(jump.bones.head!.getWorldPosition(new Vector3()).z).toBeLessThan(calm.bones.head!.getWorldPosition(v).z - 0.03)
  })
})
