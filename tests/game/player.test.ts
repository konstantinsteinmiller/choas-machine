// The mech's body (`sim/player.ts`): walking, crouching, ladders, cables,
// mantling and drops, on a small hand-built grid.

import { describe, expect, it } from 'vitest'
import {
  makePlayer, stepPlayer, eyeHeight, angleDelta, RUN_SPEED, CROUCH_SPEED, AIM_SPEED,
  type Player, type PlayerEvent, type Wish
} from '@/game/sim/player'
import { CELL, makeGrid, cellMid, heightAt, type Grid } from '@/game/world/grid'
import { MECH_EYE, MECH_EYE_CROUCH, MECH_RADIUS } from '@/game/models/mech'

const DT = 1 / 60
const flat = (w = 16, d = 16): Grid => {
  const g = makeGrid(w, d)
  g.h.fill(0)
  return g
}
const set = (g: Grid, cx: number, cz: number, h: number): void => { g.h[cz * g.w + cx] = h }
const wish = (mx = 0, mz = 0, extra: Partial<Wish> = {}): Wish => ({ mx, mz, crouch: false, aiming: false, aimYaw: 0, ...extra })

/** Step for `seconds`, collecting events. */
const run = (p: Player, g: Grid, w: Wish, seconds: number): PlayerEvent[] => {
  const out: PlayerEvent[] = []
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    out.push(...stepPlayer(p, g, i === 0 ? w : { ...w, crouch: false }, DT))
  }
  return out
}

/** Step until `done` says so (or `max` seconds pass), collecting events. */
const runUntil = (p: Player, g: Grid, w: Wish, done: (p: Player) => boolean, max = 8): PlayerEvent[] => {
  const out: PlayerEvent[] = []
  for (let i = 0; i < Math.round(max / DT) && !done(p); i++) out.push(...stepPlayer(p, g, w, DT))
  return out
}

describe('walking', () => {
  it('reaches its run speed and turns to face its travel', () => {
    const g = flat()
    const p = makePlayer(10, 0, 10)
    run(p, g, wish(1, 0), 1)
    expect(Math.hypot(p.vx, p.vz)).toBeCloseTo(RUN_SPEED, 1)
    expect(p.x).toBeGreaterThan(14)
    expect(p.z).toBeCloseTo(10)
    expect(angleDelta(p.yaw, Math.PI / 2)).toBeCloseTo(0, 1)
    expect(p.speed01).toBeCloseTo(1, 1)
  })

  it('stops when the stick is let go', () => {
    const g = flat()
    const p = makePlayer(10, 0, 10)
    run(p, g, wish(0, 1), 0.5)
    run(p, g, wish(), 0.5)
    expect(Math.hypot(p.vx, p.vz)).toBeLessThan(0.05)
  })

  it('a half-pushed stick walks at half speed', () => {
    const g = flat()
    const p = makePlayer(10, 0, 10)
    run(p, g, wish(0, 0.5), 1)
    expect(Math.hypot(p.vx, p.vz)).toBeCloseTo(RUN_SPEED * 0.5, 1)
  })

  it('keeps last step`s position for the render to interpolate from', () => {
    const g = flat()
    const p = makePlayer(10, 0, 10)
    run(p, g, wish(1, 0), 0.5)
    const x = p.x
    stepPlayer(p, g, wish(1, 0), DT)
    expect(p.px).toBe(x)
    expect(p.x).toBeGreaterThan(x)
  })

  it('walks up a flight of stairs and its height follows the treads', () => {
    const g = flat()
    for (let i = 0; i < 4; i++) set(g, 6 + i, 5, 0.5 * (i + 1))
    for (let cx = 10; cx < 16; cx++) set(g, cx, 5, 2)
    const p = makePlayer(cellMid(4), 0, cellMid(5))
    run(p, g, wish(1, 0), 2.6)
    expect(p.x).toBeGreaterThan(20)
    expect(p.y).toBeCloseTo(2, 1)
    expect(p.mode).toBe('ground')
  })

  it('a wall stops it and it slides along', () => {
    const g = flat()
    for (let cz = 0; cz < 16; cz++) set(g, 8, cz, 4)
    const p = makePlayer(14, 0, 10)
    run(p, g, wish(1, 1), 1)
    expect(p.x).toBeLessThanOrEqual(16 - MECH_RADIUS + 1e-6)
    expect(p.z).toBeGreaterThan(12)
  })
})

describe('crouching', () => {
  it('toggles, slows the mech and lowers its eyes', () => {
    const g = flat()
    const p = makePlayer(10, 0, 10)
    expect(eyeHeight(p)).toBe(MECH_EYE)
    run(p, g, wish(0, 1, { crouch: true }), 1)
    expect(p.crouched).toBe(true)
    expect(Math.hypot(p.vx, p.vz)).toBeCloseTo(CROUCH_SPEED, 1)
    expect(eyeHeight(p)).toBeCloseTo(MECH_EYE_CROUCH)
    run(p, g, wish(0, 0, { crouch: true }), 0.5)
    expect(p.crouched).toBe(false)
    expect(eyeHeight(p)).toBeCloseTo(MECH_EYE)
  })

  it('crouched, the mech does not walk off a high ledge', () => {
    const g = flat()
    for (let cx = 0; cx < 8; cx++) for (let cz = 0; cz < 16; cz++) set(g, cx, cz, 4)
    const p = makePlayer(14, 4, 10)
    run(p, g, wish(1, 0, { crouch: true }), 2)
    expect(p.y).toBe(4)
    expect(p.x).toBeLessThanOrEqual(16 - MECH_RADIUS + 1e-6)
  })

  it('aiming slows it and turns it to the aim', () => {
    const g = flat()
    const p = makePlayer(10, 0, 10)
    run(p, g, wish(1, 0, { aiming: true, aimYaw: Math.PI }), 1)
    expect(Math.hypot(p.vx, p.vz)).toBeCloseTo(AIM_SPEED, 1)
    expect(Math.abs(angleDelta(p.yaw, Math.PI))).toBeLessThan(0.05)
  })
})

describe('dropping', () => {
  it('walks off a ledge, falls and lands, reporting the drop', () => {
    const g = flat()
    for (let cx = 0; cx < 8; cx++) for (let cz = 0; cz < 16; cz++) set(g, cx, cz, 8)
    const p = makePlayer(15, 8, 10)
    const events = run(p, g, wish(1, 0), 2.5)
    expect(events).toContainEqual({ type: 'land', drop: 8 })
    expect(p.y).toBe(0)
    expect(p.mode).toBe('ground')
    expect(p.x).toBeGreaterThan(16)
  })

  it('never falls off the island', () => {
    const g = flat(8, 8)
    const p = makePlayer(14, 0, 8)
    run(p, g, wish(1, 0), 2)
    expect(heightAt(g, p.x, p.z)).toBe(0)
    expect(p.mode).toBe('ground')
  })
})

describe('a ladder', () => {
  const tower = (): Grid => {
    const g = flat()
    for (let cx = 8; cx < 12; cx++) set(g, cx, 5, 6)
    g.ladders.push({ cx: 7, cz: 5, dx: 1, dz: 0 })
    return g
  }

  it('walking into its foot climbs it, and the top puts the mech on the block', () => {
    const g = tower()
    const p = makePlayer(cellMid(7) - 0.5, 0, cellMid(5))
    const events = run(p, g, wish(1, 0), 2.6)
    expect(events).toContainEqual({ type: 'ladder' })
    expect(p.mode).toBe('ground')
    expect(p.y).toBe(6)
    expect(p.x).toBeGreaterThan(16)
    expect(heightAt(g, p.x, p.z)).toBe(6)
  })

  it('pulling away from the wall climbs back down', () => {
    const g = tower()
    const p = makePlayer(cellMid(7) + 0.4, 0, cellMid(5))
    run(p, g, wish(1, 0), 1)
    expect(p.mode).toBe('ladder')
    expect(p.y).toBeGreaterThan(2)
    run(p, g, wish(-1, 0), 2)
    expect(p.mode).toBe('ground')
    expect(p.y).toBe(0)
  })

  it('letting go of the stick holds on', () => {
    const g = tower()
    const p = makePlayer(cellMid(7) + 0.4, 0, cellMid(5))
    run(p, g, wish(1, 0), 0.8)
    const y = p.y
    run(p, g, wish(), 1)
    expect(p.y).toBe(y)
    expect(p.mode).toBe('ladder')
  })

  it('from the top, walking out over it climbs down instead of dropping', () => {
    const g = tower()
    const p = makePlayer(cellMid(8) - 0.4, 6, cellMid(5))
    const events = run(p, g, wish(-1, 0), 0.3)
    expect(events).toContainEqual({ type: 'ladder' })
    run(p, g, wish(-1, 0), 3)
    expect(p.y).toBe(0)
    expect(events.some(e => e.type === 'land')).toBe(false)
  })

  it('walking past the foot sideways does not grab it', () => {
    const g = tower()
    const p = makePlayer(cellMid(7), 0, cellMid(5) - 0.6)
    run(p, g, wish(0, 1), 0.3)
    expect(p.mode).toBe('ground')
  })
})

describe('a cable', () => {
  const span = (): Grid => {
    const g = flat()
    set(g, 3, 5, 8)
    set(g, 11, 5, 5)
    g.cables.push({ ax: 3, az: 5, bx: 11, bz: 5 })
    return g
  }

  it('is walked from one end to the other, sloping with its ends', () => {
    const g = span()
    const p = makePlayer(cellMid(3), 8, cellMid(5))
    const events = run(p, g, wish(1, 0), 0.2)
    expect(events).toContainEqual({ type: 'cable' })
    expect(p.mode).toBe('cable')
    run(p, g, wish(1, 0), 2)
    expect(p.y).toBeLessThan(8)
    expect(p.y).toBeGreaterThan(5)
    expect(p.z).toBeCloseTo(cellMid(5))
    runUntil(p, g, wish(1, 0), q => q.mode === 'ground')
    expect(p.mode).toBe('ground')
    expect(p.y).toBeCloseTo(5)
    // Off at the end of the line, just onto the platform (#201), not walked on to the cell's middle.
    expect(p.x).toBeGreaterThan(cellMid(11) - CELL / 2)
    expect(p.x).toBeLessThan(cellMid(11) - CELL / 2 + 0.5)
  })

  it('can be walked back, and stood on', () => {
    const g = span()
    const p = makePlayer(cellMid(3), 8, cellMid(5))
    run(p, g, wish(1, 0), 1.5)
    const x = p.x
    run(p, g, wish(), 1)
    expect(p.x).toBe(x)
    runUntil(p, g, wish(-1, 0), q => q.mode === 'ground')
    expect(p.mode).toBe('ground')
    expect(p.y).toBeCloseTo(8)
  })

  it('can be sprinted along: quicker than walking it', () => {
    const g = span()
    const walk = makePlayer(cellMid(3), 8, cellMid(5))
    const dash = makePlayer(cellMid(3), 8, cellMid(5))
    run(walk, g, wish(1, 0), 0.2)
    run(dash, g, { ...wish(1, 0), sprint: true }, 0.2)
    expect(dash.mode).toBe('cable')
    run(walk, g, wish(1, 0), 1.2)
    run(dash, g, { ...wish(1, 0), sprint: true }, 1.2)
    expect(dash.sprinting).toBe(true)
    expect(dash.cableT).toBeGreaterThan(walk.cableT * 1.4)
  })

  it('is taken from its far end too', () => {
    const g = span()
    const p = makePlayer(cellMid(11), 5, cellMid(5))
    run(p, g, wish(-1, 0), 0.2)
    expect(p.mode).toBe('cable')
    expect(p.cableT).toBeLessThan(1)
  })

  it('is not taken by walking off the tower some other way', () => {
    const g = span()
    const p = makePlayer(cellMid(3), 8, cellMid(5))
    const events = run(p, g, wish(0, 1), 2)
    expect(events.some(e => e.type === 'cable')).toBe(false)
    expect(events.some(e => e.type === 'land')).toBe(true)
  })
})

describe('mantling', () => {
  it('pushing against a cover block climbs onto it', () => {
    const g = flat()
    set(g, 8, 5, 1.8)
    const p = makePlayer(cellMid(7), 0, cellMid(5))
    const events = runUntil(p, g, wish(1, 0), q => q.y > 1.7 && q.mode === 'ground')
    expect(events).toContainEqual({ type: 'mantle' })
    expect(p.mode).toBe('ground')
    expect(p.y).toBeCloseTo(1.8)
    expect(heightAt(g, p.x, p.z)).toBeCloseTo(1.8)
  })

  it('a wall is too high to mantle', () => {
    const g = flat()
    set(g, 8, 5, 4)
    const p = makePlayer(cellMid(7), 0, cellMid(5))
    const events = run(p, g, wish(1, 0), 2)
    expect(events).toEqual([])
    expect(p.y).toBe(0)
  })

  it('brushing a block at an angle does not climb it', () => {
    const g = flat()
    set(g, 8, 5, 1.8)
    const p = makePlayer(cellMid(7), 0, cellMid(5) - 0.9)
    const events = run(p, g, wish(0.3, 1), 0.4)
    expect(events.some(e => e.type === 'mantle')).toBe(false)
  })
})

describe('angles', () => {
  it('takes the short way round', () => {
    expect(angleDelta(0.1, -0.1)).toBeCloseTo(-0.2)
    expect(angleDelta(3, -3)).toBeCloseTo(Math.PI * 2 - 6)
    expect(Math.abs(angleDelta(0, Math.PI * 2))).toBeLessThan(1e-9)
  })
  it('CELL is what the tests assume', () => {
    expect(CELL).toBe(2)
  })
})
