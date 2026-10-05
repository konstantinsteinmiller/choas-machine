// No rope or cable passes through a wall (jam build): every one, drawn edge to edge at foot height.
import { describe, expect, it } from 'vitest'
import { buildBastion } from '@/game/data/fortresses/bastion'
import { buildFoundry } from '@/game/data/fortresses/foundry'
import { buildHarbour } from '@/game/data/fortresses/harbour'
import { buildTrainingGround } from '@/game/data/fortresses/training'
import { cableSpan, cellHeight, cellMid, hasLineOfSight } from '@/game/world/grid'
import type { Fortress } from '@/game/world/fortress'

const FORTS: Array<[string, () => Fortress]> = [
  ...[1, 2, 3, 4].map(l => [`the Bastion at threat ${l}`, () => buildBastion(l)] as [string, () => Fortress]),
  ['the Foundry', () => buildFoundry(1)], ['the Harbour', () => buildHarbour(1)], ['the training ground', buildTrainingGround]
]

describe('no cable passes through anything solid', () => {
  for (const [name, build] of FORTS) {
    it(name, () => {
      const g = build().grid
      const bad: string[] = []
      for (const c of g.cables) {
        const s = cableSpan(g, c)
        const ax = cellMid(c.ax), az = cellMid(c.az), bx = cellMid(c.bx), bz = cellMid(c.bz)
        const ay = cellHeight(g, c.ax, c.az), by = cellHeight(g, c.bx, c.bz)
        const ex = ax + (bx - ax) * s.ta, ez = az + (bz - az) * s.ta
        const fx = ax + (bx - ax) * s.tb, fz = az + (bz - az) * s.tb
        // The line itself, and a body walking it (to the height of its head).
        for (const up of [0.1, 1.2, 2.2]) {
          if (!hasLineOfSight(g, ex, ay + up, ez, fx, by + up, fz)) { bad.push(`${c.ax},${c.az} → ${c.bx},${c.bz} at +${up} m`); break }
        }
      }
      expect(bad).toEqual([])
    })
  }
})
