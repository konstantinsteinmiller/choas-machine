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
import { CELL, heightAt } from '@/game/world/grid'
import { WALK_EARSHOT } from '@/game/sim/garrison'

describe('which scene a first clear earns', () => {
  it('the haul after Bastion I and II, the falls at III, the outro at Spire III (round 5), nothing on a replay', () => {
    expect(cinemaAfterClear('bastion', 1, true)).toBe('salvage')
    expect(cinemaAfterClear('bastion', 2, true)).toBe('salvage')
    expect(cinemaAfterClear('bastion', 3, true)).toBe('fallBastion')
    expect(cinemaAfterClear('foundry', 3, true)).toBe('fallFoundry')
    expect(cinemaAfterClear('spire', 3, true)).toBe('outro')
    expect(cinemaAfterClear('harbour', 5, true)).toBeNull()
    expect(cinemaAfterClear('bastion', 4, true)).toBeNull()
    expect(cinemaAfterClear('bastion', 1, false)).toBeNull()
  })

  it('lengths as written: the intro about 42 s (#131: every enemy type, the yard and the rope assassination), the haul 10 s, the falls 12 to 20 s, the outro about 40 s', () => {
    expect(CINEMA_LENGTH.intro).toBeGreaterThanOrEqual(30)
    expect(CINEMA_LENGTH.intro).toBeLessThanOrEqual(45)
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

describe('threat I arrives on a platform to practise on (the jam build)', () => {
  it('a crate in the middle, one guard at the far edge looking at the fortress, its back to the landing, out of a step\'s earshot', () => {
    const f = buildBastion(1)
    expect(validateFortress(f)).toEqual([])
    const g = f.posts.find(p => p.kind === 'guard' && p.route.length === 0 && Math.hypot(p.x - f.insert.x, p.z - f.insert.z) < CELL * 8)!
    expect(g).toBeDefined()
    expect(heightAt(f.grid, f.insert.x, f.insert.z)).toBe(heightAt(f.grid, g.x, g.z))
    const d = Math.hypot(g.x - f.insert.x, g.z - f.insert.z)
    expect(d).toBeGreaterThan(WALK_EARSHOT * 2)
    expect(d).toBeLessThan(18)
    // Its back to the mech: the landing is behind it.
    const ahead = (f.insert.x - g.x) * Math.sin(g.facing) + (f.insert.z - g.z) * Math.cos(g.facing)
    expect(ahead).toBeLessThan(-CELL * 2)
    // No scripted opening any more.
    expect((f as unknown as { opening?: boolean }).opening).toBeUndefined()
  })
})

describe('the intro: nothing flies through the stage (#125)', () => {
  it('the board under the robo dog is clear of the floor and the cliff at every moment it is in the scene', async () => {
    const { Cinema } = await import('@/game/story/cinema')
    const { heightAt: h } = await import('@/game/world/grid')
    const s = await Cinema.create('intro', undefined, new Texture())
    const dog = (s as unknown as { stage: { dog: { root: { visible: boolean } } } }).stage.dog.root
    for (let t = 0.5; t < 42; t += 0.1) {
      s.seek(t)
      if (!dog.visible) continue
      const d = s.dogAt
      const floor = h(s.grid, d.x, d.z)
      if (floor > -100) expect(d.y, `t ${t.toFixed(1)} at ${d.x.toFixed(1)},${d.z.toFixed(1)}`).toBeGreaterThanOrEqual(floor + 0.3)
    }
    s.dispose()
  }, 30000)

  it('#136: once the mech is off it, the board flies away and never sets down in the scene', async () => {
    const { Cinema } = await import('@/game/story/cinema')
    const s = await Cinema.create('intro', undefined, new Texture())
    const dog = (s as unknown as { stage: { dog: { root: { visible: boolean } } } }).stage.dog.root
    s.seek(8)
    expect(s.dogAt.y).toBeGreaterThan(10)
    s.seek(20)
    expect(dog.visible).toBe(false)
    s.seek(40)
    expect(dog.visible).toBe(false)
    s.dispose()
  }, 30000)
})
