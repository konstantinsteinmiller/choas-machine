// Round 3, R17: detection like the fortress guards of Assassin's Creed: Odyssey.
// White while a guard notices, yellow while it comes to look, red when sure.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import { makeGarrison, stepGarrison, drainEvents, SUSPECT_AT, type Target } from '@/game/sim/garrison'
import { fillRate, CLOSE_M, GRACE_S, type Glimpse } from '@/game/sim/perception'

const DT = 1 / 60
const glimpse = (over: Partial<Glimpse> = {}): Glimpse => ({ dist: 10, range: 22, exposed: 1, crouched: false, off: 0, shadow: false, yellow: false, ...over })

describe('how fast a band fills', () => {
  it('far is slower than near; crouched, at the edge of the cone or in shadow slower still', () => {
    const base = fillRate(glimpse(), 1)
    expect(fillRate(glimpse({ dist: 18 }), 1)).toBeLessThan(base)
    expect(fillRate(glimpse({ crouched: true }), 1)).toBeCloseTo(base / 2)
    expect(fillRate(glimpse({ off: 0.9 }), 1)).toBeCloseTo(base / 2)
    expect(fillRate(glimpse({ shadow: true }), 1)).toBeLessThan(base)
    expect(fillRate(glimpse({ exposed: 0.5 }), 1)).toBeCloseTo(base / 2)
    expect(fillRate(glimpse({ exposed: 0 }), 1)).toBe(0)
  })

  it('yellow is sharper than white, and arm\'s length is fast whatever', () => {
    expect(fillRate(glimpse({ yellow: true }), 1)).toBeGreaterThan(fillRate(glimpse(), 1))
    expect(fillRate(glimpse({ dist: CLOSE_M - 0.5, crouched: true }), 1)).toBeGreaterThan(fillRate(glimpse({ dist: CLOSE_M + 2, crouched: true }), 1) * 2)
  })
})

describe('a guard watching the mech', () => {
  // A sentry-like guard at the middle, facing +z, the mech straight ahead.
  const fortress = () => {
    const b = new FortressBuilder('t', 32, 32)
    b.ground(0, 0, 31, 31)
    b.insert(1, 1).extract(30, 30)
    return b.guard([[16, 8]], 0).build()
  }
  const mech = (dz: number, crouched: boolean): Target => ({ x: cellMid(16), y: 0, z: cellMid(8) + dz, height: crouched ? 1.7 : 2.6, crouched, visible: true })
  /** Seconds until the guard reaches `state` (or the cap). */
  const until = (dz: number, crouched: boolean, done: (s: string, d: number) => boolean, cap = 12): number => {
    const f = fortress()
    const gar = makeGarrison(f, 1)
    const u = gar.units[0]!
    const t = mech(dz, crouched)
    for (let i = 0; i < cap / DT; i++) {
      stepGarrison(gar, f.grid, t, DT)
      drainEvents(gar)
      // Hold the guard on its post, facing the mech, so only the meter moves.
      u.x = cellMid(16); u.z = cellMid(8); u.yaw = 0; u.look = 0
      if (done(u.state, u.detect)) return i * DT
    }
    return cap
  }

  it('a glance is forgiven: nothing in the first moment', () => {
    const f = fortress()
    const gar = makeGarrison(f, 1)
    for (let i = 0; i < (GRACE_S - 0.05) / DT; i++) stepGarrison(gar, f.grid, mech(12, false), DT)
    expect(gar.units[0]!.detect).toBe(0)
  })

  it('standing in the open at 12 m: yellow in a couple of seconds, red a while after; never instantly', () => {
    const toYellow = until(12, false, (_, d) => d >= SUSPECT_AT)
    const toRed = until(12, false, (s) => s === 'combat')
    expect(toYellow).toBeGreaterThan(1.2)
    expect(toYellow).toBeLessThan(4)
    expect(toRed).toBeGreaterThan(toYellow + 0.6)
  })

  it('crouched at 12 m takes about twice as long', () => {
    expect(until(12, true, (_, d) => d >= SUSPECT_AT)).toBeGreaterThan(until(12, false, (_, d) => d >= SUSPECT_AT) * 1.6)
  })

  it('at arm\'s length there is no hiding', () => {
    expect(until(2.5, true, (s) => s === 'combat')).toBeLessThan(2)
  })

  it('out of sight, a white meter drains away', () => {
    const f = fortress()
    const gar = makeGarrison(f, 1)
    const t = mech(12, false)
    for (let i = 0; i < 1.2 / DT; i++) stepGarrison(gar, f.grid, t, DT)
    const was = gar.units[0]!.detect
    expect(was).toBeGreaterThan(0)
    expect(was).toBeLessThan(SUSPECT_AT)
    t.visible = false
    for (let i = 0; i < 4 / DT; i++) stepGarrison(gar, f.grid, t, DT)
    expect(gar.units[0]!.detect).toBe(0)
  })
})
