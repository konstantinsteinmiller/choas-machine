// R33: the guards' senses. #68 a shot, an impact or a near miss puts a guard
// on edge (focus: three times the sight over a wide cone) and sends it to
// look; #70 they guess where a shot came from, the guess narrowing with each
// shot from the same spot, hunt from a spot that sees up a wall, and fire at
// a far sniper; #98 a body found means a minute's search by the finder and
// the guards it calls, and two bodies keep the base on edge.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid, hasLineOfSight } from '@/game/world/grid'
import {
  BODY_SEARCH_S, FOCUS_RANGE, FOCUS_S, SPECS, SUSPECT_AT, drainEvents, estimateShot, killUnit, makeGarrison, shotPassed, stepGarrison, viewerOf,
  type GarrisonEvent, type Target
} from '@/game/sim/garrison'
import { GUNS, VOLLEY_RANGE, stepFire } from '@/game/sim/chaos'

const DT = 1 / 30
const yard = (w = 44): FortressBuilder => {
  const b = new FortressBuilder('t', w, w)
  b.ground(0, 0, w - 1, w - 1).insert(1, 1).extract(w - 2, w - 2)
  return b
}
const at = (x: number, z: number, extra: Partial<Target> = {}): Target => ({ x, y: 0, z, height: 2.6, crouched: false, visible: true, ...extra })
type G = ReturnType<typeof makeGarrison>
type F = ReturnType<FortressBuilder['build']>
const run = (gar: G, f: F, t: Target, s: number): GarrisonEvent[] => {
  const all: GarrisonEvent[] = []
  for (let k = 0; k < s / DT; k++) {
    stepGarrison(gar, f.grid, t, DT)
    stepFire(gar, f.grid, t, DT)
    all.push(...drainEvents(gar))
  }
  return all
}
const hidden = at(0, 0, { visible: false })

describe('focus (#68)', () => {
  it('a round passing close by puts a guard on edge: it looks toward the shot and sees three times as far, for a while', () => {
    const f = yard().guard([[20, 20]], 0).build()
    const gar = makeGarrison(f, 1)
    const u = gar.units[0]!
    const base = viewerOf(u).range
    const from = { x: cellMid(20), y: 0, z: cellMid(40) }
    // A round from the south flies past it, two metres off, and on into the far wall.
    const n = shotPassed(gar, hidden, from, cellMid(20) + 2, 2, cellMid(40), cellMid(20) + 2, 1, cellMid(2), 6, 4)
    expect(n).toBe(1)
    expect(u.state).toBe('suspicious')
    expect(u.detect).toBeGreaterThanOrEqual(SUSPECT_AT)
    expect(u.focusT).toBe(FOCUS_S)
    expect(viewerOf(u).range).toBeCloseTo(base * FOCUS_RANGE)
    expect(Math.hypot(u.seenX - from.x, u.seenZ - from.z)).toBeLessThan(0.01)
    run(gar, f, hidden, FOCUS_S + 1)
    expect(u.focusT).toBe(0)
  })

  it('a round far from anyone, heard by nobody, changes nothing', () => {
    const f = yard().guard([[5, 5]], 0).build()
    const gar = makeGarrison(f, 1)
    expect(shotPassed(gar, hidden, { x: 80, y: 0, z: 80 }, 80, 2, 80, 60, 1, 80, 6, 4)).toBe(0)
    expect(gar.units[0]!.state).toBe('patrol')
  })
})

describe('where the shot came from (#70)', () => {
  it('a guess off by a share of the distance, halved by a second shot from about there, exact from the third', () => {
    const f = yard().build()
    const gar = makeGarrison(f, 1)
    const errs: number[] = []
    for (let k = 0; k < 3; k++) {
      const e = estimateShot(gar, 10, 4, 10, 10, 90)
      errs.push(Math.hypot(e.x - 10, e.z - 10))
    }
    expect(errs[0]).toBeLessThanOrEqual(80 * 0.22 + 1e-6)
    expect(errs[1]).toBeLessThanOrEqual(80 * 0.22 / 2 + 1e-6)
    expect(errs[2]).toBe(0)
    // Moving on starts the count again.
    const moved = estimateShot(gar, 60, 4, 60, 60, 10)
    expect(gar.shotSpot.n).toBe(1)
    expect(Math.hypot(moved.x - 60, moved.z - 60)).toBeGreaterThanOrEqual(0)
  })

  it('a hunter whose quarry is up a wall walks to a spot on the ground that can see up there', () => {
    const b = yard()
    // A 6 m tower the guards cannot climb.
    b.tower(30, 30, 2, 6)
    b.guard([[10, 10]], 0)
    const f = b.build()
    const gar = makeGarrison(f, 1)
    const u = gar.units[0]!
    // A fight that lost the mech on the tower top.
    u.state = 'search'
    u.fought = true
    u.t = 0
    gar.lkp = { x: cellMid(30) + 1, y: 6, z: cellMid(30) + 1, t: 0 }
    run(gar, f, hidden, 20)
    // From where it ended up, it has the tower top in view, and it is off the tower's foot.
    const d = Math.hypot(u.x - gar.lkp.x, u.z - gar.lkp.z)
    expect(d).toBeGreaterThan(5)
    expect(d).toBeLessThan(22)
    expect(hasLineOfSight(f.grid, u.x, u.y + SPECS.guard.eye, u.z, gar.lkp.x, gar.lkp.y + 1.5, gar.lkp.z)).toBe(true)
  })

  it('a guard in a fight puts rounds toward a far sniper it can see, past its aimed range, and few of them hit', () => {
    const f = yard(70).guard([[5, 5]], 0).build()
    const gar = makeGarrison(f, 1)
    const u = gar.units[0]!
    const far = at(cellMid(5), cellMid(5) + GUNS.guard!.range + 30)
    u.state = 'combat'
    u.detect = 1
    u.fought = true
    u.yaw = 0
    // It comes closer as it fights; count only the rounds fired from past its range.
    let farShots = 0
    for (let k = 0; k < 12 / DT; k++) {
      stepGarrison(gar, f.grid, far, DT)
      stepFire(gar, f.grid, far, DT)
      const d = Math.hypot(far.x - u.x, far.z - u.z)
      for (const e of drainEvents(gar)) if (e.type === 'fire' && d > GUNS.guard!.range) farShots++
    }
    expect(farShots).toBeGreaterThan(2)
    expect(GUNS.guard!.range + 30).toBeLessThan(VOLLEY_RANGE)
  })
})

describe('a body found (#98)', () => {
  it('the finder calls two guards near it; they search round it for a minute and then go back to their rounds', () => {
    const b = yard()
    b.guard([[20, 14], [20, 26]], 0).guard([[16, 20]], 0).guard([[24, 20]], 0).guard([[40, 40]], 0)
    b.guard([[20, 20]], 0)
    const f = b.build()
    const gar = makeGarrison(f, 1)
    killUnit(gar, 4, cellMid(20), cellMid(30), 'shot')
    let found = -1
    const ev: GarrisonEvent[] = []
    for (let k = 0; k < 80 / DT && found < 0; k++) {
      stepGarrison(gar, f.grid, hidden, DT)
      for (const e of drainEvents(gar)) { ev.push(e); if (e.type === 'body') found = e.id }
    }
    expect(found).toBeGreaterThanOrEqual(0)
    const searching = gar.units.filter(u => u.bodySearch)
    expect(searching.length).toBeGreaterThanOrEqual(2)
    expect(searching.length).toBeLessThanOrEqual(3)
    // The far guard is not called.
    expect(gar.units[3]!.bodySearch).toBe(false)
    run(gar, f, hidden, BODY_SEARCH_S * 0.5)
    expect(gar.units.filter(u => u.bodySearch).length).toBeGreaterThanOrEqual(2)
    run(gar, f, hidden, BODY_SEARCH_S + 15)
    expect(gar.units.filter(u => u.bodySearch).length).toBe(0)
    expect(gar.units.filter(u => u.state === 'patrol' && u.kind === 'guard').length).toBe(4)
    expect(gar.heightened).toBe(false)
  })

  it('the second body found keeps the base on edge for the raid', () => {
    const f = yard().guard([[20, 14], [20, 26]], 0).guard([[18, 18]], 0).guard([[22, 22]], 0).build()
    const gar = makeGarrison(f, 1)
    killUnit(gar, 1, 0, 0, 'shot')
    killUnit(gar, 2, 0, 0, 'shot')
    const ev = run(gar, f, hidden, 60)
    expect(ev.filter(e => e.type === 'body').length).toBe(2)
    expect(gar.heightened).toBe(true)
    expect(ev.some(e => e.type === 'heightened')).toBe(true)
  })
})
