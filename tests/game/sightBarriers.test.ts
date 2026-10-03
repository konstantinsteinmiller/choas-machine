// #56 (R16b): nothing sees the mech through what blocks sight: walls, cover,
// props; nor does a light pool reach round a wall.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid, cellHeight, cellKind, CellKind } from '@/game/world/grid'
import { makeGarrison, stepGarrison, drainEvents, spotCentre, type Target } from '@/game/sim/garrison'
import { buildBastion } from '@/game/data/fortresses/bastion'

const DT = 1 / 30

describe('a wall stops sight', () => {
  it('a guard facing a wall does not see the mech standing behind it', () => {
    const b = new FortressBuilder('t', 32, 32)
    b.ground(0, 0, 31, 31).insert(1, 1).extract(30, 30)
    b.wall(4, 14, 28, 14)
    b.guard([[16, 10]], 0)
    const f = b.build()
    const gar = makeGarrison(f, 1)
    const t: Target = { x: cellMid(16), y: 0, z: cellMid(16), height: 2.6, crouched: false, visible: true }
    for (let i = 0; i < 6 / DT; i++) { stepGarrison(gar, f.grid, t, DT); drainEvents(gar) }
    expect(gar.units[0]!.detect).toBe(0)
  })

  it('a drone\'s light pool does not reach round a wall, though the drone flies high above it', () => {
    const b = new FortressBuilder('t', 32, 32)
    b.ground(0, 0, 31, 31).insert(1, 1).extract(30, 30)
    b.wall(4, 16, 28, 16)
    b.drone([[16, 13.6], [16, 13.7]], 9)
    const f = b.build()
    const gar = makeGarrison(f, 1)
    const d = gar.units[0]!
    const c = spotCentre(d)
    // Within the pool's radius of its centre, but on the far side of the wall.
    const t: Target = { x: c.x, y: 0, z: cellMid(17) + 0.4, height: 2.6, crouched: false, visible: true }
    expect(Math.hypot(t.x - c.x, t.z - c.z)).toBeLessThan(4.5)
    for (let i = 0; i < 6 / DT; i++) {
      stepGarrison(gar, f.grid, t, DT)
      drainEvents(gar)
      d.x = cellMid(16); d.z = 13.6 * 2 + 1; d.yaw = 0
    }
    expect(gar.units[0]!.detect).toBe(0)
  })
})

describe('props a player hides behind block sight', () => {
  it('barrels, tyre stacks, pipe stacks and crate stacks stand in the grid', () => {
    const f = buildBastion(1)
    const spots = f.decor.filter(d => ['barrel', 'tires', 'pipes', 'stack'].includes(d.kind))
    expect(spots.length).toBeGreaterThan(10)
    for (const d of spots) {
      const cx = Math.floor(d.x / 2)
      const cz = Math.floor(d.z / 2)
      expect(cellKind(f.grid, cx, cz)).toBe(CellKind.Cover)
      expect(cellHeight(f.grid, cx, cz)).toBeGreaterThan(d.y + 0.5)
    }
  })
})
