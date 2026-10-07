// A vent stack is drawn 4.8 m tall; it stood in the grid as 1.4 m of cover and
// the mech mantled onto it. Every column prop is solid to its drawn height, in
// every fortress, so nothing can climb it.

import { describe, expect, it } from 'vitest'
import { COLUMN_PROPS, type Fortress } from '@/game/world/fortress'
import { MANTLE_MAX } from '@/game/sim/player'
import { CELL, VOID, cellHeight, roofAt } from '@/game/world/grid'
import { buildBastion } from '@/game/data/fortresses/bastion'
import { buildFoundry } from '@/game/data/fortresses/foundry'
import { buildHarbour } from '@/game/data/fortresses/harbour'
import { buildSpire } from '@/game/data/fortresses/spire'
import { buildTrainingGround } from '@/game/data/fortresses/training'

const FORTS: Array<[string, () => Fortress]> = [
  ...[1, 2, 3].map(l => [`Bastion ${l}`, () => buildBastion(l)] as [string, () => Fortress]),
  ...[1, 2, 3].map(l => [`Foundry ${l}`, () => buildFoundry(l)] as [string, () => Fortress]),
  ...[1, 2, 3].map(l => [`Harbour ${l}`, () => buildHarbour(l)] as [string, () => Fortress]),
  ...[1, 2, 3].map(l => [`Spire ${l}`, () => buildSpire(l)] as [string, () => Fortress]),
  ['training', buildTrainingGround]
]

describe('column props cannot be climbed', () => {
  for (const [name, build] of FORTS) {
    it(name, () => {
      const f = build()
      let n = 0
      for (const d of f.decor) {
        const top = COLUMN_PROPS[d.kind]
        if (top === undefined) continue
        n++
        const h = cellHeight(f.grid, Math.floor(d.x / CELL), Math.floor(d.z / CELL))
        // Its full drawn height, or just under a roof over it; past any mantle either way.
        const roof = roofAt(f.grid, Math.floor(d.x / CELL), Math.floor(d.z / CELL))
        const want = roof === VOID ? top : Math.min(top, roof - d.y - 0.3)
        expect(h - d.y, `${name} ${d.kind} at ${d.x},${d.z}`).toBeGreaterThanOrEqual(want - 1e-6)
        expect(h - d.y).toBeGreaterThan(MANTLE_MAX)
      }
      if (name.startsWith('Bastion 1')) expect(n).toBeGreaterThan(0)
    })
  }
})
