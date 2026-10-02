// The height grid (`world/grid.ts`): where a body may stand and step, what a
// ray hits, whether two points see each other, and how a patrol finds its way.

import { describe, expect, it } from 'vitest'
import {
  CELL, VOID, STEP_UP, makeGrid, cellHeight, heightAt, canStep, moveCircle, raycast, hasLineOfSight,
  findPath, smoothPath, walkLine, cellMid, toCell, type Grid, type MoveRule
} from '@/game/world/grid'

/** A w×d island at height 0. */
const flat = (w: number, d: number): Grid => {
  const g = makeGrid(w, d)
  g.h.fill(0)
  return g
}
const set = (g: Grid, cx: number, cz: number, h: number): void => { g.h[cz * g.w + cx] = h }
const DROP: MoveRule = { up: STEP_UP, down: 20 }

describe('cells and heights', () => {
  it('a new grid is all void, and so is everything outside it', () => {
    const g = makeGrid(4, 4)
    expect(cellHeight(g, 1, 1)).toBe(VOID)
    expect(cellHeight(g, -1, 0)).toBe(VOID)
    expect(cellHeight(g, 4, 0)).toBe(VOID)
    expect(heightAt(g, -0.01, 3)).toBe(VOID)
  })

  it('maps world positions to cells of CELL metres', () => {
    expect(toCell(0)).toBe(0)
    expect(toCell(CELL - 0.001)).toBe(0)
    expect(toCell(CELL)).toBe(1)
    expect(toCell(-0.001)).toBe(-1)
    expect(cellMid(3)).toBe(3.5 * CELL)
  })
})

describe('stepping', () => {
  it('walks up a kerb and down a kerb, not up a wall, not into the void', () => {
    expect(canStep(0, 0.5)).toBe(true)
    expect(canStep(0.5, 0)).toBe(true)
    expect(canStep(0, 1.2)).toBe(false)
    expect(canStep(0, VOID)).toBe(false)
    expect(canStep(4, 0)).toBe(false)
  })

  it('the mech may drop off a ledge a patrol may not', () => {
    expect(canStep(8, 0, DROP)).toBe(true)
    expect(canStep(0, 8, DROP)).toBe(false)
    expect(canStep(8, VOID, DROP)).toBe(false)
  })
})

describe('moving a body', () => {
  it('moves freely over open ground', () => {
    const g = flat(8, 8)
    const p = moveCircle(g, 5, 5, 0, 0.3, -0.2, 0.4)
    expect(p.x).toBeCloseTo(5.3)
    expect(p.z).toBeCloseTo(4.8)
  })

  it('stops at a wall and keeps its radius clear of it', () => {
    const g = flat(8, 8)
    set(g, 4, 2, 4) // a wall cell spanning x 8..10, z 4..6
    const p = moveCircle(g, 7.5, 5, 0, 1, 0, 0.4)
    expect(p.x).toBeCloseTo(8 - 0.4)
    expect(p.z).toBeCloseTo(5)
  })

  it('slides along a wall instead of sticking to it', () => {
    const g = flat(8, 8)
    for (let cz = 0; cz < 8; cz++) set(g, 4, cz, 4)
    const p = moveCircle(g, 7.6, 5, 0, 0.5, 0.5, 0.4)
    expect(p.x).toBeCloseTo(7.6)
    expect(p.z).toBeCloseTo(5.5)
  })

  it('never walks off the island', () => {
    const g = flat(4, 4)
    const p = moveCircle(g, 7.5, 3, 0, 2, 0, 0.4)
    expect(p.x).toBeCloseTo(8 - 0.4)
  })

  it('rounds a corner rather than catching on it', () => {
    const g = flat(8, 8)
    set(g, 4, 4, 4) // block at x 8..10, z 8..10
    // Just past the block's corner, moving diagonally toward it.
    const p = moveCircle(g, 7.8, 7.8, 0, 0.3, 0.1, 0.4)
    const cornerDist = Math.hypot(p.x - 8, p.z - 8)
    expect(cornerDist).toBeGreaterThanOrEqual(0.4 - 1e-6)
    expect(p.z).toBeLessThan(7.9)
  })

  it('takes a step it may take and stays out of one it may not', () => {
    const g = flat(8, 8)
    set(g, 4, 2, 0.5)
    set(g, 4, 3, 1.4)
    expect(moveCircle(g, 7.5, 5, 0, 1, 0, 0.4).x).toBeCloseTo(8.5)
    expect(moveCircle(g, 7.5, 7, 0, 1, 0, 0.4).x).toBeCloseTo(7.6)
  })

  it('a body pushed inside a block is put back outside', () => {
    const g = flat(8, 8)
    set(g, 4, 2, 4)
    const p = moveCircle(g, 9, 5, 0, 0, 0, 0.4)
    const insideX = p.x > 8 - 0.4 + 1e-6 && p.x < 10 + 0.4 - 1e-6
    const insideZ = p.z > 4 - 0.4 + 1e-6 && p.z < 6 + 0.4 - 1e-6
    expect(insideX && insideZ).toBe(false)
  })
})

describe('rays', () => {
  it('a level ray over open ground hits nothing', () => {
    const g = flat(16, 16)
    const r = raycast(g, 2, 1.5, 5, 1, 0, 0, 20)
    expect(r.hit).toBe(false)
    expect(r.t).toBe(20)
  })

  it('hits the face of a wall, with the normal toward the shooter', () => {
    const g = flat(16, 16)
    set(g, 6, 2, 4) // x 12..14
    const r = raycast(g, 2, 1.5, 5, 1, 0, 0, 40)
    expect(r.hit).toBe(true)
    expect(r.t).toBeCloseTo(10)
    expect([r.nx, r.ny, r.nz]).toEqual([-1, 0, 0])
    const back = raycast(g, 20, 1.5, 5, -1, 0, 0, 40)
    expect(back.t).toBeCloseTo(6)
    expect([back.nx, back.ny, back.nz]).toEqual([1, 0, 0])
  })

  it('passes over a wall it clears', () => {
    const g = flat(16, 16)
    set(g, 6, 2, 1.2)
    expect(raycast(g, 2, 1.5, 5, 1, 0, 0, 30).hit).toBe(false)
  })

  it('a downward ray hits the ground where it reaches it', () => {
    const g = flat(16, 16)
    const d = Math.SQRT1_2
    const r = raycast(g, 2, 3, 5, d, -d, 0, 40)
    expect(r.hit).toBe(true)
    expect(r.t).toBeCloseTo(3 * Math.SQRT2)
    expect(r.ny).toBe(1)
  })

  it('a downward ray lands on a roof before the ground behind it', () => {
    const g = flat(16, 16)
    set(g, 3, 2, 2) // x 6..8, top at 2
    const len = Math.hypot(1, -0.5)
    const r = raycast(g, 2, 5, 5, 1 / len, -0.5 / len, 0, 40)
    // Reaches y = 2 at x = 8: just past the roof, so it goes on to the ground.
    expect(r.t).toBeCloseTo(10 * len)
    const steeper = Math.hypot(1, -0.7)
    const r2 = raycast(g, 2, 5, 5, 1 / steeper, -0.7 / steeper, 0, 40)
    // Reaches y = 2 at x ≈ 6.29: on the roof.
    expect(r2.ny).toBe(1)
    expect(2 + (r2.t / steeper)).toBeCloseTo(2 + 3 / 0.7)
  })

  it('flies off the island into the void without hitting anything', () => {
    const g = flat(4, 4)
    expect(raycast(g, 4, 1, 4, 1, 0, 0, 500).hit).toBe(false)
    const d = Math.SQRT1_2
    expect(raycast(g, 7, 1, 4, d, -d, 0, 500).hit).toBe(false)
  })

  it('a ray along a cell boundary, and one straight down, do not hang', () => {
    const g = flat(8, 8)
    expect(raycast(g, 4, 1, 4, 0, 0, 1, 100).hit).toBe(false)
    const down = raycast(g, 5, 3, 5, 0, -1, 0, 100)
    expect(down.hit).toBe(true)
    expect(down.t).toBeCloseTo(3)
  })
})

describe('line of sight', () => {
  const eye = 1.6
  it('sees across open ground and not through a wall', () => {
    const g = flat(16, 16)
    expect(hasLineOfSight(g, 3, eye, 5, 21, eye, 5)).toBe(true)
    set(g, 6, 2, 4)
    expect(hasLineOfSight(g, 3, eye, 5, 21, eye, 5)).toBe(false)
  })

  it('low cover hides a crouched mech and not a standing one', () => {
    const g = flat(16, 16)
    set(g, 6, 2, 1.4) // cover block x 12..14
    // The mech is right behind the block; the guard is 12 m away.
    expect(hasLineOfSight(g, 3, eye, 5, 15, 2.1, 5)).toBe(true)  // standing head
    expect(hasLineOfSight(g, 3, eye, 5, 15, 1.0, 5)).toBe(false) // crouched head
  })

  it('a sentry on a tower sees over cover that hides the mech from the ground', () => {
    const g = flat(16, 16)
    set(g, 6, 2, 1.4)
    set(g, 1, 2, 8) // the tower under the sentry
    expect(hasLineOfSight(g, 3, 8 + eye, 5, 16.5, 1.0, 5)).toBe(true)
  })

  it('is symmetric', () => {
    const g = flat(16, 16)
    set(g, 6, 2, 1.4)
    for (const head of [1.0, 2.1]) {
      expect(hasLineOfSight(g, 15, head, 5, 3, eye, 5)).toBe(hasLineOfSight(g, 3, eye, 5, 15, head, 5))
    }
  })
})

describe('paths', () => {
  it('goes straight across open ground', () => {
    const g = flat(8, 8)
    const path = findPath(g, 0, 0, 5, 5)
    expect(path[0]).toEqual({ cx: 0, cz: 0 })
    expect(path[path.length - 1]).toEqual({ cx: 5, cz: 5 })
    expect(path).toHaveLength(6)
  })

  it('walks round a wall', () => {
    const g = flat(9, 9)
    for (let cz = 0; cz < 8; cz++) set(g, 4, cz, 4)
    const path = findPath(g, 1, 1, 7, 1)
    expect(path.length).toBeGreaterThan(7)
    expect(path.every(c => cellHeight(g, c.cx, c.cz) === 0)).toBe(true)
    expect(path.some(c => c.cz === 8)).toBe(true)
  })

  it('does not cut the corner of a wall', () => {
    const g = flat(4, 4)
    set(g, 1, 1, 4)
    const path = findPath(g, 0, 1, 1, 0)
    // (0,1) → (1,0) is a diagonal past the wall cell's corner: not allowed.
    expect(path).toHaveLength(3)
  })

  it('climbs a stair and refuses a wall with no stair', () => {
    const g = flat(10, 4)
    for (let i = 0; i < 4; i++) set(g, 2 + i, 1, 0.5 * (i + 1)) // treads up to 2
    set(g, 6, 1, 2)
    expect(findPath(g, 0, 1, 6, 1).length).toBeGreaterThan(0)
    const h = flat(10, 4)
    set(h, 6, 1, 2)
    expect(findPath(h, 0, 1, 6, 1)).toEqual([])
  })

  it('returns nothing for a goal in the void or off the grid', () => {
    const g = flat(4, 4)
    set(g, 3, 3, VOID)
    expect(findPath(g, 0, 0, 3, 3)).toEqual([])
    expect(findPath(g, 0, 0, 9, 9)).toEqual([])
  })

  it('a path with no moves is the start cell', () => {
    expect(findPath(flat(4, 4), 2, 2, 2, 2)).toEqual([{ cx: 2, cz: 2 }])
  })
})

describe('steering points', () => {
  it('a straight walk is one segment', () => {
    const g = flat(12, 12)
    const pts = smoothPath(g, findPath(g, 0, 0, 9, 4))
    expect(pts).toHaveLength(2)
  })

  it('keeps the corner a wall forces', () => {
    const g = flat(9, 9)
    for (let cz = 0; cz < 8; cz++) set(g, 4, cz, 4)
    const pts = smoothPath(g, findPath(g, 1, 1, 7, 1))
    expect(pts.length).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < pts.length; i++) {
      expect(walkLine(g, pts[i - 1]!.x, pts[i - 1]!.z, pts[i]!.x, pts[i]!.z)).toBe(true)
    }
  })

  it('walkLine refuses a line across a wall or the void', () => {
    const g = flat(8, 8)
    set(g, 4, 2, 4)
    expect(walkLine(g, 1, 5, 15, 5)).toBe(false)
    expect(walkLine(g, 1, 1, 15, 1)).toBe(true)
    expect(walkLine(g, 1, 1, 30, 1)).toBe(false)
  })
})
