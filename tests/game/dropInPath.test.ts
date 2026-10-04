// #105: the board's way in to the perch flies through nothing solid, at every
// landing spot the game has (the straight-from-behind line went through the
// training ground's wall).

import { describe, expect, it } from 'vitest'
import type { Fortress } from '@/game/world/fortress'
import { hasLineOfSight, heightAt } from '@/game/world/grid'
import { RIDER_JUMP, RIDER_LAND, findApproach, introFrame, makeDogFrame, makeRiderFrame } from '@/game/sim/robodog'
import { buildBastion } from '@/game/data/fortresses/bastion'
import { buildFoundry } from '@/game/data/fortresses/foundry'
import { buildHarbour } from '@/game/data/fortresses/harbour'
import { buildTrainingGround } from '@/game/data/fortresses/training'
import { buildProvingGround } from '@/game/data/fortresses/proving'

const blocked = (f: Fortress, approach: number, high: number, reach = 1): number => {
  const g = f.grid
  const py = heightAt(g, f.insert.x, f.insert.z)
  const dog = makeDogFrame()
  const rider = makeRiderFrame()
  let n = 0
  let last: [number, number, number] | null = null
  for (let i = 0; i <= 120; i++) {
    const k = i / 120
    introFrame(dog, rider, k, f.insert.x, py, f.insert.z, f.insert.facing, approach, high, reach)
    if (last && dog.visible && !(k > RIDER_JUMP - 0.02 && k < RIDER_LAND + 0.04)) {
      for (const up of [0.2, 2.4]) if (!hasLineOfSight(g, last[0], last[1] + up, last[2], dog.x, dog.y + up, dog.z)) n++
    }
    last = [dog.x, dog.y, dog.z]
  }
  return n
}

describe('the drop-in flies through nothing solid (#105)', () => {
  const cases: Array<[string, () => Fortress]> = [
    ['the training ground', buildTrainingGround],
    ['the proving ground', buildProvingGround],
    ...[1, 2, 3, 4, 5].map(l => [`the Bastion at threat ${l}`, () => buildBastion(l)] as [string, () => Fortress]),
    ['the first raid\'s opening landing', () => buildBastion(1, 0, undefined, true)],
    ['the Foundry', () => buildFoundry(1)],
    ['the Harbour', () => buildHarbour(1)]
  ]
  for (const [name, build] of cases) {
    it(name, () => {
      const f = build()
      const py = heightAt(f.grid, f.insert.x, f.insert.z)
      const a = findApproach(f.grid, f.insert.x, py, f.insert.z, f.insert.facing)
      expect(blocked(f, a.approach, a.high, a.reach)).toBe(0)
    })
  }

  it('the old straight-from-behind line did hit the training ground\'s wall', () => {
    const f = buildTrainingGround()
    expect(blocked(f, f.insert.facing, 14)).toBeGreaterThan(0)
  })
})
