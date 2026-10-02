// Round 2, R6: searchlights on the towers, and the scrapyard dressing.

import { describe, expect, it } from 'vitest'
import { FortressBuilder, HEAP_H, SEARCHLIGHT_MAST } from '@/game/world/fortress'
import { CellKind, Surf, cellMid, cellKind, cellSurf, heightAt } from '@/game/world/grid'
import { makeGarrison, stepGarrison, drainEvents, killUnit, spotCentre, isLight, type Target } from '@/game/sim/garrison'
import { validateFortress } from '@/game/world/validate'
import { buildBastion, BASTION_LEVELS } from '@/game/data/fortresses/bastion'

const DT = 1 / 60
const base = () => {
  const b = new FortressBuilder('t', 40, 40)
  b.ground(0, 0, 39, 39)
  b.tower(4, 4, 2, 8)
  b.insert(30, 30, 0)
  b.extract(36, 36)
  b.searchlight(4, 4, [[12, 12, 1], [12, 20, 1]])
  b.sentry(20, 4, 0)
  return b.build()
}
const mech = (x: number, z: number, visible = true): Target => ({ x, y: 0, z, feetY: 0, height: 2.5, crouched: false, visible, moving: 1 } as Target)

describe('a searchlight', () => {
  it('stands on its mast above the tower, and its beam starts at the first sweep point', () => {
    const f = base()
    const gar = makeGarrison(f)
    const u = gar.units[0]!
    expect(u.kind).toBe('searchlight')
    expect(isLight(u)).toBe(true)
    expect(u.y).toBeCloseTo(8 + SEARCHLIGHT_MAST, 6)
    expect(spotCentre(u)).toEqual({ x: cellMid(12), z: cellMid(12) })
  })

  it('sweeps from point to point, holding at each, without leaving its mast', () => {
    const f = base()
    const gar = makeGarrison(f)
    const u = gar.units[0]!
    const x0 = u.x
    const z0 = u.z
    const away = mech(cellMid(30), cellMid(30))
    let reached = false
    for (let i = 0; i < 60 * 8; i++) {
      stepGarrison(gar, f.grid, away, DT)
      const c = spotCentre(u)
      if (Math.hypot(c.x - cellMid(12), c.z - cellMid(20)) < 0.01) reached = true
    }
    expect(reached).toBe(true)
    expect(u.x).toBe(x0)
    expect(u.z).toBe(z0)
  })

  it('what its light falls on is seen: the base knows', () => {
    const f = base()
    const gar = makeGarrison(f)
    const u = gar.units[0]!
    const c = spotCentre(u)
    const events = []
    for (let i = 0; i < 60 * 3; i++) { stepGarrison(gar, f.grid, mech(c.x, c.z), DT); events.push(...drainEvents(gar)) }
    expect(u.state).toBe('combat')
    expect(events.some(e => e.type === 'spotted' && e.id === u.id)).toBe(true)
    expect(gar.alert.level).toBeGreaterThan(0)
  })

  it('a mech outside the light is not seen by it', () => {
    const f = base()
    const gar = makeGarrison(f)
    const u = gar.units[0]!
    for (let i = 0; i < 60 * 3; i++) stepGarrison(gar, f.grid, mech(cellMid(30), cellMid(12)), DT)
    expect(u.detect).toBe(0)
  })

  it('shot out, it is no body to raise the alarm over, but whoever is near wonders why it went dark', () => {
    const f = base()
    const gar = makeGarrison(f)
    const u = gar.units[0]!
    killUnit(gar, u.id, cellMid(20), cellMid(20), 'shot')
    expect(u.death).toBe('burst')
    expect(u.found).toBe(true)
    const sentry = gar.units[1]!
    // The sentry is 32 m away: out of earshot. Nobody wonders.
    expect(sentry.state).toBe('patrol')
  })
})

describe('the scrapyard dressing', () => {
  it('a heap is cover you can climb, and the mesh leaves it to the prop', () => {
    const b = new FortressBuilder('t', 10, 10)
    b.ground(0, 0, 9, 9).insert(1, 1).extract(8, 8).heap(5, 5)
    const f = b.build()
    expect(heightAt(f.grid, cellMid(5), cellMid(5))).toBe(HEAP_H)
    expect(cellKind(f.grid, 5, 5)).toBe(CellKind.Cover)
    expect(cellSurf(f.grid, 5, 5)).toBe(Surf.Heap)
    expect(f.decor.some(d => d.kind === 'heap')).toBe(true)
  })

  it('decking is looks only: the ground under it is the same ground', () => {
    const b = new FortressBuilder('t', 10, 10)
    b.ground(0, 0, 9, 9).insert(1, 1).extract(8, 8).deck(2, 2, 4, 4).deck(6, 6, 6, 6, true)
    const f = b.build()
    expect(cellSurf(f.grid, 3, 3)).toBe(Surf.Plate)
    expect(cellSurf(f.grid, 6, 6)).toBe(Surf.Hazard)
    expect(cellKind(f.grid, 3, 3)).toBe(CellKind.Ground)
    expect(heightAt(f.grid, cellMid(3), cellMid(3))).toBe(0)
  })

  it.each(Array.from({ length: BASTION_LEVELS }, (_, i) => i + 1))('the Bastion at level %i is sound, lit, and dressed', (level) => {
    const f = buildBastion(level)
    expect(validateFortress(f)).toEqual([])
    const lights = f.posts.filter(p => p.kind === 'searchlight')
    expect(lights.length).toBeGreaterThanOrEqual(level >= 4 ? 4 : level >= 3 ? 3 : level >= 2 ? 2 : 1)
    expect(f.decor.filter(d => d.kind === 'heap').length).toBeGreaterThanOrEqual(6)
    expect(f.decor.some(d => d.kind === 'crane')).toBe(true)
  })
})
