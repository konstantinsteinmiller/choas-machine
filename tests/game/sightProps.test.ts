// #69: nothing sees, shoots or blasts through what blocks it. Tall props
// (a crane's mast and boom, lamp posts, vent stacks) stop rounds and sight
// above the cell they stand on; a rocket's blast stops at a wall.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { CELL, hasLineOfSight, raycast } from '@/game/world/grid'
import { makeGarrison } from '@/game/sim/garrison'
import { blast } from '@/game/sim/damage'

const yard = (): FortressBuilder => {
  const b = new FortressBuilder('t', 30, 30)
  b.ground(0, 0, 29, 29).insert(1, 1).extract(28, 28)
  return b
}

describe('tall props block (#69)', () => {
  it('a crane: its mast and its boom stop a line far above its collision block', () => {
    const f = yard().solid('crane', 15, 15, 2.4, 0).build()
    const x = 15 * CELL + 1
    const z = 15 * CELL + 1
    // Through the mast at 6 m.
    expect(hasLineOfSight(f.grid, x - 8, 6, z, x + 8, 6, z)).toBe(false)
    // Through the boom at 10.5 m, 6 m out along +z.
    expect(hasLineOfSight(f.grid, x - 8, 10.5, z + 6, x + 8, 10.5, z + 6)).toBe(false)
    // Over it all: clear.
    expect(hasLineOfSight(f.grid, x - 8, 12, z, x + 8, 12, z)).toBe(true)
    const hit = raycast(f.grid, x - 8, 6, z, 1, 0, 0, 16)
    expect(hit.hit).toBe(true)
    expect(hit.nx).toBe(-1)
    expect(hit.t).toBeCloseTo(8 - 0.6, 3)
  })

  it('a lamp post and a vent stack stop a round above the cell', () => {
    const f = yard().prop('lamp', 10, 10).solid('stack', 20, 20, 1.4).build()
    expect(hasLineOfSight(f.grid, 10 * CELL + 1 - 5, 2.5, 10 * CELL + 1, 10 * CELL + 1 + 5, 2.5, 10 * CELL + 1)).toBe(false)
    expect(hasLineOfSight(f.grid, 20 * CELL + 1 - 5, 3.5, 20 * CELL + 1, 20 * CELL + 1 + 5, 3.5, 20 * CELL + 1)).toBe(false)
  })
})

describe('a blast stops at a wall (#69)', () => {
  it('the guard behind the wall takes nothing; the one in the open is hurt', () => {
    const b = yard()
    b.wall(14, 5, 14, 25, 5)
    b.guard([[16, 15]], 0).guard([[12, 16]], 0)
    const f = b.build()
    const gar = makeGarrison(f, 1)
    const [behind, open] = gar.units
    const hp = [behind!.hp, open!.hp]
    // Just west of the wall, at the foot of it.
    blast(gar, f.grid, 13 * CELL + 1, 0.5, 15 * CELL + 1, -1, 5.5)
    expect(behind!.hp).toBe(hp[0])
    expect(open!.hp).toBeLessThan(hp[1]!)
  })
})
