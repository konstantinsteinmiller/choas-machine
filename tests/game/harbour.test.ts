// R45: the Harbour (#79). A dockyard on the island's north edge: two ships
// moored over the open sky, boarded by a plank and a ladder; two dock cranes
// that are perches with a cable onto a ship; container alleys; two roofed
// warehouses; its own look; open once the Foundry has fallen at threat III.

import { beforeEach, describe, expect, it } from 'vitest'
import { buildHarbour } from '@/game/data/fortresses/harbour'
import { VOID, cellHeight, findHoles, hasLineOfSight, heightAt, roofAt } from '@/game/world/grid'
import { validateFortress } from '@/game/world/validate'
import { themeOf } from '@/game/data/themes'
import { defaultProfile, profile } from '@/game/state/profile'
import { fortressOpen, levelKey } from '@/game/state/progress'

describe('the Harbour', () => {
  const f = buildHarbour(3)
  const g = f.grid

  it('validates at every threat level, with its own look', () => {
    for (const l of [1, 2, 3, 4, 5]) {
      const x = buildHarbour(l)
      expect(findHoles(x.grid)).toEqual([])
      expect(validateFortress(x), `threat ${l}`).toEqual([])
    }
    expect(f.theme).toBe('harbour')
    expect(themeOf('harbour').sky).not.toBe(themeOf('foundry').sky)
  })

  it('two ships lie over the open sky beside the piers, each boarded by a ladder', () => {
    // Open sky between pier A and ship A, and between pier B and ship B (off the planks).
    expect(cellHeight(g, 12, 8)).toBe(VOID)
    expect(cellHeight(g, 44, 5)).toBe(VOID)
    // The decks stand up off the planks; a ladder climbs onto each.
    for (const [deckX, deckZ] of [[9, 11], [48, 9]] as const) {
      expect(cellHeight(g, deckX, deckZ)).toBeGreaterThanOrEqual(3)
      expect(g.ladders.some(l => l.cx + l.dx === deckX && l.cz + l.dz === deckZ)).toBe(true)
    }
  })

  it('the dock cranes are perches with a cable down onto a ship', () => {
    const tall = g.cables.filter(c => cellHeight(g, c.ax, c.az) >= 10 && cellHeight(g, c.bx, c.bz) >= 6 && c.bz < 20)
    expect(tall.length).toBeGreaterThanOrEqual(2)
  })

  it('both warehouses are roofed, with a skylight each', () => {
    expect(roofAt(g, 6, 34)).not.toBe(VOID)
    expect(roofAt(g, 8, 36)).toBe(VOID)
    expect(roofAt(g, 48, 40)).not.toBe(VOID)
    expect(roofAt(g, 50, 37)).toBe(VOID)
  })

  it('from the perch, under 40 % of the objectives can be seen', () => {
    for (const level of [1, 3, 5]) {
      const x = buildHarbour(level)
      const eye = heightAt(x.grid, x.insert.x, x.insert.z) + 2.2
      const goals = [...x.salvage, ...x.beacons]
      const seen = goals.filter(o => hasLineOfSight(x.grid, x.insert.x, eye, x.insert.z, o.x, o.y + 1, o.z)).length
      expect(seen / goals.length, `threat ${level}`).toBeLessThan(0.4)
    }
  })
})

describe('the picker opens the Harbour after the Foundry at threat III', () => {
  beforeEach(() => { Object.assign(profile, defaultProfile()) })
  it('locked until then', () => {
    const won = { clears: 1, medals: {} as never, bestScore: 10, bestTime: 60 }
    for (const l of [1, 2, 3]) profile.fortresses[levelKey(l)] = { ...won }
    expect(fortressOpen('harbour')).toBe(false)
    for (const l of [1, 2, 3]) profile.fortresses[levelKey(l, 'foundry')] = { ...won }
    expect(fortressOpen('harbour')).toBe(true)
  })
})
