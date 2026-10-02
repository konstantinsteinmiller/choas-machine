// The fortress builder and validator (`world/fortress.ts`, `world/validate.ts`)
// and the proving ground built with them.

import { describe, expect, it } from 'vitest'
import { FortressBuilder, COVER_H, WALL_H, TOWER_H, TREAD_H } from '@/game/world/fortress'
import { validateFortress } from '@/game/world/validate'
import { CELL, CellKind, VOID, STEP_UP, cellHeight, cellKind, findPath, heightAt, hasLineOfSight, toCell } from '@/game/world/grid'
import { buildProvingGround } from '@/game/data/fortresses/proving'

const small = (): FortressBuilder => new FortressBuilder('t', 16, 16).island(1, 0)

describe('the builder', () => {
  it('cuts an island out of the void', () => {
    const f = small().insert(8, 8).extract(8, 3).build()
    expect(cellHeight(f.grid, 8, 8)).toBe(0)
    expect(cellHeight(f.grid, 0, 0)).toBe(VOID)
    expect(cellHeight(f.grid, 15, 15)).toBe(VOID)
  })

  it('builds walls, towers and cover at their heights, and cuts a gate', () => {
    const b = small().wall(4, 6, 11, 6).gate(7, 6).tower(4, 9).cover(8, 9, 2)
    expect(b.heightOf(5, 6)).toBe(WALL_H)
    expect(b.heightOf(7, 6)).toBe(0)
    expect(b.heightOf(5, 10)).toBe(TOWER_H)
    expect(b.heightOf(9, 9)).toBeCloseTo(COVER_H)
    expect(cellKind(b.grid, 8, 9)).toBe(CellKind.Cover)
  })

  it('refuses a diagonal wall and anything off the grid', () => {
    expect(() => small().wall(2, 2, 5, 5)).toThrow(/one axis/)
    expect(() => small().fill(14, 14, 20, 14, 2)).toThrow(/off the grid/)
  })

  it('stairs rise a walkable tread at a time up to the wall', () => {
    const b = small().wall(10, 4, 10, 12).stairs(9, 11, 'n', WALL_H)
    const treads = Math.round(WALL_H / TREAD_H)
    for (let i = 0; i < treads; i++) {
      expect(b.heightOf(9, 11 - i)).toBeCloseTo(TREAD_H * (i + 1))
      expect(cellKind(b.grid, 9, 11 - i)).toBe(CellKind.Stair)
    }
    expect(TREAD_H).toBeLessThanOrEqual(STEP_UP)
    // A patrol can walk from the yard onto the wall by it.
    expect(findPath(b.grid, 6, 12, 10, 5).length).toBeGreaterThan(0)
  })

  it('a ladder must climb something, a cable must hang from height', () => {
    expect(() => small().ladder(5, 5, 'e')).toThrow(/climbs nothing/)
    expect(() => small().tower(4, 4).cable(4, 4, 10, 10)).toThrow(/not on a wall or tower/)
    const b = small().tower(4, 4).tower(10, 10).ladder(6, 4, 'w').cable(5, 5, 10, 10)
    expect(b.grid.ladders).toEqual([{ cx: 6, cz: 4, dx: -1, dz: 0 }])
    expect(b.grid.cables).toHaveLength(1)
  })

  it('posts stand at cell centres in world metres, with their routes', () => {
    const f = small().insert(8, 12).extract(8, 3).guard([[5, 5, 2], [9, 5]]).sentry(6, 8, 1.5).drone([[4, 4], [10, 10]], 7).build()
    const [guard, sentry, drone] = f.posts
    expect(guard).toMatchObject({ kind: 'guard', x: 5.5 * CELL, z: 5.5 * CELL })
    expect(guard!.route).toEqual([
      { x: 5.5 * CELL, z: 5.5 * CELL, wait: 2 },
      { x: 9.5 * CELL, z: 5.5 * CELL, wait: 0 }
    ])
    expect(sentry).toMatchObject({ kind: 'sentry', facing: 1.5, route: [] })
    expect(drone).toMatchObject({ kind: 'drone', altitude: 7 })
  })

  it('needs a way in and a way out', () => {
    expect(() => small().extract(8, 3).build()).toThrow(/no insertion/)
    expect(() => small().insert(8, 8).build()).toThrow(/no extraction/)
    expect(() => small().insert(0, 0)).toThrow(/off the island/)
  })
})

describe('the validator', () => {
  it('passes a sound layout', () => {
    const f = small().insert(8, 12).extract(8, 3).guard([[5, 5], [10, 5], [10, 10]]).build()
    expect(validateFortress(f)).toEqual([])
  })

  it('names a patrol whose next stop is walled off', () => {
    const f = small().wall(0, 7, 15, 7).insert(8, 12).extract(8, 10).guard([[5, 5], [5, 10]]).build()
    // The loop is broken both ways: out, and back.
    expect(validateFortress(f)).toEqual([
      'guard #0 at 5,5: no walkable way from 5,5 to 5,10',
      'guard #0 at 5,5: no walkable way from 5,10 to 5,5'
    ])
  })

  it('names a patrol stop on top of a wall with no stair', () => {
    const f = small().wall(4, 7, 11, 7).insert(8, 12).extract(8, 10).guard([[5, 5], [6, 7]]).build()
    expect(validateFortress(f).some(p => p.includes('no walkable way'))).toBe(true)
  })

  it('names an extraction the mech cannot reach, and accepts a ladder to it', () => {
    const cutOff = (): FortressBuilder => small().fill(2, 2, 13, 5, WALL_H, CellKind.Ground).insert(8, 12).extract(8, 3)
    expect(validateFortress(cutOff().build())).toEqual(['the extraction point cannot be reached from the insertion point'])
    expect(validateFortress(cutOff().ladder(8, 6, 'n').build())).toEqual([])
  })

  it('the mech may start high and drop in', () => {
    const f = small().tower(7, 11).insert(7, 11).extract(8, 3).build()
    expect(validateFortress(f)).toEqual([])
  })

  it('names a drone flying into the walls', () => {
    const f = small().insert(8, 12).extract(8, 3).drone([[4, 4], [10, 10]], 2).build()
    expect(validateFortress(f)).toEqual(['drone #2 at 4,4 flies lower than a wall'.replace('#2', '#0')])
  })
})

describe('the proving ground', () => {
  const f = buildProvingGround()

  it('is a sound layout', () => {
    expect(validateFortress(f)).toEqual([])
  })

  it('has one of everything the kit builds', () => {
    const kinds = new Set(f.grid.kind)
    for (const k of [CellKind.Ground, CellKind.Cover, CellKind.Block, CellKind.Stair, CellKind.Pad]) expect(kinds.has(k)).toBe(true)
    expect(f.grid.ladders.length).toBeGreaterThanOrEqual(4)
    expect(f.grid.cables.length).toBeGreaterThanOrEqual(2)
    const posts = new Set(f.posts.map(p => p.kind))
    for (const k of ['guard', 'sentry', 'commander', 'drone', 'enforcer']) expect(posts.has(k as never)).toBe(true)
  })

  it('lands the mech on a perch that overlooks the yard', () => {
    const perch = heightAt(f.grid, f.insert.x, f.insert.z)
    expect(perch).toBe(TOWER_H)
    // From the perch the gate is in plain view.
    expect(hasLineOfSight(f.grid, f.insert.x, perch + 2, f.insert.z, 19.5 * CELL, 1, 33 * CELL)).toBe(true)
  })

  it('the curtain wall hides the yard from the ground outside it', () => {
    expect(hasLineOfSight(f.grid, 15.5 * CELL, 1.6, 34 * CELL, 15.5 * CELL, 1.6, 26 * CELL)).toBe(false)
    // …but not through the gate.
    expect(hasLineOfSight(f.grid, 19.5 * CELL, 1.6, 34 * CELL, 19.5 * CELL, 1.6, 26 * CELL)).toBe(true)
  })

  it('keeps every walking post on its feet', () => {
    for (const p of f.posts) {
      if (p.kind === 'drone') continue
      expect(heightAt(f.grid, p.x, p.z), `${p.kind} at ${toCell(p.x)},${toCell(p.z)}`).not.toBe(VOID)
    }
  })
})
