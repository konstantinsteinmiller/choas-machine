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
