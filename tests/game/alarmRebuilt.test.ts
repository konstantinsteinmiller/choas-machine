// R34: the alarm, rebuilt. #92 fighters surround the mech instead of coming
// in a line, and only a few fire at once; #71 / #86 everyone hunts where the
// base last had the mech, never its live position, and with beacons only a
// lit one brings the waves; #89 a full alert stands down whatever is still
// alive, machines included.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import {
  CHAOS_COOL_S, FIRE_TOKENS, WAVE_AT_S, drainEvents, isAlive, makeGarrison, noiseAt, stepGarrison, headingTo,
  type GarrisonEvent, type Target
} from '@/game/sim/garrison'
import { stepFire } from '@/game/sim/chaos'

const DT = 1 / 30
const yard = (w = 50): FortressBuilder => {
  const b = new FortressBuilder('t', w, w)
  b.ground(0, 0, w - 1, w - 1).insert(1, 1).extract(w - 2, w - 2)
  return b
}
const at = (x: number, z: number, extra: Partial<Target> = {}): Target => ({ x, y: 0, z, height: 2.6, crouched: false, visible: true, ...extra })
type G = ReturnType<typeof makeGarrison>
type F = ReturnType<FortressBuilder['build']>
const run = (gar: G, f: F, t: Target, s: number, each?: (k: number) => void): GarrisonEvent[] => {
  const all: GarrisonEvent[] = []
  for (let k = 0; k < s / DT; k++) {
    stepGarrison(gar, f.grid, t, DT)
    stepFire(gar, f.grid, t, DT)
    all.push(...drainEvents(gar))
    each?.(k)
  }
  return all
}

describe('surrounding (#92)', () => {
  it('a squad that has the mech in view spreads round it: they come from more than one side', () => {
    const b = yard()
    for (let i = 0; i < 5; i++) b.guard([[6 + i * 2, 6]], 0)
    const f = b.build()
    const gar = makeGarrison(f, 3)
    const t = at(cellMid(25), cellMid(30))
    for (const u of gar.units) { u.state = 'combat'; u.detect = 1; u.fought = true; u.seenX = t.x; u.seenZ = t.z }
    gar.leader = 0
    run(gar, f, t, 14)
    const bearings = gar.units.filter(isAlive).map(u => headingTo(t.x, t.z, u.x, u.z))
    // The spread of their bearings round the mech: more than a quarter turn.
    const sorted = bearings.map(a => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b)
    let gap = 0
    for (let i = 0; i < sorted.length; i++) gap = Math.max(gap, ((sorted[(i + 1) % sorted.length]! - sorted[i]! + Math.PI * 2) % (Math.PI * 2)) || Math.PI * 2)
    // The largest empty arc is well under the whole circle: they are round it, not in one bunch.
    expect(gap).toBeLessThan(Math.PI * 1.5)
  })

  it('only a few fire at once: the attention budget by threat level', () => {
    for (const level of [1, 5]) {
      const b = yard()
      for (let i = 0; i < 7; i++) b.guard([[18 + i * 2, 18]], 0)
      const f = b.build()
      const gar = makeGarrison(f, level)
      const t = at(cellMid(24), cellMid(24))
      for (const u of gar.units) { u.state = 'combat'; u.detect = 1; u.fought = true }
      const firing = new Set<number>()
      let most = 0
      run(gar, f, t, 6, () => { most = Math.max(most, gar.shooters.size) })
      for (const id of gar.shooters) firing.add(id)
      expect(most).toBeLessThanOrEqual(FIRE_TOKENS[level - 1]!)
      expect(most).toBeGreaterThan(0)
    }
  })
})

describe('the alarm (#71, #86)', () => {
  it('a full alert sends everyone to where the mech was last seen, not to where it is', () => {
    const f = yard().guard([[10, 10]], 0).guard([[40, 40]], 0).build()
    const gar = makeGarrison(f, 1)
    const t = at(cellMid(25), cellMid(25), { visible: false })
    gar.lkp = { x: cellMid(12), y: 0, z: cellMid(38), t: 0 }
    noiseAt(gar, t, t.x, t.z, 1e4, 'loud')
    for (const u of gar.units) {
      expect(u.state).toBe('combat')
      expect([u.seenX, u.seenZ]).toEqual([cellMid(12), cellMid(38)])
    }
  })

  it('with beacons, the alarm alone brings no waves: a lit beacon does', () => {
    const f = yard().guard([[10, 10]], 0).beacon(40, 40).reserve(25, 48).reserve(26, 48).build()
    const gar = makeGarrison(f, 1)
    const t = at(cellMid(10), cellMid(12))
    gar.beacons[0]!.state = 'sabotaged'
    noiseAt(gar, t, t.x, t.z, 1e4, 'loud')
    const ev = run(gar, f, { ...t, visible: false }, WAVE_AT_S[0]! + 3)
    expect(ev.some(e => e.type === 'wave')).toBe(false)
  })
})

describe('back to stealth (#89)', () => {
  it('a full alert stands down even with a drone, a searchlight and the Goliath alive', () => {
    const b = yard()
    b.drone([[10, 10], [14, 10]], 6).searchlight(30, 30, [[30, 36], [34, 36]]).goliath(40, 10, 0).guard([[20, 40]], 0)
    const f = b.build()
    const gar = makeGarrison(f, 3)
    const t = at(cellMid(25), cellMid(25))
    noiseAt(gar, t, t.x, t.z, 1e4, 'loud')
    expect(gar.alert.chaos).toBe(true)
    const ev = run(gar, f, { ...t, x: cellMid(2), z: cellMid(47), visible: false }, CHAOS_COOL_S + 40)
    expect(ev.some(e => e.type === 'standDown')).toBe(true)
    expect(gar.alert.chaos).toBe(false)
    expect(gar.units.filter(u => isAlive(u) && u.state === 'combat')).toHaveLength(0)
    expect(gar.heightened).toBe(true)
  })
})
