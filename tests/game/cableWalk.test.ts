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

describe('off the rope (jam build)', () => {
  it('Space on a rope drops the mech: to the side the keys lean to, or straight down', async () => {
    const { makePlayer, stepPlayer } = await import('@/game/sim/player')
    const { FortressBuilder } = await import('@/game/world/fortress')
    const b = new FortressBuilder('t', 30, 10)
    b.ground(0, 0, 29, 9).insert(1, 1).extract(28, 8)
    b.fill(2, 4, 3, 5, 6).fill(20, 4, 21, 5, 6).cable(3, 4, 20, 4)
    const g = b.build().grid
    const onRope = (): ReturnType<typeof makePlayer> => {
      const p = makePlayer(20, 6, 9)
      p.mode = 'cable'
      p.cable = g.cables[0]!
      p.cableT = 0.5
      return p
    }
    // The cable runs along +x; +z is to its side.
    const left = onRope()
    stepPlayer(left, g, { mx: 0, mz: 1, crouch: false, aiming: false, aimYaw: 0, jump: true }, 1 / 60)
    expect(left.mode).toBe('air')
    expect(Math.abs(left.vz)).toBeGreaterThan(3)
    expect(left.vy).toBeGreaterThan(0)
    const down = onRope()
    stepPlayer(down, g, { mx: 1, mz: 0, crouch: false, aiming: false, aimYaw: 0, jump: true }, 1 / 60)
    expect(down.mode).toBe('air')
    expect(Math.hypot(down.vx, down.vz)).toBeLessThan(0.5)
    // It lands below.
    for (let i = 0; i < 240 && down.mode === 'air'; i++) stepPlayer(down, g, { mx: 0, mz: 0, crouch: false, aiming: false, aimYaw: 0 }, 1 / 60)
    expect(down.mode).toBe('ground')
    expect(down.y).toBeLessThan(0.5)
  })
})
