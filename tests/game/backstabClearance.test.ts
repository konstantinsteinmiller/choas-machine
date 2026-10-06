// #172: in every backstab the mech stands behind its guard, not inside him.
// Measured on the posed rigs over each variant's whole hold (`helpers/
// bodyOverlap.ts`: the guard's body as a box round each bone's parts, a
// conservative stand-in for its rounded shapes). Before #172 the mech's chest
// and head were 20 cm deep in the guard's head and back in all three. The
// hands, the blade arm's forearm and the blade itself touch him by design.

import { describe, expect, it } from 'vitest'
import { BACKSTAB_VARIANTS, VARIANTS } from '@/game/sim/backstab'
import { buildMech, restPose } from '@/game/models/mech'
import { buildGuard, poseGuard, restGuardPose } from '@/game/models/garrison'
import { poseBackstabGuard, poseBackstabMech } from '@/game/sim/backstabStage'
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
