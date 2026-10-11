// R23: the Scrap Hound and the Engineer, and guards filling empty posts.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import {
  BODY_SEARCH_S, HOUND_NOSE, REPAIR_S, drainEvents, killUnit, makeGarrison, noteChange, sabotageBeacon, stepGarrison,
  type GarrisonEvent, type Target
} from '@/game/sim/garrison'
import { stepFire } from '@/game/sim/chaos'
import { shotDamage } from '@/game/sim/damage'
import { buildBastion } from '@/game/data/fortresses/bastion'

const DT = 1 / 30
const yard = (): FortressBuilder => {
  const b = new FortressBuilder('t', 44, 44)
  b.ground(0, 0, 43, 43).insert(1, 1).extract(42, 42)
  return b
}
const at = (x: number, z: number, extra: Partial<Target> = {}): Target => ({
  x, y: 0, z, height: 2.6, crouched: false, visible: true, ...extra
})
type G = ReturnType<typeof makeGarrison>
type F = ReturnType<FortressBuilder['build']>
const run = (gar: G, f: F, t: Target, s: number, each?: () => void): GarrisonEvent[] => {
  const all: GarrisonEvent[] = []
  for (let k = 0; k < s / DT; k++) {
    stepGarrison(gar, f.grid, t, DT)
    stepFire(gar, f.grid, t, DT)
    all.push(...drainEvents(gar))
    each?.()
  }
  return all
}

describe('the Scrap Hound', () => {
  it('follows the mech\'s trail: the mech walks past where it will be, out of its sight, and it comes after', () => {
    const f = yard().hound([[6, 6]], Math.PI).build()
    const gar = makeGarrison(f, 1)
    const h = gar.units[0]!
    // The mech walks a line from right by the hound away to the east, unseen (behind it).
    const t = at(cellMid(6), cellMid(8), { visible: true })
    const start = Math.hypot(h.x - cellMid(30), h.z - cellMid(8))
    for (let k = 0; k <= 48; k++) {
      t.x = cellMid(6) + k
      run(gar, f, t, 0.25)
    }
    // Now it is far off and keeps still; the hound has been working along the trail.
    t.visible = false
    run(gar, f, t, 10)
    expect(Math.hypot(h.x - cellMid(30), h.z - cellMid(8))).toBeLessThan(start - 10)
  })

  it('smells a body through a wall, and barks the guards over', () => {
    const b = yard().hound([[10, 10]], 0).guard([[10, 4]], Math.PI).guard([[20, 20]], 0)
    b.wall(4, 13, 16, 13)
    const f = b.build()
    const gar = makeGarrison(f, 1)
    const body = gar.units[2]!
    body.x = cellMid(10); body.z = cellMid(14); body.px = body.x; body.pz = body.z
    killUnit(gar, 2, 0, 0, 'blade')
    expect(Math.hypot(body.x - gar.units[0]!.x, body.z - gar.units[0]!.z)).toBeLessThan(HOUND_NOSE)
    const ev = run(gar, f, at(cellMid(40), cellMid(40), { visible: false }), 3)
    expect(ev.some(e => e.type === 'bark')).toBe(true)
    expect(body.found).toBe(true)
    // The guard round it came to look.
    expect(gar.units[1]!.state).not.toBe('patrol')
  })

  it('sniffs out a stripped pile', () => {
    const f = yard().hound([[10, 10]], 0).build()
    const gar = makeGarrison(f, 1)
    noteChange(gar, cellMid(10), 0, cellMid(13), 'pile')
    const ev = run(gar, f, at(cellMid(40), cellMid(40), { visible: false }), 2)
    expect(ev.some(e => e.type === 'bark')).toBe(true)
  })

  it('runs in and bites; one round of anything ends it', () => {
    const f = yard().hound([[10, 10]], 0).build()
    const gar = makeGarrison(f, 1)
    const ev = run(gar, f, at(cellMid(10), cellMid(14)), 8)
    expect(ev.filter(e => e.type === 'fire' && e.damage > 0).length).toBeGreaterThan(0)
    expect(shotDamage('sniper', 'hound', 'body')).toBeGreaterThan(1000)
  })
})

describe('the Engineer', () => {
  it('walks to a beacon the mech put out of action and makes it work again', () => {
    const f = yard().engineer([[10, 10], [12, 10]]).beacon(20, 10).build()
    const gar = makeGarrison(f, 1)
    expect(sabotageBeacon(gar, 0)).toBe(true)
    const ev = run(gar, f, at(cellMid(40), cellMid(40), { visible: false }), REPAIR_S + 12)
    expect(ev.some(e => e.type === 'repair')).toBe(true)
    expect(gar.beacons[0]!.state).toBe('ready')
  })

  it('a searchlight shot out comes back on once it has been fixed', () => {
    const b = yard().engineer([[10, 10], [12, 10]])
    b.searchlight(18, 12, [[18, 18], [22, 18]])
    const f = b.build()
    const gar = makeGarrison(f, 1)
    killUnit(gar, 1, 0, 0)
    run(gar, f, at(cellMid(40), cellMid(40), { visible: false }), REPAIR_S + 14)
    expect(gar.units[1]!.state).not.toBe('dead')
  })

  it('a plain guard does not fix things', () => {
    const f = yard().guard([[10, 10], [12, 10]]).beacon(20, 10).build()
    const gar = makeGarrison(f, 1)
    sabotageBeacon(gar, 0)
    run(gar, f, at(cellMid(40), cellMid(40), { visible: false }), REPAIR_S + 12)
    expect(gar.beacons[0]!.state).toBe('sabotaged')
  })
})

describe('an empty post is filled', () => {
  it('a guard who stood a post is found dead: the nearest guard on a round takes the post', () => {
    const f = yard().guard([[10, 10]], 0).guard([[10, 16], [16, 16]]).build()
    const gar = makeGarrison(f, 1)
    killUnit(gar, 0, cellMid(10), cellMid(30), 'shot')
    // It finds the body, searches the ground round it for a minute (#98), then takes the post.
    run(gar, f, at(cellMid(40), cellMid(40), { visible: false }), 40 + BODY_SEARCH_S)
    const g = gar.units[1]!
    expect(g.route).toHaveLength(0)
    expect(Math.hypot(g.x - cellMid(10), g.z - cellMid(10))).toBeLessThan(1.5)
  })
})

describe('the Bastion', () => {
  it("has an Engineer from level II, and a hound at II (the Sea Fort's robo dog, in a guard's place) and III", () => {
    expect(buildBastion(1).posts.some(p => p.role === 'engineer')).toBe(false)
    expect(buildBastion(2).posts.some(p => p.role === 'engineer')).toBe(true)
    expect(buildBastion(2).posts.some(p => p.kind === 'hound')).toBe(true)
    expect(buildBastion(3).posts.some(p => p.kind === 'hound')).toBe(true)
  })
})
