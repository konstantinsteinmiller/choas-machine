// R46: the story (#100 #103 #104). Which first clear earns which scene; the
// scenes build, run to their end on their own clock and stop at a skip; Space
// must be held half a second to skip; the first raid opens behind the
// teaching guard.

import { describe, expect, it } from 'vitest'
import { Texture } from 'three'
import { SKIP_HOLD_S, CINEMA_IDS, CINEMA_LENGTH, cinemaAfterClear } from '@/game/story/cinemaIds'
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

  it('lengths as written: the intro about 50 s (#131 every enemy type, the yard and the rope assassination; #179 the Airship, the escape, the still), the haul 10 s, the falls 12 to 20 s, the outro about 40 s', () => {
    expect(CINEMA_LENGTH.intro).toBeGreaterThanOrEqual(45)
    expect(CINEMA_LENGTH.intro).toBeLessThanOrEqual(60)
    expect(CINEMA_LENGTH.salvage).toBe(10)
    for (const id of ['fallBastion', 'fallFoundry'] as const) {
      expect(CINEMA_LENGTH[id]).toBeGreaterThanOrEqual(12)
      expect(CINEMA_LENGTH[id]).toBeLessThanOrEqual(20)
    }
    expect(CINEMA_LENGTH.outro).toBeGreaterThanOrEqual(35)
  })
})

describe('skipping', () => {
  it('Space held a second and a half skips (#175); a press, or a second, does not', () => {
    const h = newHold()
    pressHold(h)
    let fired = false
    for (let k = 0; k < 60; k++) fired = stepHold(h, 1 / 60, SKIP_HOLD_S) || fired
    expect(fired).toBe(false)
    for (let k = 0; k < 31; k++) fired = stepHold(h, 1 / 60, SKIP_HOLD_S) || fired
    expect(fired).toBe(true)
    expect(SKIP_HOLD_S).toBe(1.5)
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
    for (let t = 0.5; t < CINEMA_LENGTH.intro; t += 0.1) {
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

describe('the finale of the intro (#179)', () => {
  type Peek = { stage: { mech: { root: { position: { x: number; y: number; z: number } } }; mp: { crouch: number }; dog: { root: { visible: boolean } }; extra: Record<string, { root: { visible: boolean; position: { x: number; y: number; z: number } } }> } }
  it('it climbs to the perch (no jump up there), the Airship rises and opens up, it ducks behind the parapet, the dog takes it away, the still of the third fortress closes it', async () => {
    const { Cinema } = await import('@/game/story/cinema')
    const { INTRO_STILL_S } = await import('@/game/story/cinemaIds')
    const { hasLineOfSight } = await import('@/game/world/grid')
    const s = await Cinema.create('intro', undefined, new Texture())
    const st = (s as unknown as Peek).stage
    const m = st.mech.root.position
    // Up the perch's face, not appearing on top of it: never more than a step a frame.
    s.seek(33.4)
    const ship = st.extra.ship!
    expect(ship.root.visible).toBe(false)
    let last = { x: m.x, y: m.y, z: m.z }
    for (let t = 33.5; t < 36; t += 1 / 30) {
      s.seek(t)
      expect(Math.hypot(m.x - last.x, m.y - last.y, m.z - last.z), `t ${t.toFixed(2)}`).toBeLessThan(0.6)
      last = { x: m.x, y: m.y, z: m.z }
    }
    expect(m.y).toBeCloseTo(14, 1)
    s.seek(39.5)
    expect(ship.root.visible).toBe(true)
    // Down behind the parapet: the Airship's guns have no line to it.
    expect(st.mp.crouch).toBeGreaterThan(0.9)
    const sp = ship.root.position
    expect(hasLineOfSight(s.grid, sp.x, sp.y - 3, sp.z, m.x, m.y + 0.8, m.z)).toBe(false)
    // The board is back, and it rides away on it.
    s.seek(43.8)
    expect(st.dog.root.visible).toBe(true)
    expect(Math.hypot(s.dogAt.x - m.x, s.dogAt.z - m.z)).toBeLessThan(0.5)
    expect(s.dogAt.distanceTo({ x: 74.4, y: 14.7, z: 23.4 } as never)).toBeGreaterThan(2)
    // The still takes the last seconds.
    expect(s.stillFrom).toBeCloseTo(CINEMA_LENGTH.intro - INTRO_STILL_S, 6)
    expect(INTRO_STILL_S).toBe(3)
    s.dispose()
  }, 30000)
})

describe('the intro: from the kill straight up the wall (#183)', () => {
  it('no cut to a ladder: it rises from the body and the hook pulls it up the wall, one take', async () => {
    const { Cinema } = await import('@/game/story/cinema')
    const s = await Cinema.create('intro', undefined, new Texture())
    const st = (s as unknown as { stage: { mech: { root: { position: { x: number; y: number; z: number } } }; extra: Record<string, { group: { visible: boolean } }> } }).stage
    const m = st.mech.root.position
    // From the landing on the body (the drop itself is fast, it is the kill) to the wall top.
    s.seek(16)
    let last = { x: m.x, y: m.y, z: m.z }
    let hooked = false
    for (let t = 16; t < 19.6; t += 1 / 30) {
      s.seek(t)
      expect(Math.hypot(m.x - last.x, m.y - last.y, m.z - last.z), `t ${t.toFixed(2)}`).toBeLessThan(0.9)
      last = { x: m.x, y: m.y, z: m.z }
      if (t > 17.6 && t < 18.6 && st.extra.hook!.group.visible) hooked = true
    }
    expect(hooked).toBe(true)
    // On the wall top for the rifle.
    expect(m.y).toBeCloseTo(10, 1)
    s.dispose()
  }, 30000)
})
