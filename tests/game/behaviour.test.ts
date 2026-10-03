// R22: routines and roles. A pair that chats watches each other, not the
// yard; a guard notices things out of place (yellow, not the alarm); a box
// seen creeping gets poked; a body tucked into a container is never found;
// the scope tags a unit; a sentry calls far; guards close from the sides.

import { describe, expect, it } from 'vitest'
import { FortressBuilder, COVER_H } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import {
  SHOUT_M, SUSPECT_AT, drainEvents, killUnit, makeGarrison, noteChange, stepGarrison, tagUnit,
  type GarrisonEvent, type Target
} from '@/game/sim/garrison'
import { buildBastion } from '@/game/data/fortresses/bastion'

const DT = 1 / 30
const yard = (): FortressBuilder => {
  const b = new FortressBuilder('t', 40, 40)
  b.ground(0, 0, 39, 39).insert(1, 1).extract(38, 38)
  return b
}
const at = (cx: number, cz: number, extra: Partial<Target> = {}): Target => ({
  x: cellMid(cx), y: 0, z: cellMid(cz), height: 2.6, crouched: false, visible: true, ...extra
})
const run = (gar: ReturnType<typeof makeGarrison>, f: ReturnType<FortressBuilder['build']>, t: Target, s: number): GarrisonEvent[] => {
  const all: GarrisonEvent[] = []
  for (let k = 0; k < s / DT; k++) { stepGarrison(gar, f.grid, t, DT); all.push(...drainEvents(gar)) }
  return all
}

describe('a pair that chats', () => {
  it('stands and talks, then one walks its round and comes back', () => {
    const f = yard().pair([10, 10], [[20, 10], [20, 14]]).build()
    const gar = makeGarrison(f, 1)
    const far = at(38, 38, { visible: false })
    run(gar, f, far, 1)
    expect(gar.units[0]!.chatting && gar.units[1]!.chatting).toBe(true)
    run(gar, f, far, 12)
    expect(gar.units[1]!.chatting).toBe(false)
    expect(Math.hypot(gar.units[1]!.x - gar.units[0]!.x, gar.units[1]!.z - gar.units[0]!.z)).toBeGreaterThan(4)
  })

  it('a pair talking does not see a mech it would see on its own', () => {
    const watch = (pair: boolean): number => {
      const b = yard()
      if (pair) b.pair([10, 10], [[30, 30]], 60)
      else b.guard([[10, 10]], Math.PI / 2)
      const f = b.build()
      const gar = makeGarrison(f, 1)
      // Off to the side of where it faces, at middle distance.
      run(gar, f, at(18, 12), 3)
      return gar.units[0]!.detect
    }
    expect(watch(false)).toBeGreaterThan(0.2)
    expect(watch(true)).toBeLessThan(watch(false) * 0.5)
  })

  it('the Bastion has one', () => {
    expect(buildBastion(1).posts.some(p => p.partner !== undefined)).toBe(true)
  })
})

describe('things out of place', () => {
  it('a guard on its round notices a stripped pile and goes to look: yellow, not the alarm', () => {
    const f = yard().guard([[10, 10]], 0).build()
    const gar = makeGarrison(f, 1)
    noteChange(gar, cellMid(10), 0, cellMid(16), 'pile')
    const ev = run(gar, f, at(38, 38, { visible: false }), 4)
    expect(ev.some(e => e.type === 'change')).toBe(true)
    expect(gar.units[0]!.detect).toBeGreaterThanOrEqual(SUSPECT_AT)
    expect(gar.units[0]!.state).not.toBe('combat')
    expect(gar.alert.chaos).toBe(false)
    expect(gar.changes[0]!.found).toBe(true)
  })

  it('a light shot out is noticed as the dark, not raised as a body', () => {
    const f = yard().guard([[10, 10]], 0).drone([[10, 16], [10, 16.1]], 6).build()
    const gar = makeGarrison(f, 1)
    killUnit(gar, 1, 0, 0)
    expect(gar.changes).toHaveLength(1)
    const ev = run(gar, f, at(38, 38, { visible: false }), 5)
    expect(ev.some(e => e.type === 'body')).toBe(false)
    expect(ev.some(e => e.type === 'change')).toBe(true)
  })
})

describe('the hide box', () => {
  it('a box seen creeping gets walked over to and poked: then the mech is found', () => {
    const f = yard().guard([[10, 10]], 0).build()
    const gar = makeGarrison(f, 1)
    const t = at(10, 16, { crouched: true, box: 'creep' })
    const ev = run(gar, f, t, 1.5)
    expect(ev.some(e => e.type === 'poke')).toBe(true)
    // It holds still now; the guard comes anyway, and pokes.
    t.box = 'still'
    run(gar, f, t, 12)
    expect(gar.units[0]!.state).toBe('combat')
  })

  it('a box that keeps still is a box', () => {
    const f = yard().guard([[10, 10]], 0).build()
    const gar = makeGarrison(f, 1)
    run(gar, f, at(10, 16, { crouched: true, box: 'still' }), 10)
    expect(gar.units[0]!.state).toBe('patrol')
  })
})

describe('bodies', () => {
  it('a body tucked away is never found; one left in the open is', () => {
    const find = (hidden: boolean): boolean => {
      const f = yard().guard([[10, 10]], 0).guard([[10, 18]], 0).build()
      const gar = makeGarrison(f, 1)
      killUnit(gar, 1, cellMid(10), cellMid(30), 'blade')
      gar.units[1]!.hidden = hidden
      return run(gar, f, at(38, 38, { visible: false }), 6).some(e => e.type === 'body')
    }
    expect(find(false)).toBe(true)
    expect(find(true)).toBe(false)
  })

  it('a container is cover as tall as a container', () => {
    expect(COVER_H).toBeGreaterThan(1.5)
  })
})

describe('the scope tags a unit', () => {
  it('a tagged unit stays tagged; a dead one cannot be', () => {
    const f = yard().guard([[10, 10]], 0).guard([[20, 20]], 0).build()
    const gar = makeGarrison(f, 1)
    expect(tagUnit(gar, 0)).toBe(true)
    expect(tagUnit(gar, 0)).toBe(false)
    killUnit(gar, 1, 0, 0)
    expect(tagUnit(gar, 1)).toBe(false)
    expect(gar.units[0]!.tagged).toBe(true)
  })
})

describe('roles', () => {
  it('a sentry calls guards from twice as far as a guard shouts', () => {
    const calls = (kind: 'guard' | 'sentry'): boolean => {
      // Shouting is a fort-with-beacons rule (R18).
      const b = yard().beacon(34, 34)
      if (kind === 'sentry') b.sentry(22, 10, 0)
      else b.guard([[22, 10]], 0)
      // A guard just past shouting range, facing away.
      const d = Math.ceil((SHOUT_M * 1.4) / 2)
      b.guard([[22 - d, 10]], Math.PI)
      const f = b.build()
      const gar = makeGarrison(f, 1)
      run(gar, f, at(22, 15), 6)
      return gar.units[1]!.state === 'combat'
    }
    expect(calls('guard')).toBe(false)
    expect(calls('sentry')).toBe(true)
  })

  it('guards closing on a seen mech do not all walk the same line', () => {
    const f = yard().guard([[5, 5]], 0).guard([[6, 5]], 0).guard([[7, 5]], 0).build()
    const gar = makeGarrison(f, 1)
    for (const u of gar.units) { u.detect = 1 }
    run(gar, f, at(30, 34), 0.1)
    run(gar, f, at(30, 34), 3)
    const xs = gar.units.map(u => u.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(2.5)
  })
})
