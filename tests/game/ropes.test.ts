import { describe, expect, it } from 'vitest'

describe('a rope runs from edge to edge', () => {
  it('leaves the tower at its edge and reaches the platform at its edge; the mech walks flat to the edge, then down the line', async () => {
    const { cableSpan, cableY, CELL: C, heightAt: h } = await import('@/game/world/grid')
    const { FortressBuilder: FB } = await import('@/game/world/fortress')
    const b = new FB('t', 20, 6)
    b.ground(0, 0, 19, 5).insert(1, 1).extract(18, 4)
    b.fill(2, 2, 3, 3, 4).fill(10, 2, 11, 3, 2)
    const f = b.build()
    const c = { ax: 3, az: 2, bx: 10, bz: 2 }
    const s = cableSpan(f.grid, c)
    const ax = (3 + 0.5) * C
    const bx = (10 + 0.5) * C
    const ex = ax + (bx - ax) * s.ta
    const fx = ax + (bx - ax) * s.tb
    expect(ex).toBeCloseTo(4 * C, 0)
    expect(fx).toBeCloseTo(10 * C, 0)
    expect(h(f.grid, ex - 0.1, 5)).toBe(4)
    expect(h(f.grid, fx + 0.1, 5)).toBe(2)
    expect(cableY(4, 2, s, s.ta / 2)).toBe(4)
    expect(cableY(4, 2, s, (s.ta + s.tb) / 2)).toBeCloseTo(3, 5)
    expect(cableY(4, 2, s, 1)).toBe(2)
  })
})

describe('a rope up to another platform (jam build)', () => {
  it('from a raised edge to a higher platform edge within 10 m, aimed at its top or just under its lip; not farther, not from the ground', async () => {
    const { findRopeShot, ROPE_UP_RANGE } = await import('@/game/sim/ropes')
    const { FortressBuilder: FB } = await import('@/game/world/fortress')
    const b = new FB('t', 30, 10)
    b.ground(0, 0, 29, 9).insert(1, 1).extract(28, 8)
    b.fill(2, 3, 4, 6, 4).fill(8, 3, 9, 6, 7).fill(20, 3, 21, 6, 7)
    const g = b.build().grid
    // On the 4 m block's east edge (x 9.5), the 7 m block's top at x 16-20.
    const top = findRopeShot(g, 9.5, 4, 9, 16.5, 7, 9, 1)
    expect(top).not.toBeNull()
    expect(top!.by).toBe(7)
    // Its face (x = 16, facing -x), half a metre under the lip.
    expect(findRopeShot(g, 9.5, 4, 9, 16, 6.5, 9, 0, -1, 0)).not.toBeNull()
    // Too far up the line: the block at x 40 is over 10 m away.
    expect(findRopeShot(g, 9.5, 4, 9, 40.5, 7, 9, 1)).toBeNull()
    expect(ROPE_UP_RANGE).toBe(10)
    // From the ground: no edge to stand on.
    expect(findRopeShot(g, 13, 0, 9, 16.5, 7, 9, 1)).toBeNull()
  })
})
