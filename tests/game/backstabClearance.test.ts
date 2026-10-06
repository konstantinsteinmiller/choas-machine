// #172: in every backstab the mech stands behind its guard, not inside him.
// Measured on the posed rigs over each variant's whole hold (`helpers/
// bodyOverlap.ts`: the guard's body as a box round each bone's parts, a
// conservative stand-in for its rounded shapes). Before #172 the mech's chest
// and head were 20 cm deep in the guard's head and back in all three. The
// hands, the blade arm's forearm and the blade itself touch him by design.

import { describe, expect, it } from 'vitest'
import { BACKSTAB_VARIANTS, VARIANTS } from '@/game/sim/backstab'
import { buildMech, poseMech, restPose } from '@/game/models/mech'
import { buildGuard, poseGuard, restGuardPose } from '@/game/models/garrison'
import { poseBackstabGuard, poseBackstabMech, stagePin } from '@/game/sim/backstabStage'
import { boneBoxes, overlapDepth } from '../helpers/bodyOverlap'

const G = { x: 3, y: 0, z: -2, yaw: 0.7 }
const HANDS = ['foreL', 'foreR', 'blade', 'sniper', 'minigun', 'minigunBarrels', 'rocket']

const worst = (variant: (typeof BACKSTAB_VARIANTS)[number], skip: readonly string[]): number => {
  const mech = buildMech()
  const guard = buildGuard()
  const boxes = boneBoxes(guard)
  let deepest = 0
  for (let t = 0; t <= VARIANTS[variant].release; t += 0.05) {
    poseBackstabMech(mech, { ...restPose(), weapon: 'sniper' }, variant, t, G.x, G.y, G.z, G.yaw)
    const g = restGuardPose()
    const yaw = poseBackstabGuard(g, variant, t, G.yaw)
    poseGuard(guard, g)
    guard.root.position.set(G.x, G.y, G.z)
    guard.root.rotation.set(0, yaw, 0)
    deepest = Math.max(deepest, overlapDepth(mech, guard, { skip, boxes }).depth)
  }
  return deepest
}

describe('the backstab keeps the two bodies apart (#172)', () => {
  for (const v of BACKSTAB_VARIANTS) {
    it(`${v}: the mech's body (not its hands or blade) at most touches the guard`, () => {
      expect(worst(v, [...HANDS, 'shoulderL'])).toBeLessThan(0.06)
    })
    it(`${v}: the arm holding him wraps round him, it does not pass through`, () => {
      expect(worst(v, HANDS)).toBeLessThan(0.1)
    })
  }

  it('each kill has its beat before the blow: the hand closes, then the swing comes a moment later', () => {
    for (const v of BACKSTAB_VARIANTS) {
      const d = VARIANTS[v]
      expect(d.hits[0]!.t - d.grabAt, v).toBeGreaterThan(0.4)
    }
  })
})

// #174: the arms. The blade arm is posed on the stab's line (a punch along the
// forearm, the elbow out), never swung across the chest: its forearm and blade
// stay out of the mech's own torso and head, its upper arm and forearm out of
// the guard (only the blade goes in), and the free arm out of the mech's own
// body. Against the arms' own overlap with the torso's boxes at rest (the boxes
// are a rounded body's corners). And the body is not dragged by the blade: the
// arm reaches its mark itself.
describe('the arms in a backstab (#174)', () => {
  const TORSO = ['chest', 'spine', 'hips', 'head']
  const atRest = (() => {
    const m = buildMech()
    poseMech(m, { ...restPose(), weapon: 'sniper' })
    m.root.updateMatrixWorld(true)
    const b = boneBoxes(m)
    return { r: overlapDepth(m, m, { only: ['foreR', 'blade'], boxes: b, boxBones: TORSO }).depth, l: overlapDepth(m, m, { only: ['foreL'], boxes: b, boxBones: TORSO }).depth }
  })()
  for (const v of BACKSTAB_VARIANTS) {
    it(`${v}: the blade arm stays out of the mech's own body and out of the guard, and the free arm out of the mech`, () => {
      const mech = buildMech()
      const guard = buildGuard()
      const gb = boneBoxes(guard)
      const mb = boneBoxes(mech)
      const worst = { r: 0, l: 0, rIn: 0, pin: 0 }
      for (let t = 0; t <= VARIANTS[v].release; t += 0.05) {
        poseBackstabMech(mech, { ...restPose(), weapon: 'sniper' }, v, t, G.x, G.y, G.z, G.yaw)
        worst.pin = Math.max(worst.pin, Math.hypot(stagePin.x, stagePin.y, stagePin.z))
        const g = restGuardPose()
        const yaw = poseBackstabGuard(g, v, t, G.yaw)
        poseGuard(guard, g)
        guard.root.position.set(G.x, G.y, G.z)
        guard.root.rotation.set(0, yaw, 0)
        worst.r = Math.max(worst.r, overlapDepth(mech, mech, { only: ['foreR', 'blade'], boxes: mb, boxBones: TORSO }).depth)
        worst.l = Math.max(worst.l, overlapDepth(mech, mech, { only: ['foreL'], boxes: mb, boxBones: TORSO }).depth)
        worst.rIn = Math.max(worst.rIn, overlapDepth(mech, guard, { only: ['shoulderR', 'foreR'], boxes: gb }).depth)
      }
      expect(worst.r - atRest.r, 'blade arm in its own body').toBeLessThan(0.02)
      expect(worst.l - atRest.l, 'free arm in its own body').toBeLessThan(0.04)
      expect(worst.rIn, 'blade arm (not the blade) in the guard').toBeLessThan(0.02)
      expect(worst.pin, 'the body dragged by the blade').toBeLessThan(0.04)
    })
  }
})

