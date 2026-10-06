// Round 5 (#148): feet that stay planted. A person's gait phase used to
// advance at one fixed rate per metre, so a patrol's feet skated forward under
// it and a runner's legs spun. Now the stride lengthens with the pace; this
// measures, over a whole cycle, how far the foot that carries the weight slides
// along the ground per metre the body covers.

import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { buildGuard, poseGuard, restGuardPose } from '@/game/models/garrison'
import { guardGaitRate, mechGaitRate } from '@/game/sim/gait'
import { SPECS } from '@/game/sim/garrison'
import { buildMech, poseMech, restPose } from '@/game/models/mech'

const rig = buildGuard()
const foot = new Vector3()

/** Share of the body's travel the planted foot slips by, at `speed01`. */
export const slip = (speed01: number, rate = guardGaitRate(speed01)): number => {
  const steps = 240
  const dPhase = (Math.PI * 2) / steps
  const dBody = dPhase / rate
  let prev: Array<{ y: number; z: number }> | null = null
  let slid = 0
  let travel = 0
  for (let i = 0; i <= steps; i++) {
    const s = { ...restGuardPose(), time: 0, stride: i * dPhase, speed: speed01 }
    poseGuard(rig, s)
    rig.root.updateMatrixWorld(true)
    // The body walks forward along +z: a foot's place in the world is its place on the rig plus the walk.
    const feet = (['footL', 'footR'] as const).map(b => {
      rig.bones[b]!.getWorldPosition(foot)
      return { y: foot.y, z: foot.z + i * dBody }
    })
    if (prev) {
      // The foot that carries the weight: the left while its phase is past the
      // top of its swing (cos < 0), the right half a cycle later.
      const k = Math.cos(i * dPhase) < 0 ? 0 : 1
      slid += Math.abs(feet[k]!.z - prev[k]!.z)
      travel += dBody
    }
    prev = feet
  }
  return travel > 0 ? slid / travel : 1
}

const mech = buildMech()
/** The same for CM-07: walking, sprinting (`sprint` 1) or sneaking (`crouch` 1), at `rate` radians a metre. */
export const mechSlip = (rate: number, sprint = 0, crouch = 0): number => {
  const steps = 240
  const dPhase = (Math.PI * 2) / steps
  const dBody = dPhase / rate
  let prev: number[] | null = null
  let slid = 0
  let travel = 0
  for (let i = 0; i <= steps; i++) {
    poseMech(mech, { ...restPose(), stride: i * dPhase, speed: 1, sprint, crouch })
    mech.root.updateMatrixWorld(true)
    const feet = (['footL', 'footR'] as const).map(b => mech.bones[b]!.getWorldPosition(foot).z + i * dBody)
    if (prev) {
      const k = Math.cos(i * dPhase) < 0 ? 0 : 1
      slid += Math.abs(feet[k]! - prev[k]!)
      travel += dBody
    }
    prev = feet
  }
  return slid / travel
}

describe('feet stay planted (#148)', () => {
  it('a patrol walking: the foot on the floor slides less than a seventh of the ground covered', () => {
    expect(slip(1.5 / SPECS.guard.run)).toBeLessThan(0.14)
  })
  it('a run: its stride is longer, and the planted foot holds as well', () => {
    expect(slip(0.7)).toBeLessThan(0.14)
    expect(slip(1)).toBeLessThan(0.14)
  })
  it('CM-07 walking and sprinting: the foot on the floor holds too', () => {
    expect(mechSlip(mechGaitRate(0, 0))).toBeLessThan(0.15)
    expect(mechSlip(mechGaitRate(1, 0), 1)).toBeLessThan(0.2)
    // (Its old rate, 2.3 rad a metre, slid the foot four tenths of the way.)
    expect(mechSlip(2.3)).toBeGreaterThan(0.35)
  })
  it('(the old fixed rate, 3.4 rad a metre, slid the foot half the way)', () => {
    expect(slip(1.5 / SPECS.guard.run, 3.4)).toBeGreaterThan(0.4)
  })
  it('the cycle lengthens with pace', () => {
    expect(guardGaitRate(1)).toBeLessThan(guardGaitRate(0.4))
  })
})
