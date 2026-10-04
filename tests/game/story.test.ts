// R46: the story (#100 #103 #104). Which first clear earns which scene; the
// scenes build, run to their end on their own clock and stop at a skip; Space
// must be held half a second to skip; the first raid opens behind the
// teaching guard.

import { describe, expect, it } from 'vitest'
import { Texture } from 'three'
import { CINEMA_HOLD_S, CINEMA_IDS, CINEMA_LENGTH, cinemaAfterClear } from '@/game/story/cinemaIds'
import { newHold, pressHold, stepHold } from '@/game/story/holdSkip'
import { buildBastion } from '@/game/data/fortresses/bastion'
import { validateFortress } from '@/game/world/validate'
import { CELL, hasLineOfSight, heightAt } from '@/game/world/grid'

describe('which scene a first clear earns', () => {
  it('the haul after Bastion I and II, the falls at III, the outro at Harbour V, nothing on a replay', () => {
    expect(cinemaAfterClear('bastion', 1, true)).toBe('salvage')
    expect(cinemaAfterClear('bastion', 2, true)).toBe('salvage')
    expect(cinemaAfterClear('bastion', 3, true)).toBe('fallBastion')
    expect(cinemaAfterClear('foundry', 3, true)).toBe('fallFoundry')
    expect(cinemaAfterClear('harbour', 5, true)).toBe('outro')
    expect(cinemaAfterClear('bastion', 4, true)).toBeNull()
    expect(cinemaAfterClear('bastion', 1, false)).toBeNull()
  })

  it('lengths as written: the intro about 35 s, the haul 10 s, the falls 12 to 20 s, the outro about 40 s', () => {
    expect(CINEMA_LENGTH.intro).toBeGreaterThanOrEqual(30)
    expect(CINEMA_LENGTH.intro).toBeLessThanOrEqual(40)
    expect(CINEMA_LENGTH.salvage).toBe(10)
    for (const id of ['fallBastion', 'fallFoundry'] as const) {
      expect(CINEMA_LENGTH[id]).toBeGreaterThanOrEqual(12)
      expect(CINEMA_LENGTH[id]).toBeLessThanOrEqual(20)
    }
    expect(CINEMA_LENGTH.outro).toBeGreaterThanOrEqual(35)
  })
})

describe('skipping', () => {
  it('Space held half a second skips; a press does not', () => {
    const h = newHold()
    pressHold(h)
    let fired = false
    for (let k = 0; k < 10; k++) fired = stepHold(h, 1 / 60, CINEMA_HOLD_S) || fired
    expect(fired).toBe(false)
    for (let k = 0; k < 30; k++) fired = stepHold(h, 1 / 60, CINEMA_HOLD_S) || fired
    expect(fired).toBe(true)
    expect(CINEMA_HOLD_S).toBe(0.5)
  })
})

describe('the scenes', () => {
  for (const id of CINEMA_IDS) {
    it(`${id}: builds, plays to its end and is done; a skip ends it at once`, async () => {
      const { Cinema } = await import('@/game/story/cinema')
      const c = await Cinema.create(id, undefined, new Texture())
      let done = false
      void c.done.then(() => { done = true })
      // Sample it through: every beat runs without throwing, the camera stays a number.
      for (let t = 1; t < CINEMA_LENGTH[id]; t += 1.5) {
        c.seek(t)
        expect(Number.isFinite(c.camera.position.x + c.camera.position.y + c.camera.position.z)).toBe(true)
      }
      c.seek(CINEMA_LENGTH[id] + 1)
      await Promise.resolve()
      expect(done).toBe(true)
      c.dispose()
      const s = await Cinema.create(id, undefined, new Texture())
      let skipped = false
      void s.done.then(() => { skipped = true })
      s.seek(0.5)
      s.skip()
      await Promise.resolve()
      expect(skipped).toBe(true)
      expect(s.time).toBeLessThan(1)
      s.dispose()
    }, 30000)
  }
})

describe('the first raid opens behind the teaching guard (#104)', () => {
  it('the board sets the mech down on the battery, behind the guard, a crate beside it', () => {
    const f = buildBastion(1, 0, undefined, true)
    expect(f.opening).toBe(true)
    expect(validateFortress(f)).toEqual([])
    const g = f.posts.find(p => p.kind === 'guard' && p.route.length === 0 && Math.abs(heightAt(f.grid, p.x, p.z) - 4) < 0.01)!
    expect(g).toBeDefined()
    // On the battery (4 m), a few metres behind the guard (it faces east, the mech lands west of it).
    expect(heightAt(f.grid, f.insert.x, f.insert.z)).toBe(4)
    const behind = (f.insert.x - g.x) * Math.sin(g.facing) + (f.insert.z - g.z) * Math.cos(g.facing)
    expect(behind).toBeLessThan(-CELL * 2)
    // A guard across the cable is in a rifle's sight from behind the teaching guard.
    const eye = 4 + 1.4
    const from = { x: g.x - Math.sin(g.facing) * 1.5, z: g.z - Math.cos(g.facing) * 1.5 }
    const seen = f.posts.filter(p => p !== g && (p.kind === 'guard' || p.kind === 'sentry') && !p.reserve &&
      hasLineOfSight(f.grid, from.x, eye, from.z, p.x, heightAt(f.grid, p.x, p.z) + 1.54, p.z))
    expect(seen.length).toBeGreaterThan(0)
    // Any later raid lands on the perch as before.
    expect(buildBastion(1).insert).not.toEqual(f.insert)
    expect(buildBastion(1).opening).toBeUndefined()
  })
})
